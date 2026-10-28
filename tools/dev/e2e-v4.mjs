// End-to-end check of the V4 app routes (/api/<app type>/v4/...) as the IBO, Bob and CR apps call
// them: requests in the apps' envelope, replies decoded like the apps do. Runs against a running
// API and a real database; the dev routes stand in for what a person does (read a captcha, pay).
//
//   pnpm dev:api          # in another terminal
//   pnpm e2e:v4           # PORT=3001 pnpm e2e:v4 for another port
//
// device/add relays StarArcs: to check the relay, start the API with
// STARARCS_URL=http://127.0.0.1:3998 STARARCS_GUEST_TOKEN=<any> and the brand's stararcs.appName set,
// then run with STARARCS_STUB_PORT=3998 (the script plays StarArcs on that port).
import http from 'node:http';
import { randomInt } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 3000);
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
let passed = 0;
let failed = 0;

/** What the apps' encryptRequest does: a random key inside the base64, its place and length in front. */
function encryptRequest(value) {
  const base64 = Buffer.from(JSON.stringify(value), 'latin1').toString('base64');
  let key = '';
  for (let i = randomInt(20, 30); i > 0; i--) key += ALPHABET[randomInt(ALPHABET.length)];
  const position = randomInt(0, Math.min(base64.length, ALPHABET.length));
  return ALPHABET[position] + ALPHABET[key.length] + base64.slice(0, position) + key + base64.slice(position);
}

/** What the apps' decryptResponse does: place and length at the end, remove the key, decode. */
function decryptResponse(reply) {
  const data = reply.data;
  const position = ALPHABET.indexOf(data[data.length - 2]);
  const length = ALPHABET.indexOf(data[data.length - 1]);
  const body = data.slice(0, -2);
  return JSON.parse(Buffer.from(body.slice(0, position) + body.slice(position + length), 'base64').toString('utf8'));
}

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        method,
        path,
        headers: {
          Host: 'ibo.localhost',
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
function check(name, condition, detail) {
  if (condition) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + '  ' + JSON.stringify(detail).slice(0, 400)); }
}
const hex = () => randomInt(256).toString(16).padStart(2, '0');
const mac = 'ad:' + Array.from({ length: 5 }, hex).join(':');
const V4 = '/api/lg/v4/';
const enc = async (path, payload, headers) => {
  const res = await request('POST', V4 + path, { data: encryptRequest(payload) }, headers);
  return { status: res.status, body: res.json?.data ? decryptResponse(res.json) : res.json };
};
const app = (extra = {}) => ({ mac_address: mac, app_type: 'lg', u_id: 'QW12ER', version: '4.1.0', ...extra });

console.log('recaptcha and device_login');
const first = await request('POST', V4 + 'recaptcha', { mac_address: mac, app_type: 'lg' });
check('a new MAC gets a captcha picture and a token', first.json?.status === 'success' &&
  first.json.captcha?.startsWith('<svg') && first.json.token, first.json);
const noCaptcha = await enc('device_login', app());
check('login without the captcha is refused', noCaptcha.body?.message === 'Captcha code and token are required', noCaptcha.body);
// A person reads the picture; the dev route gives a captcha for this MAC with its answer.
const solvable = (await request('POST', '/dev/devices/captcha', { mac, platform: 'lg', revealAnswer: true })).json;
const wrong = await enc('device_login', app({ recaptcha_code: 'ZZZZ', recaptcha_token: solvable.token }));
check('a wrong answer is refused with error_code 401', wrong.body?.error_code === 401, wrong.body);
const solvable2 = (await request('POST', '/dev/devices/captcha', { mac, platform: 'lg', revealAnswer: true })).json;
const login = await enc('device_login', app({ recaptcha_code: solvable2.answer, recaptcha_token: solvable2.token }));
check('the right answer logs in and gives a device token', login.body?.status === 'success' && login.body.token, login.body);
const token = login.body.token;
const again = await request('POST', V4 + 'recaptcha', { mac_address: mac, app_type: 'lg' });
check('the next start skips the captcha (already_verified)', again.json?.status === 'already_verified', again.json);
const relogin = await enc('device_login', app());
check('the next login needs no captcha', relogin.body?.status === 'success', relogin.body);

console.log('device_info');
const auth = { Authorization: 'Bearer ' + token };
const info = await enc('device_info', app(), auth);
check('a new device is a trial (is_trial 0) with a future expire_date', info.body?.status === 'success' &&
  info.body.is_trial === 0 && info.body.expire_date > new Date().toISOString().slice(0, 10), info.body);
check('it has a 6-digit device key and parental PIN 0000', /^\d{6}$/.test(info.body.device_key) && info.body.parent_pin === '0000', info.body);
check('no playlists yet: has_own_playlist false', info.body.has_own_playlist === false && Array.isArray(info.body.urls), info.body);
const noToken = await enc('device_info', app());
const badToken = await enc('device_info', app(), { Authorization: 'Bearer bm90LWEtdG9rZW4=' });
check('device_info without a token is refused (401)', noToken.status === 401, noToken);
check('device_info with a forged token is refused (403)', badToken.status === 403, badToken);
const otherMac = await enc('device_info', app({ mac_address: 'ad:00:00:00:00:01' }), auth);
check('a token for another MAC is refused (403)', otherMac.status === 403, otherMac);

console.log('what the person does elsewhere shows up in the app');
await request('POST', `/dev/playlists/${mac}/add`, {
  name: 'Sports', source: { kind: 'link', url: 'http://line.example.com:8080/get.php?username=u1&password=p1&type=m3u_plus' },
});
await request('POST', `/dev/licenses/${mac}/activate`, { type: 'yearly', source: 'reseller', sourceId: 'v4-' + mac });
const paid = (await enc('device_info', app(), auth)).body;
const sports = paid.urls?.find((u) => u.playlist_name === 'Sports');
check('after paying: is_trial 3 and the year in expire_date', paid.is_trial === 3 && paid.expire_date > info.body.expire_date, paid);
check('the playlist arrives in ibo’s xc shape', paid.has_own_playlist === true && sports?.playlist_type === 'xc' &&
  sports.url === 'http://line.example.com:8080/' && sports.username === 'u1' && sports.password === 'p1', sports);
const device = (await request('GET', `/dev/devices/${mac}`)).json.device;
await request('POST', `/dev/devices/${device.id}/parent-pin`, { pin: null });
check('parental control off arrives as "off"', (await enc('device_info', app(), auth)).body.parent_pin === 'off', null);

console.log('uid recovery');
const mismatch = await enc('device_login', app({ u_id: 'NEW999' }));
check('another uid asks for the uid captcha', mismatch.body?.status === 'uid_mismatch_captcha' &&
  mismatch.body.captcha?.startsWith('<svg') && mismatch.body.captcha_token, mismatch.body);
const wrongUid = await enc('device_login', app({ u_id: 'NEW999', uid_captcha_code: 'XXXXXX', uid_captcha_token: mismatch.body.captcha_token }));
check('a wrong uid answer gets a fresh uid captcha', wrongUid.body?.status === 'uid_mismatch_captcha' &&
  wrongUid.body.message.startsWith('Incorrect code'), wrongUid.body);
const shown = (await request('POST', '/dev/devices/v4/uid-captcha', { mac, revealAnswer: true })).json;
const recovered = await enc('device_login', app({ u_id: 'NEW999', uid_captcha_code: shown.answer, uid_captcha_token: shown.token }));
check('typing the stored uid back logs in with the new uid', recovered.body?.status === 'success' && shown.answer === 'QW12ER', [recovered.body, shown.answer]);
check('device_info now accepts the new uid', (await enc('device_info', app({ u_id: 'NEW999' }), auth)).body?.status === 'success', null);

console.log('app types');
const unknownType = await request('POST', '/api/nokia/v4/recaptcha', { mac_address: mac, app_type: 'nokia' });
const mixedType = await request('POST', V4 + 'recaptcha', { mac_address: mac, app_type: 'samsung' });
check('an unknown app type in the path is 404', unknownType.status === 404, unknownType);
check('an app_type that differs from the path is refused', mixedType.json?.message === 'Invalid app_type', mixedType.json);

console.log('manage playlists (V4)');
{
  const me = app({ u_id: 'NEW999' });
  const manage = (path, payload, headers = auth) => enc('manage/' + path, { ...me, ...payload }, headers);
  const added = await manage('add_playlist', {
    playListName: 'Movies', playListURL: 'http://movies.example.com/list.m3u', playlist_type: 'general', is_protected: 0,
  });
  check('add_playlist adds it; plain JSON with the saved playlist and its _id', added.status === 200 &&
    added.body?.status === 'success' && added.body.msg === 'Playlist added successfully' &&
    added.body.playlist?._id && added.body.playlist.playlist_name === 'Movies' &&
    added.body.playlist.url === 'http://movies.example.com/list.m3u', added.body);
  const id = added.body.playlist._id;
  const listed = (await enc('device_info', me, auth)).body.urls;
  check('device_info lists it with the same id', listed.some((u) => u.id === id && u.playlist_name === 'Movies'), listed);

  const xc = await manage('add_playlist', {
    playListName: 'Line', playListURL: 'http://line2.example.com:8080', username: 'u2', password: 'p2', playlist_type: 'xc', is_protected: 1, pin: '1234',
  });
  check('an Xtream server with username and password is saved protected', xc.body?.status === 'success' &&
    xc.body.playlist.username === 'u2' && xc.body.playlist.is_protected === 1 && !('pin' in xc.body.playlist), xc.body);
  const xcId = xc.body.playlist._id;
  const noPin = await manage('add_playlist', { playListName: 'P', playListURL: 'http://p.example.com/a.m3u', playlist_type: 'general', is_protected: 1 });
  check('a protected playlist without a PIN is refused', noPin.body?.msg === 'Sorry, pin is required for protected playlist', noPin.body);
  const noLogin = await manage('add_playlist', { playListName: 'X', playListURL: 'http://x.example.com', playlist_type: 'xc' });
  check('Xtream without username and password is refused', noLogin.body?.msg === 'Sorry, username and password are required for this playlist type', noLogin.body);
  const badType = await manage('add_playlist', { playListName: 'Y', playListURL: 'http://y.example.com/a.m3u', playlist_type: 'm3u' });
  check('an unknown playlist_type is refused', badType.body?.msg === 'Sorry, Playlist type is not valid', badType.body);
  const portal = await manage('add_playlist', {
    playListName: '', portal_name: 'Portal', portal_address: 'http://portal.example.com/c/', stalker_mac_address: '00:1a:79:00:00:01', playlist_type: 'stalker',
  });
  check('a Stalker portal is added, named after the portal', portal.body?.status === 'success' && portal.body.playlist.playlist_name === 'Portal', portal.body);

  const renamed = await manage('update_playlist', {
    playlistId: id, playListName: 'Movies HD', playListURL: 'http://movies.example.com/hd.m3u', playlist_type: 'general', is_protected: 0,
  });
  check('update_playlist changes name and link', renamed.body?.status === 'success' && renamed.body.msg === 'Playlist Updated successfully' &&
    renamed.body.playlist.playlist_name === 'Movies HD' && renamed.body.playlist.url === 'http://movies.example.com/hd.m3u', renamed.body);
  const keepPin = await manage('update_playlist', {
    playlistId: xcId, playListName: 'Line 2', playListURL: 'http://line2.example.com:8080', username: 'u2', password: 'p2', playlist_type: 'xc', is_protected: 1,
  });
  check('an update without the PIN keeps the playlist protected', keepPin.body?.status === 'success' && keepPin.body.playlist.is_protected === 1, keepPin.body);
  const viaAdd = await manage('add_playlist', {
    playlistId: id, playListName: 'Movies 4K', playListURL: 'http://movies.example.com/hd.m3u', playlist_type: 'general', is_protected: 0,
  });
  check('add_playlist with a playlistId updates, like the old route', viaAdd.body?.playlist?.playlist_name === 'Movies 4K' && viaAdd.body.playlist._id === id, viaAdd.body);

  // Another device's token cannot touch these playlists.
  const otherMacAddr = 'ad:' + Array.from({ length: 5 }, hex).join(':');
  const s1 = (await request('POST', '/dev/devices/captcha', { mac: otherMacAddr, platform: 'lg', revealAnswer: true })).json;
  const otherLogin = await enc('device_login', { ...app({ mac_address: otherMacAddr, u_id: 'ZX98CV' }), recaptcha_code: s1.answer, recaptcha_token: s1.token });
  const otherAuth = { Authorization: 'Bearer ' + otherLogin.body.token };
  const other = { mac_address: otherMacAddr, app_type: 'lg' };
  const stolen = await enc('manage/update_playlist', { ...other, playlistId: id, playListName: 'Mine', playListURL: 'http://z.example.com/a.m3u', playlist_type: 'general' }, otherAuth);
  check("another device cannot update it", stolen.body?.result === 'Sorry, we could not find playlist', stolen.body);
  const stolenDelete = await enc('manage/delete_playlist', { ...other, playlistId: id }, otherAuth);
  check("another device cannot delete it", stolenDelete.body?.result === 'Sorry, we could not find playlist', stolenDelete.body);
  const wrongMac = await manage('add_playlist', { mac_address: otherMacAddr, playListName: 'Q', playListURL: 'http://q.example.com/a.m3u', playlist_type: 'general' });
  check('a token for another MAC is refused (403, encrypted)', wrongMac.status === 403 && wrongMac.body?.message === 'Token does not match request mac_address', wrongMac);
  const otherRoute = await request('POST', '/api/samsung/v4/manage/add_playlist', { data: encryptRequest({ ...me, app_type: 'samsung', playListName: 'S', playListURL: 'http://s.example.com/a.m3u', playlist_type: 'general' }) }, auth);
  check("an lg token on the samsung route is refused (403)", otherRoute.status === 403, otherRoute);
  const noAuth = await manage('delete_playlist', { playlistId: id }, {});
  check('no token: 401', noAuth.status === 401 && noAuth.body?.message === 'Device login token is required', noAuth);

  const noId = await manage('delete_playlist', {});
  check('delete without playlistId is refused', noId.body?.msg === 'Sorry, Request Security Issue', noId.body);
  const deleted = await manage('delete_playlist', { playlistId: id });
  check('delete_playlist deletes it', deleted.body?.status === 'success' && deleted.body.message === 'Playlist deleted successfully', deleted.body);
  const after = (await enc('device_info', me, auth)).body.urls;
  check('and device_info no longer lists it', !after.some((u) => u.id === id), after);
  const twice = await manage('delete_playlist', { playlistId: id });
  check('deleting it again: not found', twice.body?.result === 'Sorry, we could not find playlist', twice.body);
}

console.log('changeParentPin (old envelope, form or JSON)');
{
  const form = (payload) => new Promise((resolve, reject) => {
    const data = 'data=' + encodeURIComponent(encryptRequest(payload));
    const req = http.request({ host: '127.0.0.1', port: PORT, method: 'POST', path: '/api/changeParentPin',
      headers: { Host: 'ibo.localhost', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) } },
      (res) => { let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(t) })); });
    req.on('error', reject); req.write(data); req.end();
  });
  const set = await form({ mac_address: mac, pin_code: '4321' });
  check('a form request sets the PIN (encrypted reply)', set.status === 200 && decryptResponse(set.json).msg === 'Pin code updated successfully', set.json);
  check('device_info sends the new PIN', (await enc('device_info', app({ u_id: 'NEW999' }), auth)).body.parent_pin === '4321', null);
  const off = await request('POST', '/api/changeParentPin', { data: encryptRequest({ mac_address: mac, pin_code: '' }) });
  check('a JSON request with "" turns parental control off', decryptResponse(off.json).status === 'success' &&
    (await enc('device_info', app({ u_id: 'NEW999' }), auth)).body.parent_pin === 'off', off.json);
  const bad = await request('POST', '/api/changeParentPin', { data: encryptRequest({ mac_address: mac, pin_code: '12' }) });
  check('a PIN that is not 4 digits is refused', decryptResponse(bad.json).msg === 'Sorry, request is not correct', bad.json);
  const unknown = await request('POST', '/api/changeParentPin', { data: encryptRequest({ mac_address: 'ad:00:00:00:00:02', pin_code: '1111' }) });
  check('an unknown MAC: device does not exist', decryptResponse(unknown.json).msg === 'Sorry, device does not exist', unknown.json);
  const garbled = await request('POST', '/api/changeParentPin', { data: '%%%' });
  check('an unreadable body gets the plain error', garbled.json?.msg === 'Sorry, request is not correct', garbled.json);
}

console.log('device/add (StarArcs guest login)');
{
  const me = app({ u_id: 'NEW999' });
  const stubPort = Number(process.env.STARARCS_STUB_PORT || 0);
  if (!stubPort) {
    const res = await enc('device/add', me, auth);
    check('without StarArcs set up (no stub): an encrypted refusal', res.status === 200 && res.body?.status === 'error', res.body);
    console.log('  (set STARARCS_STUB_PORT, and start the API with STARARCS_URL=http://127.0.0.1:<port>, to check the relay)');
  } else {
    const seen = [];
    const stub = http.createServer((req, res) => {
      let t = '';
      req.on('data', (c) => (t += c));
      req.on('end', () => {
        seen.push({ path: req.url, token: req.headers['x-secret-token'], body: JSON.parse(t || '{}') });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ status: 'success', device: { token: 'stararcs-' + JSON.parse(t).DeviceMac } }));
      });
    });
    await new Promise((r) => stub.listen(stubPort, '127.0.0.1', r));
    const res = await enc('device/add', me, auth);
    check("StarArcs' reply comes back encrypted, as it is", res.body?.device?.token === 'stararcs-' + mac, res.body);
    check('StarArcs got the MAC, the brand app name and the key', seen[0]?.path === '/api/v3/tv/auth' &&
      seen[0].body.DeviceMac === mac && seen[0].body.DeviceAppName && seen[0].token, seen);
    const noAuthAdd = await enc('device/add', me, {});
    check('device/add without a token: 401', noAuthAdd.status === 401, noAuthAdd);
    stub.close();
  }
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
