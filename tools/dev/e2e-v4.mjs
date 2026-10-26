// End-to-end check of the V4 app routes (/api/<app type>/v4/...) as the IBO, Bob and CR apps call
// them: requests in the apps' envelope, replies decoded like the apps do. Runs against a running
// API and a real database; the dev routes stand in for what a person does (read a captcha, pay).
//
//   pnpm dev:api          # in another terminal
//   pnpm e2e:v4           # PORT=3001 pnpm e2e:v4 for another port
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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
