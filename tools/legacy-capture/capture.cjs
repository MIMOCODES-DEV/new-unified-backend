// CAP-04: record real request/response pairs from the old backends running locally (see start-backends.sh).
// Requests are encoded with the TV apps' OWN encoder; responses are recorded raw and decoded with the apps' decoder.
// Captcha answers are read from the *_cap database copy, so the V4 login flow can complete unattended.
//
// Usage: node tools/legacy-capture/capture.cjs <tvAppsDir> <outDir>
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { loadApp } = require('../legacy-analysis/legacy-loader.cjs');

const [tvAppsDir, outDir] = process.argv.slice(2);
if (!tvAppsDir || !outDir) {
  console.error('Usage: node capture.cjs <tvAppsDir> <outDir>');
  process.exit(1);
}

const MONGO = 'mongodb://127.0.0.1:27017/?directConnection=true';
const FAKE = { store: 'fake-store-key', tvKeyV4: 'fake-tv-key-v4' };
const TARGETS = [
  { name: 'iboplayer', base: 'http://127.0.0.1:5101', host: 'localhost', db: 'ibo_cap' },
  { name: 'bobplayer', base: 'http://127.0.0.1:5102', host: 'localhost', db: 'BobPlayer_cap' },
  { name: 'cr-unified', base: 'http://127.0.0.1:5103', host: 'cr7.localhost', db: 'cr7_cap', cr: true },
];

let seed = 5000;
const app = () => loadApp(tvAppsDir, 'bobplayer-app', ++seed);
const encode = (body) => app().encryptRequest(body);
const tryDecode = (text) => {
  try {
    const json = JSON.parse(text);
    if (json && typeof json.data === 'string' && json.data.length > 4) return { decoded: app().decryptResponse(json) };
    return { json };
  } catch {
    return {};
  }
};

async function call(t, name, method, urlPath, { form, json, headers = {} } = {}) {
  const h = { host: t.host, ...headers };
  let body;
  if (form) {
    body = new URLSearchParams(form).toString();
    h['content-type'] = 'application/x-www-form-urlencoded';
  } else if (json) {
    body = JSON.stringify(json);
    h['content-type'] = 'application/json';
  }
  let status, contentType, text;
  try {
    const res = await fetch(t.base + urlPath, { method, headers: h, body, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    status = res.status;
    contentType = res.headers.get('content-type');
    text = await res.text();
  } catch (e) {
    status = 0;
    text = `[no response: ${e.name}]`;
  }
  const record = { name, request: { method, path: urlPath, headers: h, form, json }, response: { status, contentType, body: text.length > 20000 ? `${text.slice(0, 20000)}…[truncated]` : text, ...tryDecode(text) } };
  return record;
}

async function captchaText(client, db, token) {
  const doc = await client.db(db).collection('recaptchatokens').findOne({ token });
  return doc ? doc.captchaText : null;
}

async function captureTarget(client, t) {
  const records = [];
  const rec = async (...args) => {
    const r = await call(t, ...args);
    records.push(r);
    return r;
  };
  const MAC1 = 'cc:00:00:00:00:01';
  const MAC2 = 'cc:00:00:00:00:02';

  await rec('status_check', 'GET', '/api/status_check');

  // Legacy Samsung/LG call (obfuscated envelope, form body): first contact registers, second returns the device.
  const legacy = { mac_address: MAC1, app_type: 'samsung', version: '1.1.5' };
  await rec('legacy playlist_info (new device)', 'POST', '/api/playlist_info', { form: { data: encode(legacy) } });
  await rec('legacy playlist_info (same device again)', 'POST', '/api/playlist_info', { form: { data: encode(legacy) } });
  await rec('changeParentPin', 'POST', '/api/changeParentPin', { form: { data: encode({ mac_address: MAC1, pin_code: '1234' }) } });
  await rec('update_playlist (bulk sync)', 'POST', '/api/update_playlist', {
    form: { data: encode({ mac_address: MAC1, app_type: 'samsung', playlists: [{ id: -1, url: 'http://provider.example:8080/get.php?username=u&password=p&type=m3u&output=hls', name: 'Captured' }], remove_ids: [] }) },
  });

  // V4 flow, exactly as BobPlayer does it (JSON {data: envelope}, Bearer device token after login).
  const v4 = { mac_address: MAC2, app_type: 'lg', u_id: 'ACDE13', version: '1.0.7' };
  const cap = await rec('v4 recaptcha', 'POST', '/api/lg/v4/recaptcha', { json: { mac_address: MAC2, app_type: 'lg' } });
  const capToken = cap.response.json?.token;
  const answer = capToken ? await captchaText(client, t.db, capToken) : null;
  const login = await rec('v4 device_login', 'POST', '/api/lg/v4/device_login', { json: { data: encode({ ...v4, recaptcha_code: answer, recaptcha_token: capToken }) } });
  const deviceToken = login.response.decoded?.token ?? login.response.json?.token;
  const auth = deviceToken ? { authorization: `Bearer ${deviceToken}` } : {};
  await rec('v4 device_info', 'POST', '/api/lg/v4/device_info', { json: { data: encode(v4) }, headers: auth });
  const add = await rec('v4 manage/add_playlist', 'POST', '/api/lg/v4/manage/add_playlist', {
    json: { data: encode({ ...v4, playListName: 'Captured XC', playListURL: 'http://provider.example:8080', username: 'u', password: 'p', playlist_type: 'xc', is_protected: 0 }) },
    headers: auth,
  });
  const added = add.response.json ?? add.response.decoded;
  const playlistId = added?.playlist?.id ?? added?.playlist?._id;
  await rec('v4 manage/update_playlist', 'POST', '/api/lg/v4/manage/update_playlist', {
    json: { data: encode({ ...v4, playlistId, playListName: 'Captured XC renamed', playListURL: 'http://provider.example:8080', username: 'u', password: 'p', playlist_type: 'xc', is_protected: 0 }) },
    headers: auth,
  });
  await rec('v4 manage/delete_playlist', 'POST', '/api/lg/v4/manage/delete_playlist', { json: { data: encode({ ...v4, playlistId }) }, headers: auth });
  await rec('v4 device/add (StarArcs, outbound blocked)', 'POST', '/api/lg/v4/device/add', { json: { data: encode({ mac_address: MAC2, app_type: 'lg' }) }, headers: auth });
  await rec('v4 device_info without token', 'POST', '/api/lg/v4/device_info', { json: { data: encode(v4) } });

  // External store contract.
  // The store sends the MAC as `macAddress` (camelCase).
  await rec('store validate-mac-address', 'POST', '/api/validate-mac-address', { json: { macAddress: MAC1 }, headers: { token: FAKE.store } });
  await rec('store validate-mac-address (wrong token)', 'POST', '/api/validate-mac-address', { json: { macAddress: MAC1 }, headers: { token: 'wrong' } });
  await rec('store validate-mac-address (unknown MAC)', 'POST', '/api/validate-mac-address', { json: { macAddress: 'cc:00:00:00:99:99' }, headers: { token: FAKE.store } });

  // CRPlayer's own calls (cr only).
  if (t.cr) {
    const MAC3 = 'cc:00:00:00:00:03';
    const tvAuth = { authorization: `Bearer ${FAKE.tvKeyV4}` };
    const crCap = await rec('crplayer v4/recaptcha', 'POST', '/api/v4/recaptcha', { form: { mac_address: MAC3 }, headers: tvAuth });
    // CRPlayer's captcha call returns only the SVG (no token): read the answer of the newest captcha.
    const crToken = crCap.response.json?.token;
    const newest = await client.db(t.db).collection('recaptchatokens').find().sort({ _id: -1 }).limit(1).next();
    const crAnswer = crToken ? await captchaText(client, t.db, crToken) : newest?.captchaText;
    await rec('crplayer tv/v4/playlist_info', 'POST', '/api/tv/v4/playlist_info', {
      form: { data: encode({ mac_address: MAC3, app_type: 'samsung', version: '1.0.0', recaptcha_code: crAnswer ?? 'XXXX' }), token: FAKE.tvKeyV4 },
      headers: { ...tvAuth, accept: 'application/json' },
    });
    const crAdd = await rec('crplayer add_playlist', 'POST', '/api/add_playlist', {
      form: { data: encode({ url: 'http://provider.example:8080/get.php?username=u&password=p&type=m3u&output=hls', playlist_name: 'Captured', mac_address: MAC3, app_type: 'samsung' }) },
    });
    const crId = crAdd.response.decoded?._id ?? crAdd.response.decoded?.id;
    await rec('crplayer edit_playlist (status sync)', 'PUT', '/api/edit_playlist', { form: { mac_address: MAC3, id: crId ?? '', expiration_date: '2027-01-01', status: 'Active', auth: '1', fetched_at: '2026-10-15' } });
    await rec('crplayer remove_playlist', 'POST', '/api/remove_playlist', { form: { data: encode({ mac_address: MAC3, app_type: 'samsung', id: crId ?? '' }) } });
    await rec('cr unknown host', 'GET', '/api/status_check', { headers: { host: 'unknown.example' } });
    await rec('cr substring host (xibo.*)', 'GET', '/api/status_check', { headers: { host: 'xibo.example' } });
  }
  // Crash probe, always LAST: a store request without macAddress. Records whether the backend survives it.
  await rec('CRASH PROBE store validate-mac-address without macAddress', 'POST', '/api/validate-mac-address', { json: { mac_address: MAC1 }, headers: { token: FAKE.store } });
  const after = await call(t, 'status_check after crash probe', 'GET', '/api/status_check');
  records.push({ ...after, note: after.response.status === 0 ? 'Backend did not answer: the previous request killed it.' : 'Backend still answering.' });
  return records;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const client = await MongoClient.connect(MONGO);
  try {
    for (const t of TARGETS) {
      const records = await captureTarget(client, t);
      fs.writeFileSync(path.join(outDir, `${t.name}.json`), JSON.stringify({ backend: t.name, capturedAt: new Date().toISOString(), database: t.db, note: 'Recorded from the old backend running locally in a sandbox against a database copy, with fake keys. Regenerate with tools/legacy-capture/capture.cjs.', records }, null, 2) + '\n');
      console.log(`${t.name}: ${records.map((r) => `${r.response.status}`).join(' ')}`);
    }
  } finally {
    await client.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
