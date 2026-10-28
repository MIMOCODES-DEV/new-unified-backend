// End-to-end check of the old (pre-V4) app routes as the old TV, Android, iOS and Roku apps call
// them, on one brand of each old backend (ibo, bob, cr7): envelope, AES and signed requests,
// replies decoded like the apps do. Runs against a running API and a real database.
//
//   pnpm cli tenant:set bob legacy.dialect bob && pnpm cli tenant:set cr7 legacy.dialect cr
//   # the app keys, the same test values on ibo, bob and cr7 (KEYS below), e.g.
//   pnpm cli tenant:set-secret ibo legacy.androidAesSecret test-androidAesSecret-value
//   pnpm dev:api          # in another terminal
//   pnpm e2e:legacy       # PORT=3001 pnpm e2e:legacy for another port
import http from 'node:http';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 3000);
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
const KEYS = Object.fromEntries(
  ['androidAesSecret', 'androidAesNewSecret', 'androidSigningSecret', 'tvAesSecret', 'tvSigningSecret', 'tvKey'].map(
    (name) => [name, process.env[`LEGACY_${name}`] ?? `test-${name}-value`],
  ),
);
let passed = 0;
let failed = 0;

function encryptRequest(value) {
  const base64 = Buffer.from(JSON.stringify(value), 'latin1').toString('base64');
  let key = '';
  for (let i = randomInt(20, 30); i > 0; i--) key += ALPHABET[randomInt(ALPHABET.length)];
  const position = randomInt(0, Math.min(base64.length, ALPHABET.length));
  return ALPHABET[position] + ALPHABET[key.length] + base64.slice(0, position) + key + base64.slice(position);
}

function decryptResponse(data) {
  const position = ALPHABET.indexOf(data[data.length - 2]);
  const length = ALPHABET.indexOf(data[data.length - 1]);
  const body = data.slice(0, -2);
  return JSON.parse(Buffer.from(body.slice(0, position) + body.slice(position + length), 'base64').toString('utf8'));
}

/** CryptoJS.AES with a passphrase, as the old Android apps do. */
function keyIv(passphrase, salt) {
  let block = Buffer.alloc(0);
  let all = Buffer.alloc(0);
  while (all.length < 48) {
    block = createHash('md5').update(Buffer.concat([block, Buffer.from(passphrase), salt])).digest();
    all = Buffer.concat([all, block]);
  }
  return { key: all.subarray(0, 32), iv: all.subarray(32, 48) };
}
function aesEncrypt(text, passphrase) {
  const salt = randomBytes(8);
  const { key, iv } = keyIv(passphrase, salt);
  const c = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([Buffer.from('Salted__'), salt, c.update(text, 'utf8'), c.final()]).toString('base64');
}
function aesDecrypt(text, passphrase) {
  const raw = Buffer.from(text, 'base64');
  const { key, iv } = keyIv(passphrase, raw.subarray(8, 16));
  const d = createDecipheriv('aes-256-cbc', key, iv);
  return JSON.parse(Buffer.concat([d.update(raw.subarray(16)), d.final()]).toString('utf8'));
}
const hmac = (key, data) => createHmac('sha256', key).update(data).digest('base64');
const tvUid = (mac) => createHmac('sha1', KEYS.tvSigningSecret).update(mac.toLowerCase() + KEYS.tvAesSecret).digest('base64');

function request(host, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        method,
        path,
        headers: {
          Host: `${host}.localhost`,
          ...headers,
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail === undefined ? '' : ` -> ${JSON.stringify(detail).slice(0, 400)}`}`); }
}

const randomMac = () => Array.from({ length: 6 }, () => randomInt(256).toString(16).padStart(2, '0')).join(':');
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** An envelope route: the request encrypted, the `data` reply decrypted. */
async function envelope(host, path, value, headers) {
  const r = await request(host, 'POST', path, { data: encryptRequest(value) }, headers);
  return { ...r, reply: typeof r.json?.data === 'string' ? decryptResponse(r.json.data) : null };
}
async function signed(host, path, value, { aesKey = KEYS.androidAesNewSecret, signKey = KEYS.androidSigningSecret } = {}) {
  const data = aesEncrypt(JSON.stringify(value), aesKey);
  return request(host, 'POST', path, { data, signature: hmac(signKey, data) });
}

console.log(`Old app routes against 127.0.0.1:${PORT}`);

// ── ibo ─────────────────────────────────────────────────────────────────────────────────────
console.log('\nibo: TV playlist_info');
{
  const st = await request('ibo', 'GET', '/api/status_check');
  check('status_check answers', st.json?.status === 'success' && st.json?.message === 'API is running', st.json);

  const mac = randomMac();
  const first = await envelope('ibo', '/api/playlist_info', { mac_address: mac.toUpperCase(), app_type: 'samsung', version: '1.0.0' });
  const d = first.reply;
  check('a new TV gets a trial: mac_registered false, key as a number, is_trial 0', d?.mac_registered === false && typeof d?.device_key === 'number' && d?.is_trial === 0, d);
  check('expire_date is today + 7 (YYYY-MM-DD)', d?.expire_date === inDays(7), d?.expire_date);
  check('ibo fields: parent_pin "", urls, themes, languages, stalker_enabled', d?.parent_pin === '' && Array.isArray(d?.urls) && d.urls.length > 0 && Array.isArray(d?.themes) && Array.isArray(d?.languages) && d?.stalker_enabled === false, d);
  const again = (await envelope('ibo', '/api/playlist_info', { mac_address: mac, app_type: 'samsung' })).reply;
  check('the same TV again: registered, key as text, same key', again?.mac_registered === true && again?.device_key === String(d?.device_key), again);
  check('the stored parent PIN comes back (0000)', again?.parent_pin === '0000', again?.parent_pin);

  const android = (await envelope('ibo', '/api/playlist_info', { mac_address: randomMac(), app_type: 'android' })).reply;
  check('an Android app gets the update fields and no portal fields', android?.android_version_code === '0' && !('portal_name' in (android?.urls?.[0] ?? {})), android);

  const bad = await request('ibo', 'POST', '/api/playlist_info', { data: 'not an envelope' });
  check('an unreadable envelope: {status: error}', bad.json?.status === 'error', bad.json);
  const noMac = await request('ibo', 'POST', '/api/playlist_info', { data: encryptRequest({ app_type: 'lg' }) });
  check('no MAC: "Request Parameters are incomplete"', noMac.json?.msg === 'Sorry, Request Parameters are incomplete', noMac.json);

  console.log('\nibo: update_playlist (offline sync)');
  const sync = await envelope('ibo', '/api/update_playlist', {
    mac_address: mac,
    playlists: [{ id: 'non_saved_1', playlist_name: 'Synced', origin_url: 'http://line.example.com/synced.m3u' }],
    remove_ids: [],
  });
  const line = Array.isArray(sync.reply) ? sync.reply[0] : null;
  check('a new item is saved; its id comes back next to the app id', line?.id && line?.origin_id === 'non_saved_1' && line?.playlist_name === 'Synced', sync.reply);
  const after = (await envelope('ibo', '/api/playlist_info', { mac_address: mac, app_type: 'samsung' })).reply;
  check('playlist_info lists it', after?.has_own_playlist === true && after?.urls?.some((u) => u.id === line?.id), after?.urls);

  const other = randomMac();
  await envelope('ibo', '/api/playlist_info', { mac_address: other, app_type: 'lg' });
  const theirs = (await envelope('ibo', '/api/update_playlist', { mac_address: other, playlists: [{ id: 'x', playlist_name: 'Theirs', origin_url: 'http://line.example.com/theirs.m3u' }] })).reply?.[0];
  await envelope('ibo', '/api/update_playlist', { mac_address: mac, playlists: [], remove_ids: [theirs?.id] });
  const stillTheirs = (await envelope('ibo', '/api/playlist_info', { mac_address: other, app_type: 'lg' })).reply;
  check("another device's playlist id in remove_ids is ignored", stillTheirs?.urls?.some((u) => u.id === theirs?.id), stillTheirs?.urls);

  await envelope('ibo', '/api/update_playlist', { mac_address: mac, playlists: [], remove_ids: [line?.id] });
  const gone = (await envelope('ibo', '/api/playlist_info', { mac_address: mac, app_type: 'samsung' })).reply;
  check('remove_ids removes its own playlist', gone?.has_own_playlist === false, gone);

  console.log('\nibo: AES and signed routes');
  const aes = await request('ibo', 'POST', '/api/playlist_information', { data: aesEncrypt(JSON.stringify({ mac_address: mac, app_type: 'android' }), KEYS.androidAesSecret) });
  const aesReply = aes.json?.data ? aesDecrypt(aes.json.data, KEYS.androidAesSecret) : null;
  check('playlist_information: AES in, AES out', aesReply?.mac_address === mac, aes.json);
  const aesBad = await request('ibo', 'POST', '/api/playlist_information', { data: aesEncrypt('{}', 'wrong key') });
  check('playlist_information with another key: "Request Unauthorized"', aesBad.json?.msg === 'Sorry, Request Unauthorized', aesBad.json);

  const unsigned = await request('ibo', 'POST', '/api/MBBPj5UwlCmTstXGb/android/playlist_information', { data: 'x' });
  check('signed route without a signature: "Request Unauthorized"', unsigned.json?.msg === 'Sorry, Request Unauthorized', unsigned.json);
  const forged = await request('ibo', 'POST', '/api/MBBPj5UwlCmTstXGb/android/playlist_information', { data: 'x', signature: 'forged' });
  check('a wrong signature: "Request Security Issue"', forged.json?.msg === 'Sorry, Request Security Issue', forged.json);
  const amac = randomMac();
  const v2 = await signed('ibo', '/api/MBBPj5UwlCmTstXGb/android/playlist_information', { mac_address: amac, app_type: 'android', u_id: 'install-1' });
  const v2Reply = v2.json?.data ? aesDecrypt(v2.json.data, KEYS.androidAesNewSecret) : null;
  check('signed Android route: a new device, its u_id back, AES reply', v2Reply?.mac_registered === false && v2Reply?.u_id === 'install-1', v2.json);
  const v2Tv = await signed('ibo', '/api/MBBPj5UwlCmTstXGb/android/playlist_information', { mac_address: randomMac(), app_type: 'samsung' });
  check('ibo answers a TV on the v2 route with {status: failed}', v2Tv.json?.status === 'failed' && v2Tv.json?.message === 'ok', v2Tv.json);

  const tvKeys = { aesKey: KEYS.tvAesSecret, signKey: KEYS.tvSigningSecret };
  const tmac = randomMac();
  const v3Bad = await signed('ibo', '/api/MBBPj5UwlCmTstXGb/tv/v3/playlist_information', { mac_address: tmac, app_type: 'lg', u_id: 'made-up' }, tvKeys);
  check('TV v3 with a u_id not made from the MAC: "Code 3"', v3Bad.json?.msg === 'Sorry, Request Security Issue Code 3', v3Bad.json);
  const v3 = await signed('ibo', '/api/MBBPj5UwlCmTstXGb/tv/v3/playlist_information', { mac_address: tmac, app_type: 'lg', u_id: tvUid(tmac) }, tvKeys);
  const v3Reply = v3.json?.data ? aesDecrypt(v3.json.data, KEYS.tvAesSecret) : null;
  check('TV v3 with the right u_id: device info', v3Reply?.mac_address === tmac, v3.json);
  const v3NoKey = await signed('ibo', '/api/MBBPj5UwlCmTstXGb/tv/v3/playlist_information', { mac_address: tmac, app_type: 'lg', u_id: tvUid(tmac) }, tvKeys);
  check('TV v3 again without its device key: "Device is not valid"', v3NoKey.json?.msg === 'Sorry, Device is not valid', v3NoKey.json);

  const active = await request('ibo', 'POST', '/api/check_active_status', { data: aesEncrypt(JSON.stringify({ mac_address: mac }), KEYS.androidAesSecret) });
  const activeReply = active.json?.data ? aesDecrypt(active.json.data, KEYS.androidAesSecret) : null;
  check('check_active_status: the expiry date', activeReply?.status === 'success' && activeReply?.expire_date === inDays(7), activeReply);

  const cap = await request('ibo', 'POST', '/api/v4/recaptcha', { mac_address: randomMac() });
  check('v4/recaptcha (ibo): picture and token', cap.json?.status === 'success' && cap.json?.captcha?.includes('<svg') && cap.json?.token, cap.json);
}

console.log('\nibo: Roku routes');
{
  const mac = randomMac();
  const login = await request('ibo', 'POST', '/api/device_login', { mac, model: 'roku', app_version: '1.0' });
  const token = login.json?.message;
  const dev = login.json?.message2?.device;
  check('device_login: a token and the device (trial: payed false, free_trial 1)', typeof token === 'string' && dev?.payed === false && dev?.free_trial === 1 && dev?.mac === mac, login.json);
  check('free_trial_expired is an ISO time 7 days out', dev?.free_trial_expired === `${inDays(7)}T00:00:00.000Z`, dev?.free_trial_expired);
  const reg = await request('ibo', 'POST', '/api/register_device', { mac });
  check('register_device: the token inside message', reg.json?.message?.token === token && reg.json?.status === 200, reg.json);

  const add = await request('ibo', 'POST', '/api/playlist', { name: 'Roku list', url: 'http://line.example.com/roku.m3u' }, { Authorization: token });
  check('POST playlist with the token adds it', add.json?.error === false && add.json?.message?.id, add.json);
  const list = await request('ibo', 'GET', '/api/playlist', undefined, { Authorization: token });
  check('GET playlist lists it (Roku shape: name, categories)', list.json?.message?.some((p) => p.id === add.json?.message?.id && p.name === 'Roku list' && 'categories' in p), list.json);
  const status = await request('ibo', 'POST', '/api/validate_status', undefined, { Authorization: token });
  check('validate_status: auth_type device_key and the playlists', status.json?.message?.auth_type === 'device_key' && status.json?.message?.playlists?.length === 1, status.json);
  const trial = await request('ibo', 'POST', '/api/activate_free_trial', undefined, { Authorization: token });
  check('activate_free_trial gives the token back', trial.json?.message === token, trial.json);
  const none = await request('ibo', 'POST', '/api/validate_status');
  check('no token: "Not Authorized!" 401', none.json?.status === 401 && none.json?.message === 'Not Authorized!', none.json);
  const forged = await request('ibo', 'POST', '/api/validate_status', undefined, { Authorization: 'forged' });
  check('a forged token: "device not found!"', forged.json?.status === 404, forged.json);
}

console.log('\nibo: old iOS app');
{
  const mac = randomMac();
  const login = await request('ibo', 'POST', '/api/ios/v2/device_login', { mac, uid: 'ios-install-1', app_type: 'iOS' });
  check('ios/v2 device_login: a token and the device', typeof login.json?.message === 'string' && login.json?.message2?.device?.mac === mac, login.json);
  const other = await request('ibo', 'POST', '/api/ios/v2/device_login', { mac, uid: 'ios-install-2' });
  check('another uid: "Device UID mismatch!"', other.json?.message === 'Device UID mismatch!', other.json);
  const reset = await request('ibo', 'POST', '/api/ios/v2/reset_uid', { mac, uid: 'ios-install-2' });
  check('reset_uid binds the new uid', typeof reset.json?.message === 'string', reset.json);
  const same = await request('ibo', 'POST', '/api/ios/v2/reset_uid', { mac, uid: 'ios-install-2' });
  check('reset_uid with the same uid: "No changes applied"', same.json?.message === 'Device UID matched! No changes applied', same.json);
  const now = await request('ibo', 'POST', '/api/ios/v2/device_login', { mac, uid: 'ios-install-2' });
  check('the new uid logs in', typeof now.json?.message === 'string', now.json);
}

// ── bob ─────────────────────────────────────────────────────────────────────────────────────
console.log('\nbob');
{
  const mac = randomMac();
  const first = await envelope('bob', '/api/playlist_info', { mac_address: mac, app_type: 'lg' });
  const d = first.reply;
  check('bob playlist_info: languages also outside the envelope', Array.isArray(first.json?.languages), first.json);
  check('bob fields: real_time_notification, trial_days as text, status, mac_address', d?.real_time_notification === '0' && d?.trial_days === '7' && d?.status === 'success' && d?.mac_address === mac && !('parent_pin' in d), d);
  const v3 = await signed('bob', '/api/MBBPj5UwlCmTstXGb/tv/v3/playlist_information', { mac_address: mac, app_type: 'lg' });
  const v3Reply = v3.json?.data ? aesDecrypt(v3.json.data, KEYS.androidAesNewSecret) : null;
  check('bob TV v3: the Android keys, no u_id', v3Reply?.mac_address === mac, v3.json);
  const mx = await signed('bob', '/api/Mxcvfghytrhjsjj/tv/playlist_information', { mac_address: mac, app_type: 'lg' });
  check('bob Mxcv… TV route answers', mx.json?.data && aesDecrypt(mx.json.data, KEYS.androidAesNewSecret)?.mac_address === mac, mx.json);
  const setting = await request('bob', 'GET', `/api/get_app_setting/${mac}`);
  check('get_app_setting: {status: success}', setting.json?.status === 'success', setting.json);

  const add = await signed('bob', '/api/MBBPj5UwlCmTstXGb/manage/add_playlist', { mac_address: mac, playListName: 'Signed', playListURL: 'http://line.example.com/signed.m3u', playlist_type: 'general' });
  check('signed manage/add_playlist adds', add.json?.msg === 'Playlist added successfully', add.json);
  const missing = await signed('bob', '/api/MBBPj5UwlCmTstXGb/manage/delete_playlist', { mac_address: mac, playlistId: 'not-a-playlist' });
  check('signed delete of an unknown id: "could not find playlist"', missing.json?.result === 'Sorry, we could not find playlist', missing.json);
  const unknown = await signed('bob', '/api/MBBPj5UwlCmTstXGb/manage/add_playlist', { mac_address: '.*', playListName: 'x', playListURL: 'http://x.example.com/', playlist_type: 'general' });
  check('a MAC that is a pattern finds no device', unknown.json?.msg?.startsWith('Sorry, device not found'), unknown.json);
}

// ── cr7 ─────────────────────────────────────────────────────────────────────────────────────
console.log('\ncr7');
{
  const mac = randomMac();
  const d = (await envelope('cr7', '/api/playlist_info', { mac_address: mac, app_type: 'samsung' })).reply;
  check('cr playlist_info: notifications, themes, status, no parent_pin', Array.isArray(d?.notifications) && Array.isArray(d?.themes) && d?.status === 'success' && !('parent_pin' in d), d);

  const tv = randomMac();
  const auth = { Authorization: `Bearer ${KEYS.tvKey}` };
  const noKey = await envelope('cr7', '/api/tv/v4/playlist_info', { mac_address: tv, app_type: 'samsung' });
  check('tv/v4 without the app key: 401', noKey.status === 401 && noKey.reply?.message === 'Tv key token is required', noKey);
  const wrongKey = await envelope('cr7', '/api/tv/v4/playlist_info', { mac_address: tv, app_type: 'samsung' }, { Authorization: 'Bearer wrong' });
  check('tv/v4 with another key: 403', wrongKey.status === 403 && wrongKey.reply?.message === 'Invalid TV key token', wrongKey);
  const first = await envelope('cr7', '/api/tv/v4/playlist_info', { mac_address: tv, app_type: 'samsung' }, auth);
  check('a new TV: captcha_required with a picture', first.reply?.status === 'captcha_required' && first.reply?.captcha?.includes('<svg'), first.reply);
  // A captcha of our own for this MAC: the wrong code below uses it up, as a guess would.
  await request('cr7', 'POST', '/dev/devices/captcha', { kind: 'v4', mac: tv, length: 2 });
  const wrong = await envelope('cr7', '/api/tv/v4/playlist_info', { mac_address: tv, app_type: 'samsung', recaptcha_code: 'ZZ' }, auth);
  check('a wrong code: "Invalid captcha code" and a new picture', wrong.reply?.message === 'Invalid captcha code' && wrong.reply?.captcha, wrong.reply);
  const cap2 = await request('cr7', 'POST', '/dev/devices/captcha', { kind: 'v4', mac: tv, length: 2, revealAnswer: true });
  const ok1 = await envelope('cr7', '/api/tv/v4/playlist_info', { mac_address: tv, app_type: 'samsung', recaptcha_code: cap2.json?.answer }, auth);
  check('the typed code: device info with apiVersion v4', ok1.reply?.status === 'success' && ok1.reply?.apiVersion === 'v4', ok1.reply);
  const ok2 = await envelope('cr7', '/api/tv/v4/playlist_info', { mac_address: tv, app_type: 'samsung', recaptcha_code: cap2.json?.answer }, auth);
  check('the same code on the next start still works', ok2.reply?.status === 'success', ok2.reply);
  const old = (await envelope('cr7', '/api/playlist_info', { mac_address: tv, app_type: 'samsung' })).reply;
  check('after tv/v4, the old playlist_info refuses it: "error version"', old?.message === 'error version', old);

  const crCap = await request('cr7', 'POST', '/api/v4/recaptcha', { mac_address: randomMac() });
  check('v4/recaptcha (cr): a picture, no token', crCap.json?.captcha?.includes('<svg') && !('token' in (crCap.json ?? {})), crCap.json);

  const added = await envelope('cr7', '/api/add_playlist', { mac_address: mac, playlist_name: 'Added', url: 'http://provider.example:8080/get.php?username=u&password=p&type=m3u_plus' });
  check('add_playlist: the playlist in the envelope and status success', added.json?.status === 'success' && added.reply?.id && added.reply?.playlist_name === 'Added', added.json);
  const dup = await request('cr7', 'POST', '/api/add_playlist', { data: encryptRequest({ mac_address: mac, playlist_name: 'Again', url: 'http://provider.example:8080/get.php?username=u&password=p&type=m3u_plus' }) });
  check('the same playlist again: 500 "Playlist already exists"', dup.status === 500 && dup.json?.msg === 'Playlist already exists', dup);
  const noName = await request('cr7', 'POST', '/api/add_playlist', { data: encryptRequest({ mac_address: mac, url: 'http://x.example.com/' }) });
  check('add_playlist without a name: 400', noName.status === 400, noName.json);
  const removed = await envelope('cr7', '/api/remove_playlist', { mac_address: mac, id: added.reply?.id });
  check('remove_playlist removes it', removed.reply?.msg === 'Playlist removed successfully', removed.reply);
  const again = await envelope('cr7', '/api/remove_playlist', { mac_address: mac, id: added.reply?.id });
  check('removing it again: "you don\'t have permission"', again.reply?.msg === "Sorry, you don't have permission", again.reply);

  const sync = await envelope('cr7', '/api/update_playlist', { mac_address: mac, playlists: [{ id: -1, name: 'From CRPlayer', url: 'http://line.example.com/cr.m3u' }], remove_ids: ['non_saved_9'] });
  check('update_playlist reads CRPlayer\'s `name`; origin_id keeps the app\'s number', sync.reply?.[0]?.playlist_name === 'From CRPlayer' && sync.reply?.[0]?.origin_id === -1, sync.reply);

  const smartNoId = await request('cr7', 'POST', '/api/device_info', { data: encryptRequest({ app_type: 'samsung' }) });
  check('smart TV device_info without an app device id is refused', smartNoId.json?.status === 'error2', smartNoId.json);
  const smart = await envelope('cr7', '/api/device_info', { app_type: 'samsung', app_device_id: `tizen-${randomInt(1e9)}` });
  check('smart TV device_info: a made-up MAC and the demo playlist', /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(smart.reply?.mac_address ?? '') && smart.reply?.playlists?.[0]?.id === 'demo', smart.reply);

  console.log('\ncr7: old Android app');
  const amac = randomMac();
  const noCap = await request('cr7', 'POST', '/api/android/v3/device_login', { mac: amac, uid: 'android-1' });
  check('a new Android device without a captcha is refused', noCap.json?.message === 'incorrect request parameters! Cpatcha Needed To Register Device.', noCap.json);
  const gen = await request('cr7', 'POST', '/api/android/v3/generate_captcha');
  check('generate_captcha: picture and token', gen.json?.svg?.includes('<svg') && gen.json?.token, gen.json);
  const badCap = await request('cr7', 'POST', '/api/android/v3/device_login', { mac: amac, uid: 'android-1', captcha: 'WRONG1', captcha_token: gen.json?.token });
  check('a wrong captcha: 400 "Captcha is incorrect or expired"', badCap.status === 400 && badCap.json?.message === 'Captcha is incorrect or expired', badCap.json);
  const webCap = await request('cr7', 'POST', '/dev/devices/captcha', { kind: 'web', length: 6, revealAnswer: true });
  const login = await request('cr7', 'POST', '/api/android/v3/device_login', { mac: amac, uid: 'android-1', captcha: webCap.json?.answer, captcha_token: webCap.json?.token });
  check('the right captcha registers the device', typeof login.json?.message === 'string' && login.json?.message2?.device?.mac === amac, login.json);
  const back = await request('cr7', 'POST', '/api/android/v3/device_login', { mac: amac, uid: 'android-1' });
  check('the registered device logs in again without a captcha', typeof back.json?.message === 'string', back.json);
  const list = await request('cr7', 'GET', '/api/android/v3/playlist', undefined, { Authorization: login.json?.message });
  check('GET android/v3/playlist answers (the old one always failed)', list.json?.error === false && Array.isArray(list.json?.message), list.json);
}

// ── recovery (Phase 4) ──────────────────────────────────────────────────────────────────────
console.log('\nrecovery: the code from the website, typed on the new TV');
{
  /** A TV that opened the old app once; paid when asked. */
  const tvOn = async (host, paid) => {
    const mac = randomMac();
    await envelope(host, '/api/playlist_info', { mac_address: mac, app_type: 'lg' });
    if (paid) await request(host, 'POST', `/dev/licenses/${mac}/activate`, { type: 'yearly', source: 'admin', sourceId: `e2e-${randomInt(1e9)}` });
    return mac;
  };
  const codeFor = async (host, mac) => (await request(host, 'POST', `/dev/licenses/${mac}/recovery-code`)).json?.code;

  const oldTv = await tvOn('cr7', true);
  await request('cr7', 'POST', `/dev/playlists/${oldTv}/add`, { name: 'Kept', source: { kind: 'link', url: 'http://line.example.com/kept.m3u' } });
  const newTv = await tvOn('cr7', false);
  const code = await codeFor('cr7', oldTv);
  const missing = await request('cr7', 'POST', '/api/tv/v3/recover-summary', { recovery_code: code });
  check('recover-summary without a MAC: 400', missing.status === 400 && missing.json?.status === false, missing.json);
  const wrong = await request('cr7', 'POST', '/api/tv/v3/recover-summary', { recovery_code: 'ZZZZZZZZ', mac_address: newTv });
  check('a wrong code: 404 "Invalid recovery code"', wrong.status === 404 && wrong.json?.msg === 'Invalid recovery code', wrong.json);
  const unknown = await request('cr7', 'POST', '/api/tv/v3/recover-summary', { recovery_code: code, mac_address: randomMac() });
  check('a new TV that never opened the app: 404', unknown.status === 404 && unknown.json?.msg?.startsWith('New device is not registered'), unknown.json);
  const summary = await request('cr7', 'POST', '/api/tv/v3/recover-summary', { recovery_code: code, mac_address: newTv });
  check('recover-summary: what moves (1 playlist, a year), nothing changed yet', summary.json?.status === true && summary.json?.summary?.old_device?.playlist_count === 1 && summary.json?.summary?.after_recovery?.is_trial === 3 && summary.json?.msg?.includes('1 playlist'), summary.json);
  const done = await request('cr7', 'POST', '/api/tv/v3/recover-my-device', { recovery_code: code, mac_address: newTv });
  check('recover-my-device moves the device to the new MAC', done.json?.status === true && done.json?.data?.old_mac_address === oldTv && done.json?.data?.new_mac_address === newTv && done.json?.data?.is_trial === 3, done.json);
  const info = (await envelope('cr7', '/api/playlist_info', { mac_address: newTv, app_type: 'lg' })).reply;
  check('the new TV now has the year and the playlist', info?.is_trial === 3 && info?.urls?.some((u) => u.playlist_name === 'Kept'), info);
  const reused = await request('cr7', 'POST', '/api/tv/v3/recover-my-device', { recovery_code: code, mac_address: newTv });
  check('the code works once', reused.status === 404, reused.json);

  // V4 apply_recovery: the new TV is logged in (a Roku-style token of an lg device stands in for its V4 token).
  const old2 = await tvOn('ibo', true);
  const new2 = randomMac();
  const login = await request('ibo', 'POST', '/api/device_login', { mac: new2, model: 'lg' });
  const auth = { Authorization: `Bearer ${login.json?.message}` };
  const code2 = await codeFor('ibo', old2);
  const noToken = await request('ibo', 'POST', '/api/lg/v4/apply_recovery', { recovery_code: code2, new_mac_address: new2, app_type: 'lg' });
  check('apply_recovery without a token: 401', noToken.status === 401, noToken.json);
  const otherRoute = await request('ibo', 'POST', '/api/samsung/v4/apply_recovery', { recovery_code: code2, new_mac_address: new2, app_type: 'samsung' }, auth);
  check('a token of another app type: 403', otherRoute.status === 403, otherRoute.json);
  const fields = await request('ibo', 'POST', '/api/lg/v4/apply_recovery', { recovery_code: code2 }, auth);
  check('missing fields: the old message', fields.json?.message === 'recovery_code, new_mac_address, and app_type are required.', fields.json);
  const elsewhere = await request('ibo', 'POST', '/api/lg/v4/apply_recovery', { recovery_code: code2, new_mac_address: randomMac(), app_type: 'lg' }, auth);
  check("another TV's MAC with this token: 403 (the old route took any token)", elsewhere.status === 403, elsewhere.json);
  const bad = await request('ibo', 'POST', '/api/lg/v4/apply_recovery', { recovery_code: 'ZZZZZZZZ', new_mac_address: new2, app_type: 'lg' }, auth);
  check('a wrong code: "Invalid or expired recovery code."', bad.json?.message === 'Invalid or expired recovery code.', bad.json);
  const applied = await request('ibo', 'POST', '/api/lg/v4/apply_recovery', { recovery_code: code2, new_mac_address: new2, app_type: 'lg' }, auth);
  check('apply_recovery moves the paid device to this TV', applied.json?.status === 'success' && applied.json?.mac_address === new2 && applied.json?.is_trial === 3, applied.json);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
