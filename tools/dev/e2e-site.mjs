// End-to-end check of the brand site's device API (Phase 6): device login with MAC + device key +
// captcha, the device dashboard, and the public tools. Runs against a running API and a real
// database; the dev routes stand in for the TV (register, pay) and for reading a captcha.
//
//   pnpm dev:api          # in another terminal, on a database you can wipe
//   pnpm e2e:site         # PORT=3001 pnpm e2e:site for another port
//
// It writes new devices and playlists into the `ibo` brand.
import http from 'node:http';
import { randomInt } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 3000);
let passed = 0;
let failed = 0;

function request(method, path, { body, brand = 'ibo', token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        method,
        path,
        headers: {
          Host: `${brand}.localhost`,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
const code = (r) => r.json?.error?.code ?? 'ok';
function check(name, condition, detail) {
  if (condition) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + '  ' + JSON.stringify(detail).slice(0, 300)); }
}
const hex = () => randomInt(256).toString(16).padStart(2, '0');
const randomMac = () => 'ae:' + Array.from({ length: 5 }, hex).join(':');
/** A site captcha with its answer, as a person would read it. */
const solved = async () => {
  const c = (await request('POST', '/dev/devices/captcha', { body: { kind: 'web', length: 5, revealAnswer: true } })).json;
  return { token: c.token, answer: c.answer };
};
async function paidDevice(type = 'yearly') {
  const mac = randomMac();
  const reg = await request('POST', '/dev/devices/register', { body: { mac, platform: 'lg' } });
  await request('POST', `/dev/licenses/${mac}/activate`, {
    body: { type, source: 'admin', actorId: 'e2e', sourceId: 'site-' + mac },
  });
  return { mac, key: reg.json.found.device.deviceKey };
}

console.log('captcha and device login');
const tv = await paidDevice();
let token;
{
  const picture = await request('GET', '/site/captcha');
  check('GET /site/captcha gives an SVG and a token', picture.status === 200 && picture.json.svg?.startsWith('<svg') && picture.json.token, picture.json);
  const wrongCaptcha = await request('POST', '/device/login', { body: { mac: tv.mac, deviceKey: tv.key, captcha: { token: picture.json.token, answer: 'XXXXX' } } });
  check('a wrong captcha answer is refused (400)', wrongCaptcha.status === 400 && code(wrongCaptcha) === 'devices.invalid_captcha', wrongCaptcha.json);
  const reused = await request('POST', '/device/login', { body: { mac: tv.mac, deviceKey: tv.key, captcha: { token: picture.json.token, answer: 'XXXXX' } } });
  check('a captcha is used up after one try', code(reused) === 'devices.invalid_captcha', reused.json);
  const wrongKey = await request('POST', '/device/login', { body: { mac: tv.mac, deviceKey: tv.key === '000000' ? '111111' : '000000', captcha: await solved() } });
  const unknownMac = await request('POST', '/device/login', { body: { mac: randomMac(), deviceKey: tv.key, captcha: await solved() } });
  check('a wrong key and an unknown MAC get the same answer (401)', wrongKey.status === 401 &&
    JSON.stringify(wrongKey.json) === JSON.stringify(unknownMac.json), [wrongKey.json, unknownMac.json]);
  const login = await request('POST', '/device/login', { body: { mac: tv.mac.toUpperCase(), deviceKey: tv.key, captcha: await solved() } });
  token = login.json?.token;
  check('MAC + device key + captcha logs in', login.status === 200 && token && login.json.device.macAddress === tv.mac && login.json.device.paid, login.json);
}

console.log('the device dashboard');
{
  const me = await request('GET', '/device', { token });
  check('GET /device: the device, its yearly license and its playlists', me.status === 200 &&
    me.json.license.state === 'yearly' && me.json.license.active && Array.isArray(me.json.playlists) &&
    !('pinEnc' in me.json.device), me.json);
  const otherBrand = await request('GET', '/device', { brand: 'bob', token });
  check("the session is refused on another brand's host (401)", otherBrand.status === 401, otherBrand.json);
  const none = await request('GET', '/device');
  check('no session: 401', none.status === 401, none.json);
}

console.log('playlists');
{
  const added = await request('POST', '/device/playlists', { token, body: { name: 'News', source: { kind: 'link', url: 'http://news.example.com/list.m3u' } } });
  check('add a playlist', added.status === 201 && added.json.playlist.url === 'http://news.example.com/list.m3u' && !('pinEnc' in added.json.playlist), added.json);
  const xtream = await request('POST', '/device/playlists', { token, body: { name: 'Line', source: { kind: 'xtream', server: 'http://line.example.com:8080', username: 'u', password: 'p' } } });
  check('add an Xtream login', xtream.status === 201 && xtream.json.playlist.type === 'xtream', xtream.json);
  const locked = await request('POST', '/device/playlists', { token, body: { name: 'Kids', source: { kind: 'link', url: 'http://kids.example.com/a.m3u' }, pin: '2468' } });
  const lockedId = locked.json?.playlist?.id;
  check('add a protected one', locked.status === 201 && locked.json.playlist.protected, locked.json);
  const twice = await request('POST', '/device/playlists', { token, body: { name: 'News 2', source: { kind: 'link', url: 'http://news.example.com/list.m3u' } } });
  check('the same link twice is refused (409)', twice.status === 409 && code(twice) === 'playlists.exists', twice.json);
  const list = (await request('GET', '/device/playlists', { token })).json.playlists;
  const kids = list.find((p) => p.id === lockedId);
  check('a protected playlist shows only its name', kids?.hidden === true && !('url' in kids), kids);
  const wrongPin = await request('POST', `/device/playlists/${lockedId}/unlock`, { token, body: { pin: '0000' } });
  check('unlock with a wrong PIN is refused (403)', wrongPin.status === 403 && code(wrongPin) === 'playlists.wrong_pin', wrongPin.json);
  const unlocked = await request('POST', `/device/playlists/${lockedId}/unlock`, { token, body: { pin: '2468' } });
  check('unlock with its PIN shows the link', unlocked.json?.playlist?.url === 'http://kids.example.com/a.m3u', unlocked.json);
  const editNoPin = await request('PATCH', `/device/playlists/${lockedId}`, { token, body: { name: 'Kids TV' } });
  check('editing a protected playlist needs its PIN', editNoPin.status === 403 && code(editNoPin) === 'playlists.pin_required', editNoPin.json);
  const edited = await request('PATCH', `/device/playlists/${lockedId}`, { token, body: { pin: '2468', name: 'Kids TV', newPin: null } });
  check('with the PIN it changes, and newPin null removes the protection', edited.json?.playlist?.name === 'Kids TV' && edited.json.playlist.protected === false, edited.json);
  const removed = await request('DELETE', `/device/playlists/${added.json.playlist.id}`, { token });
  const after = (await request('GET', '/device/playlists', { token })).json.playlists;
  check('delete a playlist', removed.json?.deleted && !after.some((p) => p.id === added.json.playlist.id), [removed.json, after]);
}

console.log('device key, parental PIN, recovery code');
{
  const badKey = await request('PATCH', '/device/key', { token, body: { key: '12' } });
  check('a device key that is not 6 digits is refused (400)', badKey.status === 400, badKey.json);
  const key = await request('PATCH', '/device/key', { token, body: { key: '246810' } });
  check('set a new device key', key.json?.deviceKey === '246810', key.json);
  const relogin = await request('POST', '/device/login', { body: { mac: tv.mac, deviceKey: '246810', captcha: await solved() } });
  check('the new key logs in', relogin.status === 200, relogin.json);
  const random = await request('PATCH', '/device/key', { token, body: { key: null } });
  check('key null makes a random one', /^\d{6}$/.test(random.json?.deviceKey ?? ''), random.json);
  const pinOn = await request('PATCH', '/device/parent-pin', { token, body: { pin: '1357' } });
  const pinOff = await request('PATCH', '/device/parent-pin', { token, body: { pin: null } });
  check('parental control on, then off', pinOn.json?.parentPin === '1357' && pinOff.json?.parentPin === null, [pinOn.json, pinOff.json]);
  const recovery = await request('POST', '/device/recovery-code', { token });
  check('a recovery code for the new TV', /^[A-Z0-9]{8}$/.test(recovery.json?.code ?? '') && recovery.json.expiresAt, recovery.json);
}

console.log('MAC switch');
{
  const newMac = randomMac();
  await request('POST', '/dev/devices/register', { body: { mac: newMac, platform: 'lg' } });
  const yearly = await request('POST', '/device/switch-mac', { token, body: { newMac } });
  check('a yearly license does not switch', code(yearly) === 'licensing.yearly_switch_not_allowed', yearly.json);
  const life = await paidDevice('lifetime');
  const lifeToken = (await request('POST', '/device/login', { body: { mac: life.mac, deviceKey: life.key, captcha: await solved() } })).json.token;
  const switched = await request('POST', '/device/switch-mac', { token: lifeToken, body: { newMac } });
  const me = await request('GET', '/device', { token: lifeToken });
  check('a lifetime license moves to the new TV; the session follows the device', switched.status === 200 && me.json?.device?.macAddress === newMac, [switched.json, me.json?.device]);
}

console.log('public tools');
{
  const status = await request('POST', '/site/device-status', { body: { mac: tv.mac, captcha: await solved() } });
  check('device status: paid, license, playlist count', status.status === 200 && status.json.paid && status.json.license.state === 'yearly' && status.json.playlistCount === 2, status.json);
  const noCaptcha = await request('POST', '/site/device-status', { body: { mac: tv.mac, captcha: { token: 'x', answer: 'y' } } });
  check('device status needs a captcha', noCaptcha.status === 400, noCaptcha.json);
  const unknown = await request('POST', '/site/device-status', { body: { mac: randomMac(), captcha: await solved() } });
  check('an unknown MAC: 404', unknown.status === 404, unknown.json);
  const quick = await paidDevice();
  const byMac = await request('POST', '/site/playlists', { body: { mac: quick.mac, name: 'Quick', source: { kind: 'link', url: 'http://quick.example.com/a.m3u' } } });
  check('add a playlist by MAC alone', byMac.status === 201 && byMac.json.playlist.name === 'Quick', byMac.json);
  await request('POST', '/site/playlists', { body: { mac: quick.mac, name: 'Locked', source: { kind: 'link', url: 'http://quick.example.com/b.m3u' }, pin: '1111' } });
  const cleared = await request('POST', '/site/playlists/delete-all', { body: { mac: quick.mac } });
  check('delete by MAC alone keeps the protected ones', cleared.json?.deleted === 1 && cleared.json.keptProtected === 1, cleared.json);
  const badMac = await request('POST', '/site/playlists', { body: { mac: 'nope', name: 'X', source: { kind: 'link', url: 'http://x.example.com/a.m3u' } } });
  check('a bad MAC is a 400', badMac.status === 400, badMac.json);
}

console.log('device uid');
{
  const uid = await request('PATCH', '/device/uid', { token, body: { uid: 'ab12cd' } });
  check('the uid shown by a reinstalled app is saved (upper case)', uid.json?.uid === 'AB12CD', uid.json);
  const bad = await request('PATCH', '/device/uid', { token, body: { uid: 'x' } });
  check('a uid that is not 6 letters or digits is refused (400)', bad.status === 400 && code(bad) === 'devices.invalid_uid', bad.json);
}

console.log('check playlist');
{
  const local = await request('POST', '/site/check-playlist', { body: { server: 'http://127.0.0.1:8080', username: 'u', password: 'p' } });
  check('a local address is never called (400)', local.status === 400 && code(local) === 'site.playlist_blocked', local.json);
  const privateLink = await request('POST', '/site/check-playlist', { body: { url: 'http://192.168.1.20/get.php?username=u&password=p' } });
  check('a private address in a get.php link is refused too', code(privateLink) === 'site.playlist_blocked', privateLink.json);
  const noLogin = await request('POST', '/site/check-playlist', { body: { url: 'not a link' } });
  check('something that is not a link is refused (400)', noLogin.status === 400 && code(noLogin) === 'site.playlist_invalid', noLogin.json);
}

console.log('contact form');
const contactEmail = 'visitor-' + randomInt(1e6) + '@example.test';
{
  const sent = await request('POST', '/site/contact', { body: { name: 'Visitor', email: contactEmail, subject: 'Hello', message: 'My TV does not load.' } });
  check('a message is saved', sent.status === 201 && sent.json?.id, sent.json);
  const bad = await request('POST', '/site/contact', { body: { email: 'nope', message: 'x' } });
  check('an invalid email is refused (400)', bad.status === 400 && code(bad) === 'contact.invalid_input', bad.json);
  const rootEmail = 'root-' + randomInt(1e6) + '@example.test';
  await request('POST', '/dev/staff/super-admin', { body: { email: rootEmail, name: 'Root', password: 'root-pass-1' } });
  const root = (await request('POST', '/admin/login', { body: { email: rootEmail, password: 'root-pass-1' } })).json?.token;
  const inbox = await request('GET', '/admin/contact-messages', { token: root });
  check('staff read it on the same brand (contact.view)', inbox.json?.messages?.some((m) => m.email === contactEmail && m.message === 'My TV does not load.'), inbox.json);
  const otherBrand = await request('GET', '/admin/contact-messages', { brand: 'bob', token: root });
  check("another brand's inbox does not have it", otherBrand.status === 200 && !otherBrand.json.messages.some((m) => m.email === contactEmail), otherBrand.json);
}

console.log("the customer account's devices");
{
  const email = 'owner-' + randomInt(1e6) + '@example.test';
  await request('POST', '/customer/sign-up', { body: { email, password: 'owner-pass-1' } });
  const link = (await request('GET', '/dev/outbox?to=' + encodeURIComponent(email))).json;
  await request('POST', '/customer/verify-email', { body: { token: link.token } });
  const customer = (await request('POST', '/customer/login', { body: { email, password: 'owner-pass-1' } })).json?.token;
  const own = await paidDevice();
  const linked = await request('POST', '/customer/devices/link', { token: customer, body: { mac: own.mac, deviceKey: own.key } });
  const deviceId = linked.json?.device?.id;
  check('the customer links a TV', linked.status === 200 && deviceId, linked.json);
  const named = await request('PATCH', `/customer/devices/${deviceId}`, { token: customer, body: { name: 'Living room' } });
  const list = await request('GET', '/customer/devices', { token: customer });
  check('rename it; the list shows the name', named.json?.name === 'Living room' && list.json?.devices?.[0]?.name === 'Living room', [named.json, list.json]);
  const uid = await request('POST', `/customer/devices/${deviceId}/uid`, { token: customer, body: { uid: 'ZZ99YY' } });
  check('set its uid', uid.json?.uid === 'ZZ99YY', uid.json);
  const recovery = await request('POST', `/customer/devices/${deviceId}/recovery-code`, { token: customer });
  check('make a recovery code for it', /^[A-Z0-9]{8}$/.test(recovery.json?.code ?? ''), recovery.json);
  const notMine = await request('POST', `/customer/devices/${tv.mac}/recovery-code`, { token: customer });
  const otherDevice = await request('PATCH', `/customer/devices/not-a-device`, { token: customer, body: { name: 'X' } });
  check('a device not on the account is not found (404)', notMine.status === 404 && otherDevice.status === 404, [notMine.json, otherDevice.json]);
  await request('DELETE', `/customer/devices/${deviceId}`, { token: customer });
  await request('POST', '/customer/devices/link', { token: customer, body: { mac: own.mac, deviceKey: own.key } });
  const relinked = await request('GET', '/customer/devices', { token: customer });
  check('unlinking forgets the name', relinked.json?.devices?.[0]?.name === null, relinked.json);
}

console.log('logout');
{
  await request('POST', '/device/logout', { token });
  const after = await request('GET', '/device', { token });
  check('logout ends the session', after.status === 401, after.json);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
