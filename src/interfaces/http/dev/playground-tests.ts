/**
 * The playground's test cases (`/dev/playground/tests.js`), one suite per phase area: brands and
 * requests (Phase 1), the device core collections (Phase 2), and the same checks as the
 * `pnpm e2e:devices|playlists|licenses|v4|moves|accounts` scripts in tools/dev, run from the browser
 * against the `ibo` brand (and `bob` for isolation). Keep them in step when a rule changes. V4 leaves
 * out the two checks that need a stand-in StarArcs server.
 * Plain browser JavaScript inside a string: no backticks or template placeholders.
 */
export const PLAYGROUND_TESTS_JS = String.raw`(function () {
  var PG = window.PG, req = PG.req, code = PG.code, ok = PG.ok, mac = PG.mac;
  var ibo = function (m, p, b) { return req(m, '/dev/devices' + p, b); };

  PG.suite({
    id: 'foundation', title: 'Brands and requests', script: 'Phase 1', expected: 10, tasks: ['F-4', 'F-5', 'F-8', 'F-11'], phase: 1,
    about: 'Each request is served for the brand of its host, from that brand’s own database; health, readiness and the request id.',
    run: async function (t) {
      t.group('health and readiness');
      var health = await req('GET', '/health');
      t.check('/health answers ok', health.status === 200 && health.json.status === 'ok', health.json);
      var resolveNone = await req('GET', '/dev/brands/resolve?host=no-brand.localhost');
      var healthAny = await fetch(PG.origin('bob') + '/health');
      t.check('/health needs no brand, for load balancers', healthAny.status === 200 && resolveNone.json.found === false, resolveNone.json);
      var ready = await req('GET', '/ready');
      t.check('/ready reports MongoDB, Redis and the brand databases up', ready.status === 200 && ready.json.checks.mongo === 'up' &&
        ready.json.checks.redis === 'up' && ready.json.checks.tenantDbs === 'up', ready.json);

      t.group('brand from the host');
      var onIbo = await req('GET', '/tenant');
      var onBob = await req('GET', '/tenant', undefined, { brand: 'bob' });
      t.check('ibo.localhost is served as ibo', onIbo.json && onIbo.json.slug === 'ibo', onIbo.json);
      t.check('bob.localhost is served as bob', onBob.json && onBob.json.slug === 'bob', onBob.json);
      var unknown = await req('GET', '/dev/brands/resolve?host=unknown-' + PG.word() + '.example.com');
      t.check('an unknown host is refused with 421 tenants.unknown_host', unknown.json.found === false && unknown.json.status === 421 &&
        unknown.json.code === 'tenants.unknown_host', unknown.json);

      t.group('a database per brand, settings and secrets');
      var iboBrand = await req('GET', '/dev/brand');
      var bobBrand = await req('GET', '/dev/brand', undefined, { brand: 'bob' });
      t.check('each brand has its own database', iboBrand.json.dbName && bobBrand.json.dbName && iboBrand.json.dbName !== bobBrand.json.dbName, [iboBrand.json.dbName, bobBrand.json.dbName]);
      t.check('brand config comes with its defaults (trial days)', iboBrand.json.config && iboBrand.json.config.trial && iboBrand.json.config.trial.days > 0, iboBrand.json.config);
      t.check('secrets are listed by name only, never their values', Array.isArray(iboBrand.json.secrets) &&
        iboBrand.json.secrets.every(function (s) { return typeof s === 'string'; }), iboBrand.json.secrets);

      t.group('request id');
      var sent = 'pg-' + PG.word();
      var echoed = await fetch('/health', { headers: { 'x-request-id': sent } });
      t.check('every reply carries the request id, the caller’s one when it sends one', echoed.headers.get('x-request-id') === sent, echoed.headers.get('x-request-id'));
    }
  });

  PG.suite({
    id: 'database', title: 'Device core collections', script: 'Phase 2', expected: 6, tasks: ['SCH-1', 'SCH-2', 'UNQ', 'LOCK'], phase: 2,
    about: 'The five brand collections and the central one exist with example rows; one MAC is one device, even under a race.',
    run: async function (t) {
      var summary = (await req('GET', '/dev/db/summary')).json;
      var names = summary.collections.map(function (c) { return c.name; });
      t.check('the brand database has trialDevices, devices, licenses, playlists and captchas',
        ['trialDevices', 'devices', 'licenses', 'playlists', 'captchas'].every(function (n) { return names.indexOf(n) >= 0; }), names);
      t.check('the central database has domainMigrations', summary.central.collections[0].name === 'domainMigrations', summary.central);
      var rows = {};
      summary.collections.forEach(function (c) { rows[c.name] = c.examples; });
      t.check('the seed added example rows (npm run seed)', rows.trialDevices > 0 && rows.devices > 0 && rows.licenses > 0 && rows.playlists > 0, rows);
      var m = mac('a9');
      var all = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function () { return ibo('POST', '/register', { mac: m, platform: 'samsung' }); }));
      var created = all.filter(function (r) { return r.json && r.json.created === true; }).length;
      t.check('ten sign-ups of one MAC at once make one device', created === 1, all.map(function (r) { return r.json && r.json.created; }));
      var before = (await ibo('GET', '/' + m)).json.device.id;
      await req('POST', '/dev/licenses/' + m + '/activate', { type: 'yearly', source: 'admin', sourceId: 'pg-' + PG.word() });
      var stored = (await req('GET', '/dev/db/mac/' + m)).json;
      t.check('paying moves it from trialDevices to devices with the same id', stored.trialDevices.length === 0 && stored.devices.length === 1 &&
        stored.devices[0]._id === before, stored);
      t.check('its license is a row of its own, kept as history', stored.licenses.length === 1 && stored.licenses[0].deviceId === before, stored.licenses);
    }
  });

  PG.suite({
    id: 'devices', title: 'Devices', script: 'e2e:devices', expected: 46, tasks: ['DEV-1', 'DEV-2', 'DEV-3', 'DEV-4', 'DEV-5', 'DEV-6'], phase: 3,
    about: 'Register, trial end, fallback MACs, platform rule, V4 lock, captchas, uid recovery, TV codes, key and parental PIN.',
    run: async function (t) {
      t.group('1. Core identity');
      {
        var m = mac('aa');
        var a = await ibo('POST', '/register', { mac: m, platform: 'samsung', appVersion: '1.0.0' });
        var d = a.json && a.json.found && a.json.found.device;
        var ends = new Date(d && d.trialEndsAt);
        t.check('new MAC makes a trial device', ok(a) && a.json.created === true && a.json.found.paid === false, a.json);
        t.check('trial ends at 23:59:59.999 UTC, 7 days out', ends.getUTCHours() === 23 && ends.getUTCMilliseconds() === 999 &&
          Math.round((ends - new Date(d.createdAt)) / 86400000) >= 7, d);
        t.check('parent PIN 0000, 6-digit key 100000-999999', d && d.parentPin === '0000' && /^[1-9]\d{5}$/.test(d.deviceKey), d);
        var b = await ibo('POST', '/register', { mac: m.toUpperCase().replace(/:/g, '-'), platform: 'samsung', appVersion: '1.1.0' });
        t.check('same MAC in another format is the same device', b.json && b.json.created === false && b.json.found.device.id === d.id, b.json);
        t.check('the visit is recorded (appVersion)', b.json && b.json.found && b.json.found.device.appVersion === '1.1.0', b.json);
        var stored = (await ibo('GET', '/02:00:00:00:01:03')).json.device;
        var ended = await ibo('POST', '/register', { mac: '02:00:00:00:01:03', platform: stored.platform, apiVersion: stored.apiVersion });
        t.check('a trial that ended gets no second trial', ended.json && ended.json.created === false &&
          new Date(ended.json.found.device.trialEndsAt) < new Date(), ended.json);
        var paid = await ibo('POST', '/register', { mac: '02:00:00:00:02:01', platform: 'samsung' });
        t.check('a paid device stays paid', paid.json && paid.json.found && paid.json.found.paid === true && paid.json.created === false, paid.json);
        var other = await req('GET', '/dev/devices/' + m, undefined, { brand: 'bob' });
        t.check('another brand does not see the device', other.status === 422 && code(other) === 'devices.not_found', other.json);
      }

      t.group('2. Devices without a real MAC');
      {
        var none = await ibo('POST', '/register', { mac: '52:54:00:12:34:57', platform: 'windows' });
        t.check('fallback MAC and no id is refused', code(none) === 'devices.device_id_missing', none.json);
        var id1 = 'app-' + Math.random().toString(36).slice(2), id2 = 'app-' + Math.random().toString(36).slice(2);
        var a1 = await ibo('POST', '/register', { mac: '52:54:00:12:34:57', platform: 'windows', appDeviceId: id1 });
        var b1 = await ibo('POST', '/register', { mac: '52:54:00:12:34:57', platform: 'windows', appDeviceId: id2 });
        var a2 = await ibo('POST', '/register', { mac: null, platform: 'windows', appDeviceId: id1 });
        var am = (a1.json && a1.json.found && a1.json.found.device.macAddress) || '';
        t.check('fallback MAC + app device id makes its own device', a1.json && a1.json.created === true && am !== '52:54:00:12:34:57', a1.json);
        t.check('the made-up MAC is locally administered', (parseInt(am.slice(0, 2), 16) & 3) === 2, am);
        t.check('two apps on the fallback MAC get two devices', b1.json && b1.json.created === true && b1.json.found.device.id !== a1.json.found.device.id, b1.json);
        t.check('the same app device id finds its device again', a2.json && a2.json.created === false && a2.json.found.device.id === a1.json.found.device.id, a2.json);
      }

      t.group('3. Platform rule and V4 lock');
      {
        var legacy = await ibo('POST', '/register', { mac: '02:00:00:00:01:01', platform: 'lg' });
        t.check('a legacy device takes the caller platform', legacy.json && legacy.json.found && legacy.json.found.device.platform === 'lg', legacy.json);
        var v4 = await ibo('POST', '/register', { mac: '02:00:00:00:01:02', platform: 'samsung', apiVersion: 'v4' });
        t.check('a V4 device called as another platform is refused', code(v4) === 'devices.platform_mismatch', v4.json);
        var lock = await ibo('POST', '/register', { mac: '02:00:00:00:02:02', platform: 'lg', apiVersion: 'legacy' });
        t.check('a V4 device on an old route is refused', code(lock) === 'devices.older_api_refused', lock.json);
      }

      t.group('4. V4 login and captchas');
      {
        var vm = mac('aa');
        var login = function (extra) { return ibo('POST', '/v4/login', Object.assign({ mac: vm, platform: 'lg', uid: 'QW12ER' }, extra)); };
        var n0 = await login({});
        t.check('a new MAC must send a captcha', code(n0) === 'devices.captcha_required', n0.json);
        var wrongCap = await ibo('POST', '/captcha', { mac: vm, platform: 'lg', revealAnswer: true });
        var wrong = await login({ captcha: { token: wrongCap.json.token, answer: 'XXXX' } });
        var retry = await login({ captcha: { token: wrongCap.json.token, answer: wrongCap.json.answer } });
        t.check('a wrong answer is refused', code(wrong) === 'devices.invalid_captcha', wrong.json);
        t.check('and the captcha is used up (right answer now fails)', code(retry) === 'devices.invalid_captcha', retry.json);
        var otherCap = await ibo('POST', '/captcha', { mac: mac('aa'), platform: 'lg', revealAnswer: true });
        var otherMac = await login({ captcha: { token: otherCap.json.token, answer: otherCap.json.answer } });
        t.check('a captcha issued for another MAC is refused', code(otherMac) === 'devices.invalid_captcha', otherMac.json);
        var cap = await ibo('POST', '/captcha', { mac: vm, platform: 'lg', revealAnswer: true });
        var good = await login({ captcha: { token: cap.json.token, answer: cap.json.answer.toLowerCase() } });
        t.check('a solved captcha registers the device with the uid', ok(good) && good.json.device.uid === 'QW12ER' && good.json.device.apiVersion === 'v4', good.json);
        var reuse = await login({ captcha: { token: cap.json.token, answer: cap.json.answer } });
        t.check('later logins skip the captcha (sent again, still fine)', ok(reuse), reuse.json);
        var again = await login({});
        t.check('later logins skip the captcha (none sent)', ok(again) && again.json.device.id === good.json.device.id, again.json);
        var mismatch = await login({ uid: 'NEW999' });
        t.check('another uid asks for the recovery captcha', code(mismatch) === 'devices.uid_mismatch', mismatch.json);
        var uidCap = await ibo('POST', '/v4/uid-captcha', { mac: vm, platform: 'lg', revealAnswer: true });
        t.check('the recovery captcha shows the stored uid', uidCap.json && uidCap.json.answer === 'QW12ER', uidCap.json);
        var regAsUid = await ibo('POST', '/captcha', { mac: vm, platform: 'lg', revealAnswer: true });
        var swapped = await login({ uid: 'NEW999', uidCaptcha: { token: regAsUid.json.token, answer: regAsUid.json.answer } });
        t.check('a registration captcha does not work as the recovery one', code(swapped) === 'devices.invalid_captcha', swapped.json);
        var badUid = await login({ uid: 'NEW999', uidCaptcha: { token: uidCap.json.token, answer: 'WRONG1' } });
        var stillOld = await ibo('GET', '/' + vm);
        t.check('a wrong recovery answer keeps the old uid', code(badUid) === 'devices.invalid_captcha' && stillOld.json.device.uid === 'QW12ER', stillOld.json);
        var uidCap2 = await ibo('POST', '/v4/uid-captcha', { mac: vm, platform: 'lg', revealAnswer: true });
        var recovered = await login({ uid: 'new999', uidCaptcha: { token: uidCap2.json.token, answer: uidCap2.json.answer } });
        t.check('solving it stores the new uid', recovered.json && recovered.json.device && recovered.json.device.uid === 'NEW999', recovered.json);
        var badFormat = await login({ uid: 'QW-1' });
        t.check('a uid that is not 6 letters or digits is refused', code(badFormat) === 'devices.invalid_uid', badFormat.json);
        var fallback = await ibo('POST', '/v4/login', { mac: '52:54:00:12:34:57', platform: 'lg', uid: 'QW12ER' });
        t.check('V4 login with a fallback MAC is refused', code(fallback) === 'devices.usable_mac_required', fallback.json);
        var raceMac = mac('aa');
        var raceCap = await ibo('POST', '/captcha', { mac: raceMac, platform: 'lg', revealAnswer: true });
        var both = await Promise.all([0, 1].map(function () {
          return ibo('POST', '/v4/login', { mac: raceMac, platform: 'lg', uid: 'RACE01', captcha: { token: raceCap.json.token, answer: raceCap.json.answer } });
        }));
        var ids = {};
        both.filter(ok).forEach(function (r) { ids[r.json.device.id] = true; });
        t.check('two logins with one captcha at once make one device', Object.keys(ids).length === 1 && both.some(ok), both.map(code));
      }

      t.group('5. Old TV code');
      {
        var tm = mac('aa');
        await ibo('POST', '/register', { mac: tm, platform: 'samsung' });
        var before = await ibo('POST', '/captcha-code', { mac: tm, code: 'AB' });
        t.check('no captcha issued: any code is refused', code(before) === 'devices.invalid_captcha', before.json);
        var tcap = await ibo('POST', '/captcha', { mac: tm, platform: 'samsung', length: 2, revealAnswer: true });
        t.check('the TV captcha has 2 characters', tcap.json && tcap.json.answer && tcap.json.answer.length === 2, tcap.json);
        var first = await ibo('POST', '/captcha-code', { mac: tm, code: tcap.json.answer });
        var second = await ibo('POST', '/captcha-code', { mac: tm, code: tcap.json.answer.toLowerCase() });
        var other2 = await ibo('POST', '/captcha-code', { mac: tm, code: tcap.json.answer === 'ZZ' ? 'YY' : 'ZZ' });
        t.check('the code solves the captcha', ok(first), first.json);
        t.check('the same code keeps working', ok(second), second.json);
        t.check('another code is refused', code(other2) === 'devices.invalid_captcha', other2.json);
      }

      t.group('6. Device key and parental control');
      {
        var km = mac('aa');
        var reg = await ibo('POST', '/register', { mac: km, platform: 'lg' });
        var id = reg.json.found.device.id, deviceKey = reg.json.found.device.deviceKey;
        var kGood = await ibo('POST', '/key/verify', { mac: km, key: deviceKey });
        var kWrong = await ibo('POST', '/key/verify', { mac: km, key: deviceKey === '999999' ? '111111' : '999999' });
        var kUnknown = await ibo('POST', '/key/verify', { mac: mac('aa'), key: deviceKey });
        t.check('MAC + key logs in', ok(kGood) && kGood.json.device.id === id, kGood.json);
        t.check('a wrong key is refused', code(kWrong) === 'devices.device_key_mismatch', kWrong.json);
        t.check('an unknown MAC gets the same error', code(kUnknown) === 'devices.device_key_mismatch' &&
          kUnknown.json.error.message === kWrong.json.error.message, kUnknown.json);
        var changed = await ibo('POST', '/' + id + '/key', { key: '424242' });
        var oldKey = await ibo('POST', '/key/verify', { mac: km, key: deviceKey });
        var newKey = await ibo('POST', '/key/verify', { mac: km, key: '424242' });
        t.check('the key changes; the old one stops working', changed.json && changed.json.deviceKey === '424242' &&
          code(oldKey) === 'devices.device_key_mismatch' && ok(newKey), [changed.json, oldKey.json]);
        var badKey = await ibo('POST', '/' + id + '/key', { key: '12345' });
        t.check('a key that is not 6 digits is refused', code(badKey) === 'devices.invalid_device_key', badKey.json);
        var random = await ibo('POST', '/' + id + '/key', { key: null });
        t.check('a random new key is 6 digits', /^[1-9]\d{5}$/.test((random.json && random.json.deviceKey) || ''), random.json);
        var off = await ibo('POST', '/' + id + '/parent-pin', { pin: null });
        var offRead = await ibo('GET', '/' + km);
        t.check('parental control turns off', off.json && off.json.parentPin === null && offRead.json.device.parentPin === null, offRead.json);
        var on = await ibo('POST', '/' + id + '/parent-pin', { pin: '4321' });
        t.check('and back on with a new PIN', on.json && on.json.parentPin === '4321', on.json);
        var badPin = await ibo('POST', '/' + id + '/parent-pin', { pin: '12' });
        t.check('a PIN that is not 4 digits is refused', code(badPin) === 'devices.invalid_parent_pin', badPin.json);
      }

      t.group('7. Bad input');
      var bad = await ibo('POST', '/register', { mac: 'zz', platform: 'tv' });
      t.check('a bad MAC and platform answer 400', bad.status === 400, bad.json);
    }
  });

  PG.suite({
    id: 'playlists', title: 'Playlists', script: 'e2e:playlists', expected: 24, tasks: ['PL-1', 'PL-2', 'PL-3', 'PL-4', 'PL-5', 'PL-6', 'PL-7', 'PL-8'],  phase: 3,
    about: 'Xtream parsing, each kind, duplicates, counters, PIN, reply profiles, demo, backups, sync, add and delete by MAC, status sync, host move.',
    run: async function (t) {
      var HOST = 'line-' + PG.word() + '.example.com';
      var P = function (m) { return '/dev/playlists/' + m; };
      var newDevice = async function () { var m = mac('ab'); await req('POST', '/dev/devices/register', { mac: m, platform: 'samsung' }); return m; };
      var m = await newDevice();
      var find = function (list, name) { return list.filter(function (p) { return p.name === name; })[0]; };
      var byId = function (list, id) { return list.filter(function (p) { return p.id === id; })[0]; };

      t.group('PL-1 kinds and PL-2 add, edit, delete');
      var x = await req('POST', P(m) + '/add', { name: 'Xtream', source: { kind: 'link', url: 'http://' + HOST + ':8080/get.php?username=u1&password=p1&type=m3u_plus' } });
      t.check('an Xtream link is parsed once into server, username, password', ok(x) && x.json.type === 'xtream' &&
        x.json.xtream.server === 'http://' + HOST + ':8080/' && x.json.xtream.password === 'p1', x.json);
      var m3u = await req('POST', P(m) + '/add', { name: 'M3U', source: { kind: 'link', url: 'http://' + HOST + '/list.m3u' } });
      var s = await req('POST', P(m) + '/add', { name: 'Portal', source: { kind: 'stalker', portalUrl: 'http://' + HOST + '/c/', mac: '00-1A-79-00-00-01' } });
      var c = await req('POST', P(m) + '/add', { name: 'Code', source: { kind: 'code', code: '482915' } });
      t.check('m3u, stalker and code each fill only their part', m3u.json && m3u.json.type === 'm3u' && m3u.json.xtream === null &&
        s.json && s.json.stalker && s.json.stalker.mac === '00:1a:79:00:00:01' && c.json && c.json.code && c.json.code.code === '482915', [m3u.json, s.json, c.json]);
      var dup = await req('POST', P(m) + '/add', { name: 'Again', source: { kind: 'link', url: 'http://' + HOST + '/list.m3u' } });
      t.check('the same playlist twice is refused', code(dup) === 'playlists.exists', dup.json);
      var device = (await req('GET', '/dev/devices/' + m)).json.device;
      t.check('the trial device counts 4 playlists', device.playlistCount === 4 && !!device.firstPlaylistAt, device);
      var renamed = await req('POST', P(m) + '/' + m3u.json.id + '/edit', { name: 'Renamed' });
      t.check('edit changes the name', renamed.json && renamed.json.name === 'Renamed', renamed.json);
      var del = await req('POST', P(m) + '/' + c.json.id + '/delete', {});
      var after = (await req('GET', '/dev/devices/' + m)).json.device;
      t.check('delete removes it and counts it down', ok(del) && after.playlistCount === 3, after);

      t.group('PL-3 PIN hides data on the dashboard only');
      var kids = await req('POST', P(m) + '/add', { name: 'Kids', source: { kind: 'link', url: 'http://' + HOST + '/kids.m3u' }, pin: '1234', via: 'website' });
      t.check('added protected in one step, PIN encrypted', kids.json && kids.json.protected === true &&
        String(kids.json.pinEnc).indexOf('v1:') === 0 && String(kids.json.pinEnc).indexOf('1234') < 0, kids.json);
      var hidden = byId((await req('GET', P(m) + '/dashboard')).json, kids.json.id);
      t.check('the dashboard list hides its link', hidden && hidden.hidden === true && hidden.url === undefined, hidden);
      var noPin = await req('POST', P(m) + '/' + kids.json.id + '/unlock', {});
      var wrongPin = await req('POST', P(m) + '/' + kids.json.id + '/unlock', { pin: '9999' });
      var rightPin = await req('POST', P(m) + '/' + kids.json.id + '/unlock', { pin: '1234' });
      t.check('unlocking needs the right PIN', code(noPin) === 'playlists.pin_required' && code(wrongPin) === 'playlists.wrong_pin' &&
        rightPin.json && rightPin.json.url === 'http://' + HOST + '/kids.m3u', [noPin.json, wrongPin.json]);
      var dashEdit = await req('POST', P(m) + '/' + kids.json.id + '/edit', { by: 'dashboard', name: 'X' });
      var appEdit = await req('POST', P(m) + '/' + kids.json.id + '/edit', { by: 'app', name: 'Kids TV' });
      t.check('the dashboard needs the PIN to edit; the app does not', code(dashEdit) === 'playlists.pin_required' &&
        appEdit.json && appEdit.json.name === 'Kids TV', [dashEdit.json, appEdit.json]);
      var reply = byId((await req('GET', P(m) + '/reply')).json.playlists, kids.json.id);
      var roku = byId((await req('GET', P(m) + '/reply?includePins=true')).json.playlists, kids.json.id);
      t.check('the app gets the link; the PIN only when asked (Roku, iOS)', reply && reply.url && reply.pin === undefined && roku && roku.pin === '1234', [reply, roku]);

      t.group('PL-4 replies');
      var xc = find((await req('GET', P(m) + '/reply')).json.playlists, 'Xtream');
      t.check('ibo (xc profile): Xtream goes as server + login', xc && xc.type === 'xc' && xc.url === 'http://' + HOST + ':8080/' && xc.username === 'u1', xc);
      var empty = await newDevice();
      var demo = (await req('GET', P(empty) + '/reply')).json;
      t.check('a device with no playlist gets the demo or nothing, and hasOwnPlaylist false',
        demo.hasOwnPlaylist === false && demo.playlists.every(function (p) { return p.demo; }), demo);

      t.group('PL-5 backups');
      var xtream = find((await req('GET', P(m))).json, 'Xtream');
      var set = await req('POST', P(m) + '/' + xtream.id + '/backup', { enabled: true, hosts: ['Mirror.example.com', 'https://m2.example.com:2095'] });
      var item = byId((await req('GET', P(m) + '/reply')).json.playlists, xtream.id);
      t.check('backup hosts are stored and the reply has the links', ok(set) &&
        JSON.stringify(item.backupUrls) === JSON.stringify(['http://mirror.example.com:8080/', 'https://m2.example.com:2095/']), item && item.backupUrls);
      await req('POST', P(m) + '/' + xtream.id + '/backup', { enabled: false });
      var offB = byId((await req('GET', P(m))).json, xtream.id);
      t.check('turning backups off keeps the hosts', offB.backup.enabled === false && offB.backup.hosts.length === 2, offB.backup);
      var badB = await req('POST', P(m) + '/' + xtream.id + '/backup', { enabled: true, hosts: ['localhost'] });
      t.check('a bad host is refused', code(badB) === 'playlists.invalid_playlist', badB.json);

      t.group('PL-2 bulk sync');
      var other = await newDevice();
      var theirs = await req('POST', P(other) + '/add', { name: 'Theirs', source: { kind: 'link', url: 'http://' + HOST + '/theirs.m3u' } });
      var sync = await req('POST', P(m) + '/sync', {
        playlists: [{ originId: 'non_saved_1', name: 'Synced', url: 'http://' + HOST + '/synced.m3u' }, { originId: theirs.json.id, name: 'Hijack', url: 'http://' + HOST + '/h.m3u' }],
        removeIds: [theirs.json.id]
      });
      var still = (await req('GET', P(other))).json;
      t.check('sync adds new items and returns their ids', ok(sync) && sync.json.playlists[0].id && sync.json.playlists[0].originId === 'non_saved_1', sync.json);
      t.check('sync never touches another device’s playlist', still.length === 1 && still[0].name === 'Theirs', still);

      t.group('PL-6 without a login');
      var added = await req('POST', P(m) + '/by-mac/add', { name: 'From QR', source: { kind: 'link', url: 'http://' + HOST + '/qr.m3u' } });
      t.check('add by MAC records the website', added.json && added.json.addedBy && added.json.addedBy.via === 'website', added.json);
      var target = await newDevice();
      await req('POST', P(target) + '/add', { name: 'Open', source: { kind: 'link', url: 'http://' + HOST + '/o.m3u' } });
      await req('POST', P(target) + '/add', { name: 'Locked', source: { kind: 'link', url: 'http://' + HOST + '/l.m3u' }, pin: '1111' });
      var wiped = await req('POST', P(target) + '/by-mac/delete');
      t.check('delete by MAC keeps protected playlists (or is rate limited)', (ok(wiped) &&
        wiped.json.deleted === 1 && wiped.json.keptProtected === 1) || code(wiped) === 'playlists.too_many_requests', wiped.json);

      t.group('PL-7 status sync');
      var xt = find((await req('GET', P(m))).json, 'Xtream');
      var report = await req('POST', P(m) + '/' + xt.id + '/status', { status: 'Active', expiresAt: '1798761600', name: 'Hijacked' });
      var xa = byId((await req('GET', P(m))).json, xt.id);
      t.check('an Xtream playlist stores the account status; nothing else changes', ok(report) &&
        xa.account.status === 'Active' && xa.account.expiresAt.indexOf('2027-01-01') === 0 && xa.name === 'Xtream', xa);

      t.group('PL-8 provider moved host');
      var count = await req('POST', '/dev/playlists/move-host', { from: HOST, to: 'new-' + HOST, countOnly: true, macs: [m] });
      var bm = find((await req('GET', P(m))).json, 'Xtream');
      t.check('count-only counts and changes nothing', count.json && count.json.matched >= 3 && count.json.changed === 0 && bm.url.indexOf('//' + HOST + ':') >= 0, count.json);
      var moved = await req('POST', '/dev/playlists/move-host', { from: HOST, to: 'new-' + HOST, countOnly: false, macs: [m] });
      var am2 = find((await req('GET', P(m))).json, 'Xtream');
      t.check('the move changes only the host; path and login stay', moved.json && moved.json.changed >= 3 &&
        am2.url === 'http://new-' + HOST + ':8080/get.php?username=u1&password=p1&type=m3u_plus' && am2.xtream.server === 'http://new-' + HOST + ':8080/', am2);
      var pattern = await req('POST', '/dev/playlists/move-host', { from: 'line-.*', to: 'x.example.com' });
      t.check('a pattern is refused', code(pattern) === 'playlists.invalid_playlist', pattern.json);
    }
  });

  PG.suite({
    id: 'licenses', title: 'Licenses', script: 'e2e:licenses', expected: 19, tasks: ['LIC-1', 'LIC-2', 'LIC-3'], phase: 3,
    about: 'Trial state, a year keeps the trial days, stacking, lifetime, same source once, parallel activations, every source, revoke, pay again, history.',
    run: async function (t) {
      var L = function (m) { return '/dev/licenses/' + m; };
      var sid = function () { return 'src-' + Math.random().toString(36).slice(2, 10); };
      var newTrial = async function () {
        var m = mac('ac');
        var reg = await req('POST', '/dev/devices/register', { mac: m, platform: 'lg' });
        return { mac: m, trialEndsAt: reg.json.found.device.trialEndsAt };
      };
      var activate = function (m, body) { return req('POST', L(m) + '/activate', Object.assign({ type: 'yearly', source: 'reseller', actorId: 'r-1', sourceId: sid() }, body)); };

      t.group('LIC-1 state and stacking');
      var n = await newTrial();
      var trial = (await req('GET', L(n.mac))).json;
      t.check('a new device is in trial until its trial end', trial.state === 'trial' && trial.active && trial.endsAt === n.trialEndsAt, trial);
      var year = await activate(n.mac, {});
      t.check('a year bought in the trial keeps the trial days left', year.json && year.json.license && year.json.license.expiresAt === PG.yearAfter(n.trialEndsAt), [year.json, n.trialEndsAt]);
      t.check('a year costs 1 credit', year.json.license.creditCost === 1, year.json);
      var second = await activate(n.mac, {});
      t.check('a second year stacks on the first', second.json && second.json.license && second.json.license.expiresAt === PG.yearAfter(year.json.license.expiresAt), second.json);
      var life = await activate(n.mac, { type: 'lifetime' });
      t.check('lifetime has no end and costs 2', life.json && life.json.license && life.json.license.expiresAt === null && life.json.license.creditCost === 2, life.json);
      var more = await activate(n.mac, {});
      t.check('a running lifetime gets no year', code(more) === 'licensing.already_lifetime', more.json);
      var st = (await req('GET', L(n.mac))).json;
      t.check('the state is lifetime', st.state === 'lifetime' && st.active && st.endsAt === null, st);

      t.group('LIC-2 activation');
      var n2 = await newTrial(), sourceId = sid();
      var first = await activate(n2.mac, { sourceId: sourceId, resellerId: 'r-9', multiActivate: true });
      var again = await activate(n2.mac, { sourceId: sourceId });
      t.check('the trial device moved to devices', (await req('GET', '/dev/devices/' + n2.mac)).json.paid === true, first.json);
      t.check('the same source twice activates once', again.json && again.json.created === false && again.json.license.id === first.json.license.id, again.json);
      t.check('multiActivate is stored', first.json.license.multiActivate === true, first.json);
      var raced = await Promise.all([activate(n2.mac, {}), activate(n2.mac, {})]);
      var ends = raced.map(function (r) { return r.json && r.json.license && r.json.license.expiresAt; }).sort();
      t.check('two activations at once both stack (the device lock holds)', ends[1] === PG.yearAfter(ends[0]), raced.map(function (r) { return r.json; }));
      var sources = ['admin', 'reseller', 'code', 'coupon', 'payment', 'store', 'transfer', 'plan'];
      var o = (await newTrial()).mac;
      for (var i = 0; i < sources.length; i++) await activate(o, { source: sources[i], type: 'yearly' });
      var hist = (await req('GET', L(o) + '/history')).json;
      t.check('every source is recorded', JSON.stringify(hist.map(function (e) { return e.license.activatedBy.source; })) === JSON.stringify(sources), hist.map(function (e) { return e.license.activatedBy; }));
      var unknown = await activate(mac('ac'), {});
      t.check('an unknown MAC is refused', code(unknown) === 'devices.not_found', unknown.json);

      t.group('LIC-3 revoke and history');
      var n3 = await newTrial();
      var trialRevoke = await req('POST', L(n3.mac) + '/revoke');
      t.check('a trial device has nothing to revoke', code(trialRevoke) === 'licensing.no_license', trialRevoke.json);
      var paid = await activate(n3.mac, { actorId: 'r-1' });
      var revoked = await req('POST', L(n3.mac) + '/revoke');
      var twice = await req('POST', L(n3.mac) + '/revoke');
      var st3 = (await req('GET', L(n3.mac))).json;
      t.check('revoke keeps the row with revokedAt', revoked.json && revoked.json.revoked === true && revoked.json.revokedAt && revoked.json.id === paid.json.license.id, revoked.json);
      t.check('the device stays paid with no valid license', st3.state === 'revoked' && !st3.active && (await req('GET', '/dev/devices/' + n3.mac)).json.paid, st3);
      t.check('revoking twice is refused', code(twice) === 'licensing.already_revoked', twice.json);
      var repaid = await activate(n3.mac, { actorId: 'r-2' });
      t.check('paying again starts the year today', repaid.json && repaid.json.license && repaid.json.license.expiresAt === PG.yearAfter(new Date().toISOString()), repaid.json);
      var h3 = (await req('GET', L(n3.mac) + '/history')).json;
      t.check('history lists both, oldest first, with who and which is current',
        h3.length === 2 && h3[0].state === 'revoked' && !h3[0].current && h3[0].license.activatedBy.actorId === 'r-1' &&
        h3[1].current && h3[1].license.activatedBy.actorId === 'r-2', h3);
    }
  });

  PG.suite({
    id: 'v4', title: 'TV app routes (V4)', script: 'e2e:v4', expected: 47, tasks: ['DEV-4', 'V4 routes'], phase: 3,
    about: 'The routes the TV apps call, in their own envelope: captcha, login, device_info, playlists from the TV, changeParentPin, device/add.',
    run: async function (t) {
      var m = mac('ad');
      var app = function (extra) { return Object.assign({ mac_address: m, app_type: 'lg', u_id: 'QW12ER', version: '4.1.0' }, extra || {}); };
      var enc = function (path, payload, headers) { return PG.v4('lg', path, payload, headers); };

      t.group('recaptcha and device_login');
      var first = await req('POST', '/api/lg/v4/recaptcha', { mac_address: m, app_type: 'lg' });
      t.check('a new MAC gets a captcha picture and a token', first.json && first.json.status === 'success' &&
        String(first.json.captcha).indexOf('<svg') === 0 && !!first.json.token, first.json);
      var noCaptcha = await enc('device_login', app());
      t.check('login without the captcha is refused', noCaptcha.body && noCaptcha.body.message === 'Captcha code and token are required', noCaptcha.body);
      var solvable = (await req('POST', '/dev/devices/captcha', { mac: m, platform: 'lg', revealAnswer: true })).json;
      var wrong = await enc('device_login', app({ recaptcha_code: 'ZZZZ', recaptcha_token: solvable.token }));
      t.check('a wrong answer is refused with error_code 401', wrong.body && wrong.body.error_code === 401, wrong.body);
      var solvable2 = (await req('POST', '/dev/devices/captcha', { mac: m, platform: 'lg', revealAnswer: true })).json;
      var login = await enc('device_login', app({ recaptcha_code: solvable2.answer, recaptcha_token: solvable2.token }));
      t.check('the right answer logs in and gives a device token', login.body && login.body.status === 'success' && !!login.body.token, login.body);
      var token = login.body && login.body.token;
      var again = await req('POST', '/api/lg/v4/recaptcha', { mac_address: m, app_type: 'lg' });
      t.check('the next start skips the captcha (already_verified)', again.json && again.json.status === 'already_verified', again.json);
      var relogin = await enc('device_login', app());
      t.check('the next login needs no captcha', relogin.body && relogin.body.status === 'success', relogin.body);

      t.group('device_info');
      var auth = { Authorization: 'Bearer ' + token };
      var info = await enc('device_info', app(), auth);
      t.check('a new device is a trial (is_trial 0) with a future expire_date', info.body && info.body.status === 'success' &&
        info.body.is_trial === 0 && info.body.expire_date > new Date().toISOString().slice(0, 10), info.body);
      t.check('it has a 6-digit device key and parental PIN 0000', /^\d{6}$/.test(info.body.device_key) && info.body.parent_pin === '0000', info.body);
      t.check('no playlists yet: has_own_playlist false', info.body.has_own_playlist === false && Array.isArray(info.body.urls), info.body);
      var noToken = await enc('device_info', app());
      var badToken = await enc('device_info', app(), { Authorization: 'Bearer bm90LWEtdG9rZW4=' });
      t.check('device_info without a token is refused (401)', noToken.status === 401, noToken);
      t.check('device_info with a forged token is refused (403)', badToken.status === 403, badToken);
      var otherMac = await enc('device_info', app({ mac_address: 'ad:00:00:00:00:01' }), auth);
      t.check('a token for another MAC is refused (403)', otherMac.status === 403, otherMac);

      t.group('what the person does elsewhere shows up in the app');
      await req('POST', '/dev/playlists/' + m + '/add', { name: 'Sports', source: { kind: 'link', url: 'http://line.example.com:8080/get.php?username=u1&password=p1&type=m3u_plus' } });
      await req('POST', '/dev/licenses/' + m + '/activate', { type: 'yearly', source: 'reseller', sourceId: 'v4-' + m });
      var paid = (await enc('device_info', app(), auth)).body;
      var sports = (paid.urls || []).filter(function (u) { return u.playlist_name === 'Sports'; })[0];
      t.check('after paying: is_trial 3 and the year in expire_date', paid.is_trial === 3 && paid.expire_date > info.body.expire_date, paid);
      t.check('the playlist arrives in ibo’s xc shape', paid.has_own_playlist === true && sports && sports.playlist_type === 'xc' &&
        sports.url === 'http://line.example.com:8080/' && sports.username === 'u1' && sports.password === 'p1', sports);
      var device = (await req('GET', '/dev/devices/' + m)).json.device;
      await req('POST', '/dev/devices/' + device.id + '/parent-pin', { pin: null });
      t.check('parental control off arrives as "off"', (await enc('device_info', app(), auth)).body.parent_pin === 'off', null);

      t.group('uid recovery');
      var mismatch = await enc('device_login', app({ u_id: 'NEW999' }));
      t.check('another uid asks for the uid captcha', mismatch.body && mismatch.body.status === 'uid_mismatch_captcha' &&
        String(mismatch.body.captcha).indexOf('<svg') === 0 && !!mismatch.body.captcha_token, mismatch.body);
      var wrongUid = await enc('device_login', app({ u_id: 'NEW999', uid_captcha_code: 'XXXXXX', uid_captcha_token: mismatch.body.captcha_token }));
      t.check('a wrong uid answer gets a fresh uid captcha', wrongUid.body && wrongUid.body.status === 'uid_mismatch_captcha' &&
        String(wrongUid.body.message).indexOf('Incorrect code') === 0, wrongUid.body);
      var shown = (await req('POST', '/dev/devices/v4/uid-captcha', { mac: m, revealAnswer: true })).json;
      var recovered = await enc('device_login', app({ u_id: 'NEW999', uid_captcha_code: shown.answer, uid_captcha_token: shown.token }));
      t.check('typing the stored uid back logs in with the new uid', recovered.body && recovered.body.status === 'success' && shown.answer === 'QW12ER', [recovered.body, shown.answer]);
      t.check('device_info now accepts the new uid', (await enc('device_info', app({ u_id: 'NEW999' }), auth)).body.status === 'success', null);

      t.group('app types');
      var unknownType = await req('POST', '/api/nokia/v4/recaptcha', { mac_address: m, app_type: 'nokia' });
      var mixedType = await req('POST', '/api/lg/v4/recaptcha', { mac_address: m, app_type: 'samsung' });
      t.check('an unknown app type in the path is 404', unknownType.status === 404, unknownType);
      t.check('an app_type that differs from the path is refused', mixedType.json && mixedType.json.message === 'Invalid app_type', mixedType.json);

      t.group('manage playlists from the TV');
      var me = app({ u_id: 'NEW999' });
      var manage = function (path, payload, headers) { return enc('manage/' + path, Object.assign({}, me, payload), headers === undefined ? auth : headers); };
      var added = await manage('add_playlist', { playListName: 'Movies', playListURL: 'http://movies.example.com/list.m3u', playlist_type: 'general', is_protected: 0 });
      t.check('add_playlist adds it; plain JSON with the saved playlist and its _id', added.status === 200 && added.body && added.body.status === 'success' &&
        added.body.msg === 'Playlist added successfully' && added.body.playlist && added.body.playlist._id && added.body.playlist.playlist_name === 'Movies' &&
        added.body.playlist.url === 'http://movies.example.com/list.m3u', added.body);
      var pid = added.body.playlist._id;
      var listed = (await enc('device_info', me, auth)).body.urls;
      t.check('device_info lists it with the same id', listed.some(function (u) { return u.id === pid && u.playlist_name === 'Movies'; }), listed);
      var xcAdd = await manage('add_playlist', { playListName: 'Line', playListURL: 'http://line2.example.com:8080', username: 'u2', password: 'p2', playlist_type: 'xc', is_protected: 1, pin: '1234' });
      t.check('an Xtream server with username and password is saved protected', xcAdd.body && xcAdd.body.status === 'success' &&
        xcAdd.body.playlist.username === 'u2' && xcAdd.body.playlist.is_protected === 1 && !('pin' in xcAdd.body.playlist), xcAdd.body);
      var xcId = xcAdd.body.playlist._id;
      var noPin = await manage('add_playlist', { playListName: 'P', playListURL: 'http://p.example.com/a.m3u', playlist_type: 'general', is_protected: 1 });
      t.check('a protected playlist without a PIN is refused', noPin.body && noPin.body.msg === 'Sorry, pin is required for protected playlist', noPin.body);
      var noLogin = await manage('add_playlist', { playListName: 'X', playListURL: 'http://x.example.com', playlist_type: 'xc' });
      t.check('Xtream without username and password is refused', noLogin.body && noLogin.body.msg === 'Sorry, username and password are required for this playlist type', noLogin.body);
      var badType = await manage('add_playlist', { playListName: 'Y', playListURL: 'http://y.example.com/a.m3u', playlist_type: 'm3u' });
      t.check('an unknown playlist_type is refused', badType.body && badType.body.msg === 'Sorry, Playlist type is not valid', badType.body);
      var portal = await manage('add_playlist', { playListName: '', portal_name: 'Portal', portal_address: 'http://portal.example.com/c/', stalker_mac_address: '00:1a:79:00:00:01', playlist_type: 'stalker' });
      t.check('a Stalker portal is added, named after the portal', portal.body && portal.body.status === 'success' && portal.body.playlist.playlist_name === 'Portal', portal.body);
      var renamed = await manage('update_playlist', { playlistId: pid, playListName: 'Movies HD', playListURL: 'http://movies.example.com/hd.m3u', playlist_type: 'general', is_protected: 0 });
      t.check('update_playlist changes name and link', renamed.body && renamed.body.status === 'success' && renamed.body.msg === 'Playlist Updated successfully' &&
        renamed.body.playlist.playlist_name === 'Movies HD' && renamed.body.playlist.url === 'http://movies.example.com/hd.m3u', renamed.body);
      var keepPin = await manage('update_playlist', { playlistId: xcId, playListName: 'Line 2', playListURL: 'http://line2.example.com:8080', username: 'u2', password: 'p2', playlist_type: 'xc', is_protected: 1 });
      t.check('an update without the PIN keeps the playlist protected', keepPin.body && keepPin.body.status === 'success' && keepPin.body.playlist.is_protected === 1, keepPin.body);
      var viaAdd = await manage('add_playlist', { playlistId: pid, playListName: 'Movies 4K', playListURL: 'http://movies.example.com/hd.m3u', playlist_type: 'general', is_protected: 0 });
      t.check('add_playlist with a playlistId updates, like the old route', viaAdd.body && viaAdd.body.playlist && viaAdd.body.playlist.playlist_name === 'Movies 4K' && viaAdd.body.playlist._id === pid, viaAdd.body);
      var otherMacAddr = mac('ad');
      var s1 = (await req('POST', '/dev/devices/captcha', { mac: otherMacAddr, platform: 'lg', revealAnswer: true })).json;
      var otherLogin = await enc('device_login', Object.assign(app({ mac_address: otherMacAddr, u_id: 'ZX98CV' }), { recaptcha_code: s1.answer, recaptcha_token: s1.token }));
      var otherAuth = { Authorization: 'Bearer ' + otherLogin.body.token };
      var other = { mac_address: otherMacAddr, app_type: 'lg' };
      var stolen = await enc('manage/update_playlist', Object.assign({}, other, { playlistId: pid, playListName: 'Mine', playListURL: 'http://z.example.com/a.m3u', playlist_type: 'general' }), otherAuth);
      t.check('another device cannot update it', stolen.body && stolen.body.result === 'Sorry, we could not find playlist', stolen.body);
      var stolenDelete = await enc('manage/delete_playlist', Object.assign({}, other, { playlistId: pid }), otherAuth);
      t.check('another device cannot delete it', stolenDelete.body && stolenDelete.body.result === 'Sorry, we could not find playlist', stolenDelete.body);
      var wrongMac = await manage('add_playlist', { mac_address: otherMacAddr, playListName: 'Q', playListURL: 'http://q.example.com/a.m3u', playlist_type: 'general' });
      t.check('a token for another MAC is refused (403, encrypted)', wrongMac.status === 403 && wrongMac.body && wrongMac.body.message === 'Token does not match request mac_address', wrongMac);
      var otherRoute = await req('POST', '/api/samsung/v4/manage/add_playlist', { data: PG.encryptRequest(Object.assign({}, me, { app_type: 'samsung', playListName: 'S', playListURL: 'http://s.example.com/a.m3u', playlist_type: 'general' })) }, { headers: auth });
      t.check('an lg token on the samsung route is refused (403)', otherRoute.status === 403, otherRoute);
      var noAuth = await manage('delete_playlist', { playlistId: pid }, {});
      t.check('no token: 401', noAuth.status === 401 && noAuth.body && noAuth.body.message === 'Device login token is required', noAuth);
      var noId = await manage('delete_playlist', {});
      t.check('delete without playlistId is refused', noId.body && noId.body.msg === 'Sorry, Request Security Issue', noId.body);
      var deleted = await manage('delete_playlist', { playlistId: pid });
      t.check('delete_playlist deletes it', deleted.body && deleted.body.status === 'success' && deleted.body.message === 'Playlist deleted successfully', deleted.body);
      var afterDelete = (await enc('device_info', me, auth)).body.urls;
      t.check('and device_info no longer lists it', !afterDelete.some(function (u) { return u.id === pid; }), afterDelete);
      var twice = await manage('delete_playlist', { playlistId: pid });
      t.check('deleting it again: not found', twice.body && twice.body.result === 'Sorry, we could not find playlist', twice.body);

      t.group('changeParentPin (old envelope, form or JSON)');
      var dec = function (r) { try { return PG.decryptResponse(r.json); } catch (e) { return {}; } };
      var setPin = await req('POST', '/api/changeParentPin', undefined, { form: { data: PG.encryptRequest({ mac_address: m, pin_code: '4321' }) } });
      t.check('a form request sets the PIN (encrypted reply)', setPin.status === 200 && dec(setPin).msg === 'Pin code updated successfully', setPin.json);
      t.check('device_info sends the new PIN', (await enc('device_info', me, auth)).body.parent_pin === '4321', null);
      var offPin = await req('POST', '/api/changeParentPin', { data: PG.encryptRequest({ mac_address: m, pin_code: '' }) });
      t.check('a JSON request with "" turns parental control off', dec(offPin).status === 'success' && (await enc('device_info', me, auth)).body.parent_pin === 'off', offPin.json);
      var badPin = await req('POST', '/api/changeParentPin', { data: PG.encryptRequest({ mac_address: m, pin_code: '12' }) });
      t.check('a PIN that is not 4 digits is refused', dec(badPin).msg === 'Sorry, request is not correct', badPin.json);
      var unknownPin = await req('POST', '/api/changeParentPin', { data: PG.encryptRequest({ mac_address: 'ad:00:00:00:00:02', pin_code: '1111' }) });
      t.check('an unknown MAC: device does not exist', dec(unknownPin).msg === 'Sorry, device does not exist', unknownPin.json);
      var garbled = await req('POST', '/api/changeParentPin', { data: '%%%' });
      t.check('an unreadable body gets the plain error', garbled.json && garbled.json.msg === 'Sorry, request is not correct', garbled.json);

      t.group('device/add (StarArcs guest login)');
      var stararcs = await enc('device/add', me, auth);
      t.check('without StarArcs set up here: an encrypted answer, not a crash', stararcs.status === 200 && stararcs.body && !!stararcs.body.status, stararcs.body);
    }
  });

  PG.suite({
    id: 'moves', title: 'Moves and cleanup', script: 'e2e:moves', expected: 32, tasks: ['DEV-7', 'REC-1', 'REC-2', 'REC-3', 'DOM-1', 'DOM-2', 'LIC-4'], phase: 4,
    about: 'MAC switch, recovery code and recovery on a new TV, provider host moves with staff approval, the cleanup dry run.',
    run: async function (t) {
      var L = function (m) { return '/dev/licenses/' + m; };
      var P = function (m) { return '/dev/playlists/' + m; };

      t.group('DEV-7 MAC switch');
      var from = await PG.paid(), to = await PG.trial();
      await PG.addLink(from, 'News', 'http://a.e2e.example/a.m3u');
      await PG.addLink(to, 'News', 'http://b.e2e.example/b.m3u');
      var before = await PG.device(from);
      var sw = await req('POST', L(from) + '/switch', { newMac: to });
      t.check('a lifetime license switches to a MAC whose app is installed', ok(sw), sw.json);
      var after = await PG.device(to);
      t.check('the paid device keeps its id on the new MAC', after && after.paid && after.device.id === before.device.id, after);
      var names = (await req('GET', P(to))).json.map(function (p) { return p.name; }).sort();
      t.check('the new TV trial playlist is absorbed as "News (2)"', JSON.stringify(names) === '["News","News (2)"]', names);
      var old = await PG.device(from);
      t.check('the old MAC keeps an ended trial', old && !old.paid && new Date(old.device.trialEndsAt) < new Date(), old);
      var again = await req('POST', L(to) + '/switch', { newMac: await PG.trial() });
      t.check('a second switch is refused (limit 1)', code(again) === 'licensing.mac_switch_limit', again.json);
      var yearly = await PG.paid('yearly'), target = await PG.trial();
      var noAllow = await req('POST', L(yearly) + '/switch', { newMac: target });
      t.check('yearly is refused without allowYearly', code(noAllow) === 'licensing.yearly_switch_not_allowed', noAllow.json);
      t.check('yearly switches with allowYearly', ok(await req('POST', L(yearly) + '/switch', { newMac: target, allowYearly: true })));
      var multi = await PG.paid('lifetime', { multiActivate: true }), multiTo = await PG.trial();
      t.check('multiActivate is refused', code(await req('POST', L(multi) + '/switch', { newMac: multiTo })) === 'licensing.multi_activate_switch');
      var p2 = await PG.paid();
      t.check('a paid device on the new MAC refuses it', code(await req('POST', L(await PG.paid()) + '/switch', { newMac: p2 })) === 'licensing.mac_taken');

      t.group('REC-1 recovery code');
      var tr = await PG.trial();
      t.check('a trial device gets no code', code(await req('POST', L(tr) + '/recovery-code')) === 'licensing.recovery_needs_paid_device');
      var revoked = await PG.paid();
      await req('POST', L(revoked) + '/revoke', {});
      t.check('a revoked license gets no code', code(await req('POST', L(revoked) + '/recovery-code')) === 'licensing.license_not_running');
      var pm = await PG.paid();
      var c1 = await req('POST', L(pm) + '/recovery-code');
      var minutes = (new Date(c1.json && c1.json.expiresAt) - Date.now()) / 60000;
      t.check('a paid device gets an 8-character code for 30 minutes', /^[A-Z2-9]{8}$/.test((c1.json && c1.json.code) || '') && minutes > 29 && minutes <= 30, c1.json);
      var c2 = await req('POST', L(pm) + '/recovery-code');
      var usedOld = await req('POST', '/dev/licenses/recover', { code: c1.json.code, newMac: await PG.trial() });
      t.check('a new code replaces the old one', ok(c2) && code(usedOld) === 'licensing.recovery_code_not_found', usedOld.json);

      t.group('REC-2/3 apply the code on a new TV');
      var rm = await PG.paid();
      await PG.addLink(rm, 'Mine', 'http://own.e2e.example/own.m3u');
      var rid = (await PG.device(rm)).device.id;
      var tv = await PG.trial();
      await PG.addLink(tv, 'Trial list', 'http://tv.e2e.example/tv.m3u');
      var tvId = (await PG.device(tv)).device.id;
      var made = (await req('POST', L(rm) + '/recovery-code')).json;
      t.check('a wrong code is refused', code(await req('POST', '/dev/licenses/recover', { code: 'WRONG234', newMac: tv })) === 'licensing.recovery_code_not_found');
      var rec = await req('POST', '/dev/licenses/recover', { code: ' ' + made.code.toLowerCase(), newMac: tv });
      t.check('the code (any case) moves the paid device to the new TV', ok(rec) && rec.json.deviceId === rid && rec.json.to === tv, rec.json);
      var now = await PG.device(tv);
      t.check('it keeps its id and license', now.paid && now.device.id === rid && now.device.recovery.recoveredFrom === rm, now);
      var lists = (await req('GET', P(tv))).json.map(function (p) { return p.name; });
      t.check('it keeps its own playlists; the new TV trial ones are gone', JSON.stringify(lists) === '["Mine"]', lists);
      t.check('the new TV trial device was removed with its playlists', rec.json.removedTrialId === tvId && rec.json.removedPlaylists === 1, rec.json);
      var oldR = await PG.device(rm);
      t.check('the old MAC keeps one ended trial device, nothing else', oldR && !oldR.paid && oldR.device.playlistCount === 0, oldR);
      var reuse = await req('POST', '/dev/licenses/recover', { code: made.code, newMac: await PG.trial() });
      t.check('the code works once', code(reuse) === 'licensing.recovery_code_not_found', reuse.json);

      t.group('DOM-1/2 provider domain moves');
      var oldHost = 'line-' + PG.word() + '.e2e.example:8080', newHost = 'line-' + PG.word() + '.e2e.example:8080';
      var link = function (h) { return 'http://' + h + '/get.php?username=u&password=p&type=m3u_plus'; };
      var moveFrom = async function (ip, kind) {
        var m = kind === 'trial' ? await PG.trial() : await PG.paid();
        var added = await PG.addLink(m, 'Provider', link(oldHost));
        await req('POST', P(m) + '/' + added.json.id + '/edit', { source: { kind: 'link', url: link(newHost) }, ip: ip });
        return m;
      };
      var findMove = async function (filter) {
        return (await req('GET', '/dev/domain-moves?filter=' + filter)).json.filter(function (x) { return x.fromHost === oldHost; })[0];
      };
      await moveFrom('198.51.100.1', 'trial');
      t.check('a trial device does not report a move', !(await findMove('pending')));
      await moveFrom('198.51.100.1');
      await moveFrom('198.51.100.1');
      var pending = await findMove('pending');
      t.check('the first report makes a pending move; the same IP counts once', pending && pending.confirmations === 1 && pending.toHost === newHost, pending);
      await moveFrom('198.51.100.2');
      t.check('two IPs: not yet up for approval', !(await findMove('awaiting')));
      var watcher = await PG.paid();
      await PG.addLink(watcher, 'Provider', link(oldHost));
      await moveFrom('198.51.100.3');
      var awaiting = await findMove('awaiting');
      t.check('three IPs: shows up for approval', awaiting && awaiting.confirmations === 3, awaiting);
      var b4 = (await req('GET', P(watcher) + '/reply')).json.playlists[0];
      t.check('not served before it is approved', b4.url.indexOf(oldHost) >= 0, b4);
      var approved = await req('POST', '/dev/domain-moves/' + awaiting.id + '/approve', { by: 'playground' });
      t.check('approving records who decided', ok(approved) && approved.json.status === 'approved' && approved.json.decidedBy === 'playground', approved.json);
      var served = (await req('GET', P(watcher) + '/reply?platform=samsung')).json.playlists[0];
      t.check('an approved move is served on the new host, the old host first in the backups',
        served.url.indexOf(newHost) >= 0 && served.url.indexOf(oldHost) < 0 && served.backupUrls[0] && served.backupUrls[0].indexOf(oldHost.split(':')[0]) >= 0, served);
      var stored = (await req('GET', P(watcher))).json[0];
      t.check('the stored playlist is not changed', stored.url === link(oldHost), stored);
      var blocked = await req('POST', '/dev/domain-moves/' + awaiting.id + '/block', { by: 'playground' });
      var afterBlock = (await req('GET', P(watcher) + '/reply')).json.playlists[0];
      t.check('a blocked move is not served', ok(blocked) && afterBlock.url.indexOf(oldHost) >= 0, afterBlock);
      t.check('approving an unknown move is refused', code(await req('POST', '/dev/domain-moves/nope/approve', { by: 'playground' })) === 'domain_migrations.not_found');

      t.group('LIC-4 cleanup report (dry run)');
      var report = await req('GET', '/dev/licenses/cleanup?days=180');
      t.check('the dry run reports and deletes nothing', ok(report) && report.json.dryRun === true && report.json.deleted === 0, report.json);
      t.check('a rule that is not whole days is refused', (await req('GET', '/dev/licenses/cleanup?days=0')).status === 400);
    }
  });

  PG.suite({
    id: 'accounts', title: 'Customers and staff', script: 'e2e:accounts', expected: 52, tasks: ['CUS-1', 'CUS-2', 'CUS-3', 'CUS-4', 'STF-1', 'STF-2', 'STF-3', 'PRM-1', 'PRM-2'], phase: 5,
    about: 'Sign-up, email check, login and reset per brand; linking a TV; staff roles limited to a brand; permissions; two-factor login; disabling staff.',
    run: async function (t) {
      var r = function (method, path, o) { o = o || {}; return req(method, path, o.body, { brand: o.brand, token: o.token }); };
      var w = PG.word;
      // Login and sign-up tries are rate limited per IP; start each run with clean counters.
      await req('POST', '/dev/rate-limits/reset');

      t.group('setup: a super admin');
      var adminEmail = 'root-' + w() + '@e2e.test', adminPassword = 'root-pass-' + w();
      var made = await r('POST', '/dev/staff/super-admin', { body: { email: adminEmail, name: 'Playground Root', password: adminPassword } });
      t.check('the dev route makes a super admin (the CLI does it in production)', ok(made) && made.json.staff.roleId === 'super_admin', made.json);
      var rootLogin = await r('POST', '/admin/login', { body: { email: adminEmail.toUpperCase(), password: adminPassword } });
      var root = rootLogin.json && rootLogin.json.token;
      t.check('the super admin logs in (email in any case)', rootLogin.status === 200 && !!root, rootLogin.json);

      t.group('E2E-A1 sign up, verify, log in; the same email on another brand');
      var ana = 'ana-' + w() + '@e2e.test', anaIbo;
      var signUp = await r('POST', '/customer/sign-up', { body: { email: ana, password: 'ana-pass-1', firstName: 'Ana' } });
      t.check('sign-up on ibo makes an unverified account', signUp.status === 201 && signUp.json.customer.emailVerified === false, signUp.json);
      var early = await r('POST', '/customer/login', { body: { email: ana, password: 'ana-pass-1' } });
      t.check('no login before the email is verified', code(early) === 'customers.email_not_verified', early.json);
      var link = await PG.outbox(ana, 'ibo');
      var verified = await r('POST', '/customer/verify-email', { body: { token: link } });
      t.check('the emailed link verifies the email', verified.status === 200 && verified.json.customer.emailVerified, verified.json);
      var reused = await r('POST', '/customer/verify-email', { body: { token: link } });
      t.check('the link works once', code(reused) === 'customers.invalid_link', reused.json);
      var login = await r('POST', '/customer/login', { body: { email: ana, password: 'ana-pass-1' } });
      anaIbo = login.json && login.json.token;
      t.check('login on ibo', login.status === 200 && !!anaIbo, login.json);
      var wrong = await r('POST', '/customer/login', { body: { email: ana, password: 'wrong-pass' } });
      var unknown = await r('POST', '/customer/login', { body: { email: 'nobody-' + ana, password: 'ana-pass-1' } });
      t.check('a wrong password and an unknown email give the same answer', wrong.status === 401 && JSON.stringify(wrong.json) === JSON.stringify(unknown.json), [wrong.json, unknown.json]);
      var onBob = await r('POST', '/customer/sign-up', { brand: 'bob', body: { email: ana, password: 'other-pass-2' } });
      t.check('the same email signs up on bob: a separate account', onBob.status === 201 && onBob.json.customer.id !== verified.json.customer.id, onBob.json);
      var bobLogin = await r('POST', '/customer/login', { brand: 'bob', body: { email: ana, password: 'ana-pass-1' } });
      t.check('ibo’s password does not open the bob account', code(bobLogin) === 'customers.invalid_credentials', bobLogin.json);
      var crossBrand = await r('GET', '/customer/me', { brand: 'bob', token: anaIbo });
      t.check('an ibo session is refused on bob’s host', crossBrand.status === 401, crossBrand.json);
      var meIbo = await r('GET', '/customer/me', { token: anaIbo });
      t.check('the ibo session works on ibo', meIbo.status === 200 && meIbo.json.customer.email === ana, meIbo.json);
      var again = await r('POST', '/customer/sign-up', { body: { email: ana.toUpperCase(), password: 'ana-pass-1' } });
      t.check('the email is unique within a brand, whatever the case', again.status === 409, again.json);

      t.group('E2E-A2 link a TV with MAC + device key');
      var tv = await PG.paidWithKey('ibo');
      var wrongKey = await r('POST', '/customer/devices/link', { token: anaIbo, body: { mac: tv.mac, deviceKey: tv.key === '000000' ? '111111' : '000000' } });
      t.check('a wrong device key is refused', code(wrongKey) === 'customers.device_key_mismatch', wrongKey.json);
      var linked = await r('POST', '/customer/devices/link', { token: anaIbo, body: { mac: tv.mac.toUpperCase(), deviceKey: tv.key } });
      t.check('the TV is linked', linked.status === 200 && linked.json.device.macAddress === tv.mac, linked.json);
      var list = await r('GET', '/customer/devices', { token: anaIbo });
      t.check('the TV is listed', list.json && list.json.devices && list.json.devices.some(function (d) { return d.macAddress === tv.mac; }), list.json);
      var ben = 'ben-' + w() + '@e2e.test';
      await r('POST', '/customer/sign-up', { body: { email: ben, password: 'ben-pass-1' } });
      await r('POST', '/customer/verify-email', { body: { token: await PG.outbox(ben, 'ibo') } });
      var benToken = (await r('POST', '/customer/login', { body: { email: ben, password: 'ben-pass-1' } })).json.token;
      var stolen = await r('POST', '/customer/devices/link', { token: benToken, body: { mac: tv.mac, deviceKey: tv.key } });
      t.check('another customer cannot link it', code(stolen) === 'customers.device_linked_elsewhere', stolen.json);
      var bobTv = await PG.paidWithKey('bob');
      var crossLink = await r('POST', '/customer/devices/link', { token: anaIbo, body: { mac: bobTv.mac, deviceKey: bobTv.key } });
      t.check('bob’s device is not found from ibo', code(crossLink) === 'customers.device_key_mismatch', crossLink.json);
      var trialMac = mac('ae');
      var trialReg = await req('POST', '/dev/devices/register', { mac: trialMac, platform: 'lg' });
      var trialLink = await r('POST', '/customer/devices/link', { token: anaIbo, body: { mac: trialMac, deviceKey: trialReg.json.found.device.deviceKey } });
      t.check('a trial device cannot be linked', code(trialLink) === 'customers.device_not_paid', trialLink.json);
      var deviceId = linked.json.device.id;
      var benUnlink = await r('DELETE', '/customer/devices/' + deviceId, { token: benToken });
      t.check('only its customer can unlink it', benUnlink.status === 404, benUnlink.json);
      var unlink = await r('DELETE', '/customer/devices/' + deviceId, { token: anaIbo });
      var afterUnlink = await r('GET', '/customer/devices', { token: anaIbo });
      t.check('unlink removes it from the account', unlink.status === 200 && !afterUnlink.json.devices.some(function (d) { return d.id === deviceId; }), [unlink.json, afterUnlink.json]);

      t.group('CUS-2, CUS-4 password reset, profile, logout');
      await r('POST', '/customer/password-reset', { body: { email: ana } });
      var unknownReset = await r('POST', '/customer/password-reset', { body: { email: 'nobody@e2e.test' } });
      t.check('a reset for an unknown email gets the same answer', unknownReset.status === 202 && unknownReset.json.sent, unknownReset.json);
      var reset = await r('POST', '/customer/password-reset/confirm', { body: { token: await PG.outbox(ana, 'ibo'), password: 'ana-pass-2' } });
      t.check('the reset link sets a new password', reset.status === 200, reset.json);
      var oldSession = await r('GET', '/customer/me', { token: anaIbo });
      t.check('a reset logs out the old sessions', oldSession.status === 401, oldSession.json);
      anaIbo = (await r('POST', '/customer/login', { body: { email: ana, password: 'ana-pass-2' } })).json.token;
      var newEmail = 'new-' + ana;
      var changed = await r('PATCH', '/customer/me', { token: anaIbo, body: { email: newEmail, currentPassword: 'ana-pass-2' } });
      t.check('a new email clears the verification', changed.status === 200 && changed.json.customer.emailVerified === false, changed.json);
      await r('POST', '/customer/verify-email', { body: { token: await PG.outbox(newEmail, 'ibo') } });
      var meAgain = await r('GET', '/customer/me', { token: anaIbo });
      t.check('until its link is opened', meAgain.json && meAgain.json.customer && meAgain.json.customer.emailVerified === true && meAgain.json.customer.email === newEmail, meAgain.json);
      await r('POST', '/customer/logout', { token: anaIbo });
      var afterLogout = await r('GET', '/customer/me', { token: anaIbo });
      t.check('logout ends the session', afterLogout.status === 401, afterLogout.json);

      t.group('E2E-A3 staff limited to ibo activates on ibo, not on bob');
      var sam = 'sam-' + w() + '@e2e.test';
      var role = await r('POST', '/admin/roles', { token: root, body: { name: 'Playground sellers ' + w(), permissions: ['devices.view', 'devices.activate'] } });
      var roleId = role.json && role.json.role && role.json.role.id;
      t.check('the super admin makes a role from active keys', role.status === 201 && !!roleId, role.json);
      var badRole = await r('POST', '/admin/roles', { token: root, body: { name: 'Bad ' + w(), permissions: ['made.up'] } });
      t.check('a role with an unknown key is refused', code(badRole) === 'staff.unknown_permission', badRole.json);
      var createdStaff = await r('POST', '/admin/staff', { token: root, body: { email: sam, name: 'Sam', password: 'sam-pass-1', roleId: roleId, tenantAccess: ['ibo'] } });
      var samId = createdStaff.json && createdStaff.json.staff && createdStaff.json.staff.id;
      t.check('the super admin adds a staff member for ibo', createdStaff.status === 201 && !!samId && !('passwordHash' in createdStaff.json.staff), createdStaff.json);
      var samToken = (await r('POST', '/admin/login', { body: { email: sam, password: 'sam-pass-1' } })).json.token;
      var iboTv = await PG.paidWithKey('ibo'), bobTv2 = await PG.paidWithKey('bob');
      var view = await r('GET', '/admin/devices/' + iboTv.mac, { token: samToken });
      t.check('views a device on ibo', view.status === 200 && view.json.paid, view.json);
      var actIbo = await r('POST', '/admin/devices/' + iboTv.mac + '/activate', { token: samToken, body: { type: 'yearly' } });
      t.check('activates on ibo', actIbo.status === 200 && actIbo.json.license && actIbo.json.license.activatedBy && actIbo.json.license.activatedBy.actorId === samId, actIbo.json);
      var actBob = await r('POST', '/admin/devices/' + bobTv2.mac + '/activate', { brand: 'bob', token: samToken, body: { type: 'yearly' } });
      t.check('refused on bob: brand not allowed (403)', actBob.status === 403 && code(actBob) === 'staff.brand_not_allowed', actBob.json);
      var manageStaff = await r('GET', '/admin/staff', { token: samToken });
      t.check('refused staff management: missing permission (403)', manageStaff.status === 403 && code(manageStaff) === 'staff.missing_permission', manageStaff.json);
      var rootOnBob = await r('GET', '/admin/devices/' + bobTv2.mac, { brand: 'bob', token: root });
      t.check('super_admin may act on every brand', rootOnBob.status === 200, rootOnBob.json);
      var noSession = await r('GET', '/admin/devices/' + iboTv.mac);
      t.check('no session: 401', noSession.status === 401, noSession.json);

      t.group('E2E-A4 a permission removed from a role');
      var tv4 = await PG.paidWithKey('ibo');
      var editRole = await r('PATCH', '/admin/roles/' + roleId, { token: root, body: { permissions: ['devices.view'] } });
      t.check('the super admin removes devices.activate from the role', editRole.status === 200 && editRole.json.role.permissions.join() === 'devices.view', editRole.json);
      var refused = await r('POST', '/admin/devices/' + tv4.mac + '/activate', { token: samToken, body: { type: 'yearly' } });
      t.check('the next request with it is refused', refused.status === 403 && code(refused) === 'staff.missing_permission', refused.json);
      var stillViews = await r('GET', '/admin/devices/' + tv4.mac, { token: samToken });
      t.check('the kept permission still works', stillViews.status === 200, stillViews.json);
      var sysEdit = await r('PATCH', '/admin/roles/super_admin', { token: root, body: { name: 'Root' } });
      var sysDelete = await r('DELETE', '/admin/roles/super_admin', { token: root });
      t.check('super_admin cannot be edited or deleted', code(sysEdit) === 'staff.system_role' && code(sysDelete) === 'staff.system_role', [sysEdit.json, sysDelete.json]);
      var perms = await r('GET', '/admin/permissions', { token: root });
      t.check('permissions come from the code', ['devices.view', 'devices.activate', 'staff.manage', 'roles.manage'].every(function (k) {
        return perms.json && perms.json.permissions && perms.json.permissions.some(function (p) { return p.key === k && p.active; });
      }), perms.json);

      t.group('two-factor login');
      var setUp = await r('POST', '/admin/me/two-factor/setup', { token: samToken });
      t.check('setup gives a secret for the app', setUp.status === 200 && /^[A-Z2-7]{32}$/.test(setUp.json.secret), setUp.json);
      var enable = await r('POST', '/admin/me/two-factor/enable', { token: samToken, body: { code: await PG.totp(setUp.json.secret) } });
      t.check('a first code turns it on', enable.status === 200 && enable.json.enabled, enable.json);
      var step1 = await r('POST', '/admin/login', { body: { email: sam, password: 'sam-pass-1' } });
      t.check('the password alone gives a challenge, not a session', step1.json && step1.json.twoFactorRequired && !step1.json.token, step1.json);
      var challengeAsSession = await r('GET', '/admin/me', { token: step1.json.challenge });
      t.check('the challenge is not a session', challengeAsSession.status === 401, challengeAsSession.json);
      var current = await PG.totp(setUp.json.secret);
      var badCode = await r('POST', '/admin/login/two-factor', { body: { challenge: step1.json.challenge, code: current === '000000' ? '111111' : '000000' } });
      t.check('a wrong code is refused', code(badCode) === 'staff.invalid_two_factor_code', badCode.json);
      var step2 = await r('POST', '/admin/login/two-factor', { body: { challenge: step1.json.challenge, code: await PG.totp(setUp.json.secret) } });
      t.check('the right code finishes the login', step2.status === 200 && !!step2.json.token, step2.json);
      var me2 = await r('GET', '/admin/me', { token: step2.json.token });
      t.check('/admin/me shows 2FA on and the role', me2.json && me2.json.staff && me2.json.staff.twoFactorEnabled && me2.json.role && me2.json.role.id === roleId, me2.json);
      samToken = step2.json.token;

      t.group('E2E-A5 disable a staff member while logged in');
      var beforeDisable = await r('GET', '/admin/me', { token: samToken });
      var self = await r('PATCH', '/admin/staff/' + rootLogin.json.staff.id, { token: root, body: { status: 'disabled' } });
      t.check('nobody disables themselves', code(self) === 'staff.cannot_change_self', self.json);
      var disabled = await r('PATCH', '/admin/staff/' + samId, { token: root, body: { status: 'disabled' } });
      var afterDisable = await r('GET', '/admin/me', { token: samToken });
      t.check('the next request is refused', beforeDisable.status === 200 && disabled.status === 200 && afterDisable.status === 401, [beforeDisable.status, disabled.json, afterDisable.json]);
      var relogin = await r('POST', '/admin/login', { body: { email: sam, password: 'sam-pass-1' } });
      t.check('and a new login too', code(relogin) === 'staff.disabled', relogin.json);
      await r('POST', '/admin/logout', { token: root });
      var rootAfter = await r('GET', '/admin/me', { token: root });
      t.check('logout ends the staff session', rootAfter.status === 401, rootAfter.json);
    }
  });
})();
`;
