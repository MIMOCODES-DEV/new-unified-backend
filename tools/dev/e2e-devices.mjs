// End-to-end check of the Phase 1 device rules over HTTP, against a running API and a real
// database, through the dev-only /dev/devices routes.
//
//   pnpm seed          # once: migrations, dev brands and the example devices this script uses
//   pnpm dev:api       # in another terminal
//   pnpm e2e:devices   # PORT=3001 pnpm e2e:devices for another port
//
// It writes new devices into the `ibo` brand and changes some example devices (`pnpm seed` resets them).
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 3000);
let passed = 0;
let failed = 0;

function request(brand, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        method,
        path: '/dev/devices' + path,
        headers: {
          Host: brand + '.localhost',
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
const ibo = (m, p, b) => request('ibo', m, p, b);
const code = (r) => r.json?.error?.code ?? 'ok';
const okStatus = (r) => r.status === 200 || r.status === 201;

function check(name, ok, detail) {
  if (ok) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + '  ' + JSON.stringify(detail).slice(0, 300)); }
}
const randomMac = () =>
  'aa:' + Array.from({ length: 5 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(':');

console.log('1. Core identity');
{
  const mac = randomMac();
  const a = await ibo('POST', '/register', { mac, platform: 'samsung', appVersion: '1.0.0' });
  const d = a.json?.found?.device;
  const ends = new Date(d?.trialEndsAt);
  check('new MAC makes a trial device', okStatus(a) && a.json.created === true && a.json.found.paid === false, a.json);
  check('trial ends at 23:59:59.999 UTC, 7 days out', ends.getUTCHours() === 23 && ends.getUTCMilliseconds() === 999 &&
    Math.round((ends - new Date(d.createdAt)) / 86400000) >= 7, d);
  check('parent PIN 0000, 6-digit key 100000-999999', d?.parentPin === '0000' && /^[1-9]\d{5}$/.test(d?.deviceKey), d);
  const b = await ibo('POST', '/register', { mac: mac.toUpperCase().replaceAll(':', '-'), platform: 'samsung', appVersion: '1.1.0' });
  check('same MAC in another format is the same device', b.json?.created === false && b.json.found.device.id === d.id, b.json);
  check('the visit is recorded (appVersion)', b.json?.found?.device?.appVersion === '1.1.0', b.json);
  // Use the stored platform and API version: the playground may have moved this example device to V4.
  const stored = (await ibo('GET', '/02:00:00:00:01:03')).json.device;
  const ended = await ibo('POST', '/register', { mac: '02:00:00:00:01:03', platform: stored.platform, apiVersion: stored.apiVersion });
  check('4. a trial that ended gets no second trial', ended.json?.created === false &&
    new Date(ended.json.found.device.trialEndsAt) < new Date(), ended.json);
  const paid = await ibo('POST', '/register', { mac: '02:00:00:00:02:01', platform: 'samsung' });
  check('5. a paid device stays paid', paid.json?.found?.paid === true && paid.json.created === false, paid.json);
  const other = await request('bob', 'GET', '/' + mac);
  check('6. another brand does not see the device', other.status === 422 && code(other) === 'devices.not_found', other.json);
}

console.log('2. Devices without a real MAC');
{
  const none = await ibo('POST', '/register', { mac: '52:54:00:12:34:57', platform: 'windows' });
  check('7. fallback MAC and no id is refused', code(none) === 'devices.device_id_missing', none.json);
  const id1 = 'app-' + Math.random().toString(36).slice(2);
  const id2 = 'app-' + Math.random().toString(36).slice(2);
  const a = await ibo('POST', '/register', { mac: '52:54:00:12:34:57', platform: 'windows', appDeviceId: id1 });
  const b = await ibo('POST', '/register', { mac: '52:54:00:12:34:57', platform: 'windows', appDeviceId: id2 });
  const a2 = await ibo('POST', '/register', { mac: null, platform: 'windows', appDeviceId: id1 });
  const am = a.json?.found?.device?.macAddress ?? '';
  check('8. fallback MAC + app device id makes its own device', a.json?.created === true && am !== '52:54:00:12:34:57', a.json);
  check('   the made-up MAC is locally administered', (parseInt(am.slice(0, 2), 16) & 0x03) === 0x02, am);
  check('   two apps on the fallback MAC get two devices', b.json?.created === true && b.json.found.device.id !== a.json.found.device.id, b.json);
  check('   the same app device id finds its device again', a2.json?.created === false && a2.json.found.device.id === a.json.found.device.id, a2.json);
}

console.log('3. Platform rule and V4 lock');
{
  const legacy = await ibo('POST', '/register', { mac: '02:00:00:00:01:01', platform: 'lg' });
  check('9. a legacy device takes the caller platform', legacy.json?.found?.device?.platform === 'lg', legacy.json);
  const v4 = await ibo('POST', '/register', { mac: '02:00:00:00:01:02', platform: 'samsung', apiVersion: 'v4' });
  check('10. a V4 device called as another platform is refused', code(v4) === 'devices.platform_mismatch', v4.json);
  const lock = await ibo('POST', '/register', { mac: '02:00:00:00:02:02', platform: 'lg', apiVersion: 'legacy' });
  check('11. a V4 device on an old route is refused', code(lock) === 'devices.older_api_refused', lock.json);
}

console.log('4. V4 login and captchas');
{
  const mac = randomMac();
  const login = (extra) => ibo('POST', '/v4/login', { mac, platform: 'lg', uid: 'QW12ER', ...extra });
  const none = await login({});
  check('12. a new MAC must send a captcha', code(none) === 'devices.captcha_required', none.json);

  const wrongCap = await ibo('POST', '/captcha', { mac, platform: 'lg', revealAnswer: true });
  const wrong = await login({ captcha: { token: wrongCap.json.token, answer: 'XXXX' } });
  const retry = await login({ captcha: { token: wrongCap.json.token, answer: wrongCap.json.answer } });
  check('14. a wrong answer is refused', code(wrong) === 'devices.invalid_captcha', wrong.json);
  check('    and the captcha is used up (right answer now fails)', code(retry) === 'devices.invalid_captcha', retry.json);

  const otherCap = await ibo('POST', '/captcha', { mac: randomMac(), platform: 'lg', revealAnswer: true });
  const otherMac = await login({ captcha: { token: otherCap.json.token, answer: otherCap.json.answer } });
  check('    a captcha issued for another MAC is refused', code(otherMac) === 'devices.invalid_captcha', otherMac.json);

  const cap = await ibo('POST', '/captcha', { mac, platform: 'lg', revealAnswer: true });
  const ok = await login({ captcha: { token: cap.json.token, answer: cap.json.answer.toLowerCase() } });
  check('13. a solved captcha registers the device with the uid', okStatus(ok) && ok.json?.device?.uid === 'QW12ER' &&
    ok.json.device.apiVersion === 'v4', ok.json);
  const reuse = await login({ captcha: { token: cap.json.token, answer: cap.json.answer } });
  check('    later logins skip the captcha (sent again, still fine)', okStatus(reuse), reuse.json);
  const again = await login({});
  check('    later logins skip the captcha (none sent)', okStatus(again) && again.json.device.id === ok.json.device.id, again.json);

  const mismatch = await login({ uid: 'NEW999' });
  check('15. another uid asks for the recovery captcha', code(mismatch) === 'devices.uid_mismatch', mismatch.json);
  const uidCap = await ibo('POST', '/v4/uid-captcha', { mac, platform: 'lg', revealAnswer: true });
  check('    the recovery captcha shows the stored uid', uidCap.json?.answer === 'QW12ER', uidCap.json);
  const regAsUid = await ibo('POST', '/captcha', { mac, platform: 'lg', revealAnswer: true });
  const swapped = await login({ uid: 'NEW999', uidCaptcha: { token: regAsUid.json.token, answer: regAsUid.json.answer } });
  check('    a registration captcha does not work as the recovery one', code(swapped) === 'devices.invalid_captcha', swapped.json);
  const badUid = await login({ uid: 'NEW999', uidCaptcha: { token: uidCap.json.token, answer: 'WRONG1' } });
  const stillOld = await ibo('GET', '/' + mac);
  check('    a wrong recovery answer keeps the old uid', code(badUid) === 'devices.invalid_captcha' && stillOld.json.device.uid === 'QW12ER', stillOld.json);
  const uidCap2 = await ibo('POST', '/v4/uid-captcha', { mac, platform: 'lg', revealAnswer: true });
  const recovered = await login({ uid: 'new999', uidCaptcha: { token: uidCap2.json.token, answer: uidCap2.json.answer } });
  check('    solving it stores the new uid', recovered.json?.device?.uid === 'NEW999', recovered.json);

  const badFormat = await login({ uid: 'QW-1' });
  check('    a uid that is not 6 letters or digits is refused', code(badFormat) === 'devices.invalid_uid', badFormat.json);
  const fallback = await ibo('POST', '/v4/login', { mac: '52:54:00:12:34:57', platform: 'lg', uid: 'QW12ER' });
  check('    V4 login with a fallback MAC is refused', code(fallback) === 'devices.usable_mac_required', fallback.json);

  // Two answers at once: only one wins.
  const raceMac = randomMac();
  const raceCap = await ibo('POST', '/captcha', { mac: raceMac, platform: 'lg', revealAnswer: true });
  const both = await Promise.all([0, 1].map(() => ibo('POST', '/v4/login', {
    mac: raceMac, platform: 'lg', uid: 'RACE01', captcha: { token: raceCap.json.token, answer: raceCap.json.answer },
  })));
  const ids = new Set(both.filter(okStatus).map((r) => r.json.device.id));
  check('    two logins with one captcha at once make one device', ids.size === 1 && both.some(okStatus), both.map((r) => code(r)));
}

console.log('5. Old TV code');
{
  const mac = randomMac();
  await ibo('POST', '/register', { mac, platform: 'samsung' });
  const before = await ibo('POST', '/captcha-code', { mac, code: 'AB' });
  check('no captcha issued: any code is refused', code(before) === 'devices.invalid_captcha', before.json);
  const cap = await ibo('POST', '/captcha', { mac, platform: 'samsung', length: 2, revealAnswer: true });
  check('the TV captcha has 2 characters', cap.json?.answer?.length === 2, cap.json);
  const first = await ibo('POST', '/captcha-code', { mac, code: cap.json.answer });
  const second = await ibo('POST', '/captcha-code', { mac, code: cap.json.answer.toLowerCase() });
  const other = await ibo('POST', '/captcha-code', { mac, code: cap.json.answer === 'ZZ' ? 'YY' : 'ZZ' });
  check('17. the code solves the captcha', okStatus(first), first.json);
  check('    the same code keeps working', okStatus(second), second.json);
  check('    another code is refused', code(other) === 'devices.invalid_captcha', other.json);
}

console.log('6. Device key and parental control');
{
  const mac = randomMac();
  const reg = await ibo('POST', '/register', { mac, platform: 'lg' });
  const { id, deviceKey } = reg.json.found.device;
  const good = await ibo('POST', '/key/verify', { mac, key: deviceKey });
  const wrong = await ibo('POST', '/key/verify', { mac, key: deviceKey === '999999' ? '111111' : '999999' });
  const unknown = await ibo('POST', '/key/verify', { mac: randomMac(), key: deviceKey });
  check('18. MAC + key logs in', okStatus(good) && good.json.device.id === id, good.json);
  check('    a wrong key is refused', code(wrong) === 'devices.device_key_mismatch', wrong.json);
  check('    an unknown MAC gets the same error', code(unknown) === 'devices.device_key_mismatch' &&
    unknown.json.error.message === wrong.json.error.message, unknown.json);
  const changed = await ibo('POST', '/' + id + '/key', { key: '424242' });
  const oldKey = await ibo('POST', '/key/verify', { mac, key: deviceKey });
  const newKey = await ibo('POST', '/key/verify', { mac, key: '424242' });
  check('19. the key changes; the old one stops working', changed.json?.deviceKey === '424242' &&
    code(oldKey) === 'devices.device_key_mismatch' && okStatus(newKey), [changed.json, oldKey.json]);
  const badKey = await ibo('POST', '/' + id + '/key', { key: '12345' });
  check('    a key that is not 6 digits is refused', code(badKey) === 'devices.invalid_device_key', badKey.json);
  const random = await ibo('POST', '/' + id + '/key', { key: null });
  check('    a random new key is 6 digits', /^[1-9]\d{5}$/.test(random.json?.deviceKey ?? ''), random.json);
  const off = await ibo('POST', '/' + id + '/parent-pin', { pin: null });
  const offRead = await ibo('GET', '/' + mac);
  check('20. parental control turns off', off.json?.parentPin === null && offRead.json.device.parentPin === null, offRead.json);
  const on = await ibo('POST', '/' + id + '/parent-pin', { pin: '4321' });
  check('    and back on with a new PIN', on.json?.parentPin === '4321', on.json);
  const badPin = await ibo('POST', '/' + id + '/parent-pin', { pin: '12' });
  check('    a PIN that is not 4 digits is refused', code(badPin) === 'devices.invalid_parent_pin', badPin.json);
}

console.log('7. Bad input');
{
  const bad = await ibo('POST', '/register', { mac: 'zz', platform: 'tv' });
  check('a bad MAC and platform answer 400', bad.status === 400, bad.json);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
