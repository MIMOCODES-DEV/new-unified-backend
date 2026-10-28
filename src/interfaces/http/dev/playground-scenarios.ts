/**
 * The playground's scenarios (`/dev/playground/scenarios.js`): the E2E-* stories of the phase tests
 * pages, told step by step against the `ibo` brand (X1 also on `bob`). Each step says what it does and
 * what should happen, then checks it; the device it works on is shown in the playground's side panel.
 * Plain browser JavaScript inside a string: no backticks or template placeholders.
 */
export const PLAYGROUND_SCENARIOS_JS = String.raw`(function () {
  var PG = window.PG, code = PG.code, ok = PG.ok;
  var D = '/dev/devices', L = function (m) { return '/dev/licenses/' + m; }, P = function (m) { return '/dev/playlists/' + m; };
  var register = function (s, m, extra, brand) {
    return s.req('POST', D + '/register', Object.assign({ mac: m, platform: 'samsung', appVersion: '1.0.0' }, extra || {}), { brand: brand });
  };
  var activate = function (s, m, body, brand) {
    return s.req('POST', L(m) + '/activate', Object.assign({ type: 'yearly', source: 'code', sourceId: 'code-' + PG.word() }, body || {}), { brand: brand });
  };
  var call = function (s, method, path, o) { o = o || {}; return s.req(method, path, o.body, { brand: o.brand, token: o.token }); };
  /** A super admin and its session, for the staff scenarios. */
  var superAdmin = async function (s) {
    await s.req('POST', '/dev/rate-limits/reset');
    var email = 'root-' + PG.word() + '@playground.test', password = 'root-pass-' + PG.word();
    await call(s, 'POST', '/dev/staff/super-admin', { body: { email: email, name: 'Playground Root', password: password } });
    var login = await call(s, 'POST', '/admin/login', { body: { email: email, password: password } });
    return login.json;
  };

  PG.scenario({
    id: 'F1', phase: 1, nav: 'Brand from the host', title: 'Each request is served for the brand of its host', tasks: ['F-4', 'F-5'],
    story: 'One backend serves every brand. The host of a request decides the brand, and the brand decides the database; a host nobody configured is refused.',
    steps: [
      { title: 'A request on ibo.localhost', does: 'GET /tenant on the ibo host.', expect: 'served as IBO Player, from the ibo database.',
        run: async function (s) {
          var r = await s.req('GET', '/tenant');
          var b = await s.req('GET', '/dev/brand');
          s.expect('served as ibo', r.json && r.json.slug === 'ibo', r.json);
          s.expect('reads the ibo database', b.json && b.json.dbName === 'ibo', b.json && b.json.dbName);
        } },
      { title: 'The same request on bob.localhost', does: 'GET /tenant on the bob host.', expect: 'served as BOB Player, from another database.',
        run: async function (s) {
          var r = await s.req('GET', '/tenant', undefined, { brand: 'bob' });
          var b = await s.req('GET', '/dev/brand', undefined, { brand: 'bob' });
          s.expect('served as bob', r.json && r.json.slug === 'bob', r.json);
          s.expect('its own database', b.json && b.json.dbName && b.json.dbName !== 'ibo', b.json && b.json.dbName);
        } },
      { title: 'A host nobody configured', does: 'Ask which brand unknown.example.com is.', expect: 'none: a request there gets 421 tenants.unknown_host.',
        run: async function (s) {
          var r = await s.req('GET', '/dev/brands/resolve?host=unknown.example.com');
          s.expect('refused with 421', r.json && r.json.found === false && r.json.status === 421 && r.json.code === 'tenants.unknown_host', r.json);
        } },
      { title: 'Load balancers', does: 'GET /health and /ready.', expect: 'ok without a brand check; MongoDB, Redis and the brand databases up.',
        run: async function (s) {
          var h = await s.req('GET', '/health'), r = await s.req('GET', '/ready');
          s.expect('/health ok', h.json && h.json.status === 'ok', h.json);
          s.expect('/ready: everything up', r.json && r.json.checks && r.json.checks.mongo === 'up' && r.json.checks.redis === 'up', r.json);
        } }
    ]
  });

  PG.scenario({
    id: 'D1', phase: 3, nav: 'A new TV registers', title: 'A new MAC registers and gets a trial', tasks: ['DEV-1'],
    story: 'A TV opens the app for the first time. The backend makes a trial device for its MAC; the next start finds the same device, and another brand never sees it.',
    steps: [
      { title: 'The app starts on a new TV', does: 'POST /dev/devices/register with a random MAC, platform samsung.', expect: 'a new trial device, ending at the end of the UTC day 7 days out, PIN 0000, a 6-digit key.',
        run: async function (s) {
          s.vars.mac = PG.mac('aa');
          var r = await register(s, s.vars.mac);
          var d = r.json && r.json.found && r.json.found.device;
          s.expect('a device was created', ok(r) && r.json.created === true, r.json);
          s.expect('it is a trial, not paid', r.json && r.json.found && r.json.found.paid === false, r.json);
          s.expect('the trial ends at 23:59:59.999 UTC', d && new Date(d.trialEndsAt).getUTCHours() === 23, d);
          s.expect('parental PIN 0000 and a 6-digit key', d && d.parentPin === '0000' && /^[1-9]\d{5}$/.test(d.deviceKey), d);
          s.vars.id = d && d.id;
          s.show(s.vars.mac);
        } },
      { title: 'The app starts again, MAC in another format', does: 'The same MAC in upper case with dashes, a newer app version.', expect: 'the same device, no new trial; the visit updates the app version.',
        run: async function (s) {
          var r = await register(s, s.vars.mac.toUpperCase().replace(/:/g, '-'), { appVersion: '1.1.0' });
          s.expect('no new device', r.json && r.json.created === false, r.json);
          s.expect('same device id', r.json && r.json.found.device.id === s.vars.id, r.json);
          s.expect('app version recorded', r.json && r.json.found.device.appVersion === '1.1.0', r.json);
        } },
      { title: 'Another brand looks for it', does: 'GET the MAC on bob.localhost.', expect: 'devices.not_found: each brand has its own database.',
        run: async function (s) {
          var r = await s.req('GET', D + '/' + s.vars.mac, undefined, { brand: 'bob' });
          s.expect('bob does not see the ibo device', code(r) === 'devices.not_found', r.json);
        } }
    ]
  });

  PG.scenario({
    id: 'D2', phase: 2, nav: 'Ten sign-ups at once', title: 'The same MAC registers 10 times at once', tasks: ['UNQ', 'LOCK'],
    story: 'A TV retries its first call many times, from many servers at once. The Redis lock on the MAC makes sure only one device is created.',
    steps: [
      { title: 'Ten registrations in parallel', does: 'Ten POST /register calls for one new MAC, sent together.', expect: 'exactly one says created; all ten answer with the same device id.',
        run: async function (s) {
          s.vars.mac = PG.mac('aa');
          var all = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function () { return register(s, s.vars.mac); }));
          var created = all.filter(function (r) { return r.json && r.json.created === true; }).length;
          var ids = {};
          all.forEach(function (r) { if (r.json && r.json.found) ids[r.json.found.device.id] = true; });
          s.expect('all ten answered', all.every(ok), all.map(function (r) { return r.status; }));
          s.expect('exactly one created the device', created === 1, created);
          s.expect('one device id for all of them', Object.keys(ids).length === 1, Object.keys(ids));
          s.show(s.vars.mac);
        } },
      { title: 'Look it up', does: 'GET the MAC.', expect: 'one trial device.',
        run: async function (s) {
          var r = await s.req('GET', D + '/' + s.vars.mac);
          s.expect('found as one trial device', r.json && r.json.device && r.json.paid === false, r.json);
        } }
    ]
  });

  PG.scenario({
    id: 'D3', phase: 3, nav: 'Placeholder MAC, two TVs', title: 'A fallback MAC registers from two TVs', tasks: ['DEV-2'],
    story: 'Some TVs report a shared placeholder MAC (52:54:00:12:34:57). Each app instead sends its own app device id, and each gets its own device with a made-up MAC.',
    steps: [
      { title: 'A TV sends only the placeholder MAC', does: 'POST /register with 52:54:00:12:34:57 and no app device id.', expect: 'refused: devices.device_id_missing.',
        run: async function (s) {
          var r = await register(s, '52:54:00:12:34:57', { platform: 'windows' });
          s.expect('refused', code(r) === 'devices.device_id_missing', r.json);
        } },
      { title: 'Two TVs send it with their own app ids', does: 'Two registrations on the placeholder MAC, each with a random appDeviceId.', expect: 'two different devices, each with a locally administered MAC.',
        run: async function (s) {
          s.vars.a = 'app-' + PG.word(); s.vars.b = 'app-' + PG.word();
          var a = await register(s, '52:54:00:12:34:57', { platform: 'windows', appDeviceId: s.vars.a });
          var b = await register(s, '52:54:00:12:34:57', { platform: 'windows', appDeviceId: s.vars.b });
          var am = a.json && a.json.found && a.json.found.device.macAddress;
          s.expect('both created', a.json && a.json.created && b.json && b.json.created, [a.json, b.json]);
          s.expect('two different devices', a.json.found.device.id !== b.json.found.device.id, [a.json, b.json]);
          s.expect('the made-up MAC is locally administered', am && (parseInt(am.slice(0, 2), 16) & 3) === 2, am);
          s.vars.idA = a.json.found.device.id;
          s.show(am);
        } },
      { title: 'The first TV comes back with no MAC at all', does: 'POST /register with mac null and the first app id.', expect: 'the first TV’s device again.',
        run: async function (s) {
          var r = await register(s, null, { platform: 'windows', appDeviceId: s.vars.a });
          s.expect('found, not created', r.json && r.json.created === false && r.json.found.device.id === s.vars.idA, r.json);
        } }
    ]
  });

  PG.scenario({
    id: 'D4', phase: 3, nav: 'V4 app, solved captcha', title: 'A V4 device sends the same solved code again', tasks: ['DEV-4'],
    story: 'A V4 app must solve a captcha once. CRPlayer-type apps send the same solved code on every start; it must keep working, and a different uid must ask for the recovery captcha.',
    steps: [
      { title: 'A new MAC logs in without a captcha', does: 'POST /v4/login with uid QW12ER.', expect: 'devices.captcha_required.',
        run: async function (s) {
          s.vars.mac = PG.mac('aa');
          var r = await s.req('POST', D + '/v4/login', { mac: s.vars.mac, platform: 'lg', uid: 'QW12ER' });
          s.expect('a captcha is required', code(r) === 'devices.captcha_required', r.json);
        } },
      { title: 'It solves the captcha', does: 'Get a captcha (the dev route reveals the answer) and log in with it.', expect: 'the device is created as V4 with the uid.',
        run: async function (s) {
          var cap = await s.req('POST', D + '/captcha', { mac: s.vars.mac, platform: 'lg', revealAnswer: true });
          s.vars.cap = cap.json;
          var r = await s.req('POST', D + '/v4/login', { mac: s.vars.mac, platform: 'lg', uid: 'QW12ER', captcha: { token: cap.json.token, answer: cap.json.answer } });
          s.expect('logged in', ok(r), r.json);
          s.expect('V4 device with uid QW12ER', r.json && r.json.device && r.json.device.apiVersion === 'v4' && r.json.device.uid === 'QW12ER', r.json);
          s.show(s.vars.mac);
        } },
      { title: 'Next start: the same solved code again', does: 'Log in again with the same token and answer.', expect: 'still fine; no new captcha.',
        run: async function (s) {
          var r = await s.req('POST', D + '/v4/login', { mac: s.vars.mac, platform: 'lg', uid: 'QW12ER', captcha: { token: s.vars.cap.token, answer: s.vars.cap.answer } });
          s.expect('logged in again', ok(r), r.json);
        } },
      { title: 'Another uid on the same MAC', does: 'Log in with uid NEW999.', expect: 'devices.uid_mismatch: the recovery captcha is needed.',
        run: async function (s) {
          var r = await s.req('POST', D + '/v4/login', { mac: s.vars.mac, platform: 'lg', uid: 'NEW999' });
          s.expect('uid mismatch', code(r) === 'devices.uid_mismatch', r.json);
        } }
    ]
  });

  PG.scenario({
    id: 'L1', phase: 3, nav: 'Activate from a code', title: 'Activate a device from a code', tasks: ['LIC-1', 'LIC-2'],
    story: 'A customer buys a yearly code and enters it. The trial device moves to devices with the same id, and the year starts where the trial ends.',
    steps: [
      { title: 'A TV is on its trial', does: 'Register a new MAC and read its license state.', expect: 'state trial, active, ending at the trial end.',
        run: async function (s) {
          s.vars.mac = PG.mac('ac');
          var r = await register(s, s.vars.mac, { platform: 'lg' });
          s.vars.trialEndsAt = r.json.found.device.trialEndsAt;
          s.vars.id = r.json.found.device.id;
          var st = (await s.req('GET', L(s.vars.mac))).json;
          s.expect('state trial, active', st.state === 'trial' && st.active, st);
          s.show(s.vars.mac);
        } },
      { title: 'The code is entered', does: 'POST /activate, yearly, source code.', expect: 'a yearly license ending a year after the trial end, 1 credit.',
        run: async function (s) {
          var r = await activate(s, s.vars.mac);
          s.expect('activated', ok(r), r.json);
          s.expect('keeps the trial days left', r.json.license.expiresAt === PG.yearAfter(s.vars.trialEndsAt), [r.json.license.expiresAt, s.vars.trialEndsAt]);
          s.expect('costs 1 credit', r.json.license.creditCost === 1, r.json.license);
        } },
      { title: 'The device is now paid', does: 'GET the device.', expect: 'in devices (paid), same id as the trial.',
        run: async function (s) {
          var r = await s.req('GET', D + '/' + s.vars.mac);
          s.expect('paid', r.json.paid === true, r.json);
          s.expect('same id', r.json.device.id === s.vars.id, r.json.device);
        } }
    ]
  });

  PG.scenario({
    id: 'L2', phase: 3, nav: 'Same code twice', title: 'The same source activates once', tasks: ['LIC-2'],
    story: 'A payment webhook or a code arrives twice. The second time must not add another year.',
    steps: [
      { title: 'Activate with a source id', does: 'Register, then activate with sourceId X.', expect: 'a new license.',
        run: async function (s) {
          s.vars.mac = PG.mac('ac'); s.vars.source = 'pay-' + PG.word();
          await register(s, s.vars.mac);
          var r = await activate(s, s.vars.mac, { source: 'payment', sourceId: s.vars.source });
          s.vars.license = r.json.license;
          s.expect('created', ok(r) && r.json.created !== false, r.json);
          s.show(s.vars.mac);
        } },
      { title: 'The same source again', does: 'Activate again with the same sourceId.', expect: 'created false, the same license, the same end date.',
        run: async function (s) {
          var r = await activate(s, s.vars.mac, { source: 'payment', sourceId: s.vars.source });
          s.expect('not created again', r.json.created === false, r.json);
          s.expect('same license and end', r.json.license.id === s.vars.license.id && r.json.license.expiresAt === s.vars.license.expiresAt, r.json.license);
        } }
    ]
  });

  PG.scenario({
    id: 'L3', phase: 3, nav: 'Stack a year', title: 'Stack a year, then go lifetime', tasks: ['LIC-1'],
    story: 'A yearly customer renews early; the new year adds onto the current end. Upgrading to lifetime removes the end date.',
    steps: [
      { title: 'First year', does: 'Register and activate yearly.', expect: 'an end date a year out.',
        run: async function (s) {
          s.vars.mac = PG.mac('ac');
          await register(s, s.vars.mac);
          var r = await activate(s, s.vars.mac);
          s.vars.end = r.json.license.expiresAt;
          s.expect('yearly with an end date', r.json.license.type === 'yearly' && !!s.vars.end, r.json.license);
          s.show(s.vars.mac);
        } },
      { title: 'Renew before it ends', does: 'Activate another year with a new source.', expect: 'the end moves a year after the first end.',
        run: async function (s) {
          var r = await activate(s, s.vars.mac);
          s.expect('stacked on the first year', r.json.license.expiresAt === PG.yearAfter(s.vars.end), [r.json.license.expiresAt, s.vars.end]);
        } },
      { title: 'Upgrade to lifetime', does: 'Activate lifetime, then try a year on top.', expect: 'no end date, 2 credits; a further year is refused.',
        run: async function (s) {
          var life = await activate(s, s.vars.mac, { type: 'lifetime' });
          s.expect('lifetime, no end, 2 credits', life.json.license.expiresAt === null && life.json.license.creditCost === 2, life.json.license);
          var more = await activate(s, s.vars.mac);
          s.expect('a year on lifetime is refused', code(more) === 'licensing.already_lifetime', more.json);
        } }
    ]
  });

  PG.scenario({
    id: 'L4', phase: 3, nav: 'Revoke, pay again', title: 'Revoke a license, then pay again', tasks: ['LIC-3'],
    story: 'Staff revoke a license (fraud, refund). The row stays as history and the device stays paid but cannot play; paying again starts a new year today.',
    steps: [
      { title: 'A paid device', does: 'Register and activate yearly.', expect: 'state yearly, active.',
        run: async function (s) {
          s.vars.mac = PG.mac('ac');
          await register(s, s.vars.mac);
          await activate(s, s.vars.mac, { actorId: 'staff-1' });
          var st = (await s.req('GET', L(s.vars.mac))).json;
          s.expect('yearly, active', st.state === 'yearly' && st.active, st);
          s.show(s.vars.mac);
        } },
      { title: 'Staff revoke it', does: 'POST /revoke, then revoke again.', expect: 'revoked kept with revokedAt; state revoked, cannot play; a second revoke is refused.',
        run: async function (s) {
          var r = await s.req('POST', L(s.vars.mac) + '/revoke');
          var twice = await s.req('POST', L(s.vars.mac) + '/revoke');
          var st = (await s.req('GET', L(s.vars.mac))).json;
          s.expect('row kept, revokedAt set', r.json.revoked === true && !!r.json.revokedAt, r.json);
          s.expect('state revoked, not active', st.state === 'revoked' && !st.active, st);
          s.expect('second revoke refused', code(twice) === 'licensing.already_revoked', twice.json);
        } },
      { title: 'The customer pays again', does: 'Activate yearly; read the history.', expect: 'the year starts today; history has both, the new one current.',
        run: async function (s) {
          var r = await activate(s, s.vars.mac, { actorId: 'staff-2' });
          var hist = (await s.req('GET', L(s.vars.mac) + '/history')).json;
          s.expect('a year from today', r.json.license.expiresAt === PG.yearAfter(new Date().toISOString()), r.json.license);
          s.expect('two rows, old revoked, new current', hist.length === 2 && hist[0].state === 'revoked' && hist[1].current, hist);
        } }
    ]
  });

  PG.scenario({
    id: 'P1', phase: 3, nav: 'Playlists add and sync', title: 'Playlists: add, edit, delete and sync', tasks: ['PL-1', 'PL-2'],
    story: 'A device adds an Xtream link (parsed once into server, user, password), renames and deletes playlists, then the app syncs its whole list.',
    steps: [
      { title: 'Add an Xtream link and an M3U', does: 'Two adds on a new trial device.', expect: 'Xtream parsed into server, username, password; the counter says 2.',
        run: async function (s) {
          s.vars.mac = PG.mac('ab'); s.vars.host = 'line-' + PG.word() + '.example.com';
          await register(s, s.vars.mac);
          var x = await s.req('POST', P(s.vars.mac) + '/add', { name: 'Xtream', source: { kind: 'link', url: 'http://' + s.vars.host + ':8080/get.php?username=u1&password=p1&type=m3u_plus' } });
          var m = await s.req('POST', P(s.vars.mac) + '/add', { name: 'M3U', source: { kind: 'link', url: 'http://' + s.vars.host + '/list.m3u' } });
          s.vars.m3u = m.json.id;
          s.expect('Xtream parsed', x.json.type === 'xtream' && x.json.xtream.username === 'u1', x.json);
          var d = (await s.req('GET', D + '/' + s.vars.mac)).json.device;
          s.expect('playlistCount 2', d.playlistCount === 2, d);
          s.show(s.vars.mac);
        } },
      { title: 'Same playlist twice, then rename and delete', does: 'Add the M3U again; rename it; delete it.', expect: 'the duplicate is refused; the counter goes back to 1.',
        run: async function (s) {
          var dup = await s.req('POST', P(s.vars.mac) + '/add', { name: 'Again', source: { kind: 'link', url: 'http://' + s.vars.host + '/list.m3u' } });
          s.expect('duplicate refused', code(dup) === 'playlists.exists', dup.json);
          var ren = await s.req('POST', P(s.vars.mac) + '/' + s.vars.m3u + '/edit', { name: 'Renamed' });
          s.expect('renamed', ren.json.name === 'Renamed', ren.json);
          await s.req('POST', P(s.vars.mac) + '/' + s.vars.m3u + '/delete', {});
          var d = (await s.req('GET', D + '/' + s.vars.mac)).json.device;
          s.expect('playlistCount 1', d.playlistCount === 1, d);
        } },
      { title: 'The app syncs its list', does: 'POST /sync with one new item.', expect: 'the new item gets an id and keeps its origin id.',
        run: async function (s) {
          var r = await s.req('POST', P(s.vars.mac) + '/sync', { playlists: [{ originId: 'non_saved_1', name: 'Synced', url: 'http://' + s.vars.host + '/synced.m3u' }], removeIds: [] });
          s.expect('added with an id', ok(r) && r.json.playlists[0].id && r.json.playlists[0].originId === 'non_saved_1', r.json);
        } }
    ]
  });

  PG.scenario({
    id: 'P2', phase: 3, nav: 'Playlist PIN', title: 'A PIN protects a playlist on the website', tasks: ['PL-3'],
    story: 'A parent protects the kids playlist with a PIN. The dashboard hides it until the PIN is given; the TV app still plays it.',
    steps: [
      { title: 'Add it protected from the website', does: 'Add with PIN 1234, via website.', expect: 'protected; the PIN is stored encrypted, never as 1234.',
        run: async function (s) {
          s.vars.mac = PG.mac('ab');
          await register(s, s.vars.mac);
          var r = await s.req('POST', P(s.vars.mac) + '/add', { name: 'Kids', source: { kind: 'link', url: 'http://kids-' + PG.word() + '.example.com/k.m3u' }, pin: '1234', via: 'website' });
          s.vars.id = r.json.id;
          s.expect('protected', r.json.protected === true, r.json);
          s.expect('PIN encrypted', String(r.json.pinEnc).indexOf('v1:') === 0 && String(r.json.pinEnc).indexOf('1234') < 0, r.json.pinEnc);
          s.show(s.vars.mac);
        } },
      { title: 'The dashboard lists it', does: 'GET /dashboard; unlock with no PIN, a wrong PIN, the right one.', expect: 'hidden; only the right PIN unlocks the link.',
        run: async function (s) {
          var dash = (await s.req('GET', P(s.vars.mac) + '/dashboard')).json.filter(function (p) { return p.id === s.vars.id; })[0];
          s.expect('hidden on the dashboard', dash.hidden === true && dash.url === undefined, dash);
          var none = await s.req('POST', P(s.vars.mac) + '/' + s.vars.id + '/unlock', {});
          var wrong = await s.req('POST', P(s.vars.mac) + '/' + s.vars.id + '/unlock', { pin: '9999' });
          var right = await s.req('POST', P(s.vars.mac) + '/' + s.vars.id + '/unlock', { pin: '1234' });
          s.expect('no PIN: pin_required', code(none) === 'playlists.pin_required', none.json);
          s.expect('wrong PIN: wrong_pin', code(wrong) === 'playlists.wrong_pin', wrong.json);
          s.expect('right PIN shows the link', !!(right.json && right.json.url), right.json);
        } },
      { title: 'The TV app gets it', does: 'GET /reply, and with includePins for Roku and iOS.', expect: 'the link always; the PIN only when asked.',
        run: async function (s) {
          var a = (await s.req('GET', P(s.vars.mac) + '/reply')).json.playlists.filter(function (p) { return p.id === s.vars.id; })[0];
          var b = (await s.req('GET', P(s.vars.mac) + '/reply?includePins=true')).json.playlists.filter(function (p) { return p.id === s.vars.id; })[0];
          s.expect('the app gets the link, no PIN', a && a.url && a.pin === undefined, a);
          s.expect('Roku and iOS get the PIN', b && b.pin === '1234', b);
        } }
    ]
  });

  PG.scenario({
    id: 'P3', phase: 3, nav: 'Reply profiles', title: 'What the app gets: profiles, demo and backups', tasks: ['PL-4', 'PL-5'],
    story: 'The brand decides how Xtream goes out (ibo: server + login). A device with no playlist gets the demo; backup hosts become backup links.',
    steps: [
      { title: 'A device with no playlist', does: 'GET /reply for a new device.', expect: 'hasOwnPlaylist false; only the demo (or nothing).',
        run: async function (s) {
          s.vars.mac = PG.mac('ab');
          await register(s, s.vars.mac);
          var r = (await s.req('GET', P(s.vars.mac) + '/reply')).json;
          s.expect('no own playlist, demo only', r.hasOwnPlaylist === false && r.playlists.every(function (p) { return p.demo; }), r);
          s.show(s.vars.mac);
        } },
      { title: 'Add Xtream and read the reply', does: 'Add an Xtream link; GET /reply.', expect: 'ibo’s xc profile: type xc, url is the server, username separate.',
        run: async function (s) {
          s.vars.host = 'line-' + PG.word() + '.example.com';
          var x = await s.req('POST', P(s.vars.mac) + '/add', { name: 'Xtream', source: { kind: 'link', url: 'http://' + s.vars.host + ':8080/get.php?username=u1&password=p1&type=m3u_plus' } });
          s.vars.id = x.json.id;
          var it = (await s.req('GET', P(s.vars.mac) + '/reply')).json.playlists[0];
          s.expect('xc shape', it.type === 'xc' && it.url === 'http://' + s.vars.host + ':8080/' && it.username === 'u1', it);
        } },
      { title: 'Add backup hosts', does: 'Two backup hosts on the Xtream playlist.', expect: 'the reply carries the two backup links, scheme and port filled in.',
        run: async function (s) {
          await s.req('POST', P(s.vars.mac) + '/' + s.vars.id + '/backup', { enabled: true, hosts: ['Mirror.example.com', 'https://m2.example.com:2095'] });
          var it = (await s.req('GET', P(s.vars.mac) + '/reply')).json.playlists[0];
          s.expect('two backup links', JSON.stringify(it.backupUrls) === JSON.stringify(['http://mirror.example.com:8080/', 'https://m2.example.com:2095/']), it.backupUrls);
        } }
    ]
  });

  PG.scenario({
    id: 'S1', phase: 4, nav: 'MAC switch', title: 'A paid device switches MAC', tasks: ['DEV-7'],
    story: 'A customer replaces their TV. The lifetime license moves to the new MAC with its id and playlists; the new TV’s trial is absorbed and the old MAC keeps an ended trial.',
    steps: [
      { title: 'The old TV, paid, with a playlist', does: 'Register, activate lifetime, add “News”.', expect: 'a paid lifetime device.',
        run: async function (s) {
          s.vars.from = PG.mac('ae');
          await register(s, s.vars.from);
          await activate(s, s.vars.from, { type: 'lifetime', source: 'admin' });
          await PG.addLink(s.vars.from, 'News', 'http://a-' + PG.word() + '.example/a.m3u');
          var d = await PG.device(s.vars.from);
          s.vars.id = d.device.id;
          s.expect('paid', d.paid, d);
          s.show(s.vars.from);
        } },
      { title: 'The new TV installs the app', does: 'Register the new MAC; it adds its own “News”.', expect: 'a trial device on the new MAC.',
        run: async function (s) {
          s.vars.to = PG.mac('ae');
          await register(s, s.vars.to);
          await PG.addLink(s.vars.to, 'News', 'http://b-' + PG.word() + '.example/b.m3u');
          var d = await PG.device(s.vars.to);
          s.expect('trial on the new MAC', d && !d.paid, d);
        } },
      { title: 'Switch the MAC', does: 'POST /switch { newMac }.', expect: 'the same device id on the new MAC; playlists “News” and “News (2)”.',
        run: async function (s) {
          var r = await s.req('POST', L(s.vars.from) + '/switch', { newMac: s.vars.to });
          s.expect('switched', ok(r), r.json);
          var d = await PG.device(s.vars.to);
          s.expect('same id on the new MAC', d.paid && d.device.id === s.vars.id, d);
          var names = (await s.req('GET', P(s.vars.to))).json.map(function (p) { return p.name; }).sort();
          s.expect('the trial playlist absorbed as “News (2)”', JSON.stringify(names) === '["News","News (2)"]', names);
          s.show(s.vars.to);
        } },
      { title: 'The old MAC and the limit', does: 'Read the old MAC; try a second switch.', expect: 'the old MAC has an ended trial; a second switch is refused (limit 1).',
        run: async function (s) {
          var old = await PG.device(s.vars.from);
          s.expect('old MAC: ended trial', old && !old.paid && new Date(old.device.trialEndsAt) < new Date(), old);
          var again = await s.req('POST', L(s.vars.to) + '/switch', { newMac: await PG.trial() });
          s.expect('second switch refused', code(again) === 'licensing.mac_switch_limit', again.json);
        } }
    ]
  });

  PG.scenario({
    id: 'R1', phase: 4, nav: 'Recovery on a new TV', title: 'A recovery code moves a paid device to a new TV', tasks: ['REC-1', 'REC-2', 'REC-3'],
    story: 'The old TV is broken. The owner makes a recovery code on the website and types it on the new TV: the device moves with its id, license and playlists; nothing is left behind.',
    steps: [
      { title: 'A paid device with its playlist', does: 'Register, activate lifetime, add “Mine”.', expect: 'paid.',
        run: async function (s) {
          s.vars.mac = PG.mac('ae');
          await register(s, s.vars.mac);
          await activate(s, s.vars.mac, { type: 'lifetime', source: 'admin' });
          await PG.addLink(s.vars.mac, 'Mine', 'http://own-' + PG.word() + '.example/own.m3u');
          s.vars.id = (await PG.device(s.vars.mac)).device.id;
          s.show(s.vars.mac);
        } },
      { title: 'The website makes a code', does: 'POST /recovery-code.', expect: '8 characters, valid for 30 minutes.',
        run: async function (s) {
          var r = await s.req('POST', L(s.vars.mac) + '/recovery-code');
          s.vars.code = r.json.code;
          var minutes = (new Date(r.json.expiresAt) - Date.now()) / 60000;
          s.expect('8 characters', /^[A-Z2-9]{8}$/.test(r.json.code || ''), r.json);
          s.expect('30 minutes', minutes > 29 && minutes <= 30, r.json.expiresAt);
        } },
      { title: 'The new TV installs the app', does: 'Register a new MAC with its own trial playlist.', expect: 'a trial device on the new TV.',
        run: async function (s) {
          s.vars.tv = PG.mac('ae');
          await register(s, s.vars.tv);
          await PG.addLink(s.vars.tv, 'Trial list', 'http://tv-' + PG.word() + '.example/tv.m3u');
          s.vars.tvId = (await PG.device(s.vars.tv)).device.id;
          s.expect('trial', !!s.vars.tvId);
        } },
      { title: 'The code is typed on the new TV', does: 'POST /recover with the code in lower case.', expect: 'the paid device takes the new MAC, keeps id and “Mine”; the new TV’s trial is removed.',
        run: async function (s) {
          var r = await s.req('POST', '/dev/licenses/recover', { code: s.vars.code.toLowerCase(), newMac: s.vars.tv });
          s.expect('recovered', ok(r) && r.json.deviceId === s.vars.id, r.json);
          s.expect('new TV trial removed with 1 playlist', r.json.removedTrialId === s.vars.tvId && r.json.removedPlaylists === 1, r.json);
          var names = (await s.req('GET', P(s.vars.tv))).json.map(function (p) { return p.name; });
          s.expect('keeps only its own playlists', JSON.stringify(names) === '["Mine"]', names);
          s.show(s.vars.tv);
        } },
      { title: 'The code works once', does: 'Use the code again on another TV.', expect: 'licensing.recovery_code_not_found.',
        run: async function (s) {
          var r = await s.req('POST', '/dev/licenses/recover', { code: s.vars.code, newMac: await PG.trial() });
          s.expect('refused', code(r) === 'licensing.recovery_code_not_found', r.json);
        } }
    ]
  });

  PG.scenario({
    id: 'M1', phase: 4, nav: 'Provider moves host', title: 'Three paid devices report a provider move; staff approve', tasks: ['DOM-1', 'DOM-2'],
    story: 'An IPTV provider moves to a new host. Paid customers fix their own links; after 3 different IPs staff see the move, and once approved every device gets the new host.',
    steps: [
      { title: 'A watcher still on the old host', does: 'A paid device with the old link.', expect: 'its reply uses the old host.',
        run: async function (s) {
          s.vars.old = 'line-' + PG.word() + '.e2e.example:8080'; s.vars.new = 'line-' + PG.word() + '.e2e.example:8080';
          s.vars.link = function (h) { return 'http://' + h + '/get.php?username=u&password=p&type=m3u_plus'; };
          s.vars.watcher = await PG.paid();
          await PG.addLink(s.vars.watcher, 'Provider', s.vars.link(s.vars.old));
          var it = (await s.req('GET', P(s.vars.watcher) + '/reply')).json.playlists[0];
          s.expect('old host served', it.url.indexOf(s.vars.old) >= 0, it);
          s.show(s.vars.watcher);
        } },
      { title: 'Three paid devices change the host', does: 'Three paid devices on 3 IPs edit old link → new link.', expect: 'one move, 3 confirmations, awaiting approval, still not served.',
        run: async function (s) {
          for (var i = 1; i <= 3; i++) {
            var m = await PG.paid();
            var added = await PG.addLink(m, 'Provider', s.vars.link(s.vars.old));
            await s.req('POST', P(m) + '/' + added.json.id + '/edit', { source: { kind: 'link', url: s.vars.link(s.vars.new) }, ip: '198.51.100.' + (10 + i) });
          }
          var list = (await s.req('GET', '/dev/domain-moves?filter=awaiting')).json;
          var move = list.filter(function (x) { return x.fromHost === s.vars.old; })[0];
          s.vars.move = move;
          s.expect('awaiting with 3 IPs', move && move.confirmations === 3, move);
          var it = (await s.req('GET', P(s.vars.watcher) + '/reply')).json.playlists[0];
          s.expect('not served yet', it.url.indexOf(s.vars.old) >= 0, it);
        } },
      { title: 'Staff approve', does: 'POST /dev/domain-moves/:id/approve.', expect: 'the watcher gets the new host, the old host first in its backups; its stored link is unchanged.',
        run: async function (s) {
          var r = await s.req('POST', '/dev/domain-moves/' + s.vars.move.id + '/approve', { by: 'playground' });
          s.expect('approved by playground', r.json.status === 'approved' && r.json.decidedBy === 'playground', r.json);
          var it = (await s.req('GET', P(s.vars.watcher) + '/reply')).json.playlists[0];
          s.expect('new host served', it.url.indexOf(s.vars.new) >= 0, it);
          s.expect('old host is the first backup', it.backupUrls[0] && it.backupUrls[0].indexOf(s.vars.old.split(':')[0]) >= 0, it.backupUrls);
          var stored = (await s.req('GET', P(s.vars.watcher))).json[0];
          s.expect('stored link unchanged', stored.url === s.vars.link(s.vars.old), stored);
        } },
      { title: 'Staff change their mind', does: 'Block the move.', expect: 'the old host is served again.',
        run: async function (s) {
          await s.req('POST', '/dev/domain-moves/' + s.vars.move.id + '/block', { by: 'playground' });
          var it = (await s.req('GET', P(s.vars.watcher) + '/reply')).json.playlists[0];
          s.expect('old host again', it.url.indexOf(s.vars.old) >= 0, it);
        } }
    ]
  });

  PG.scenario({
    id: 'C1', phase: 4, nav: 'Cleanup dry run', title: 'Cleanup of old trial devices: dry run', tasks: ['LIC-4'],
    story: 'Trial devices whose trial ended, with no playlist and not seen for 180 days, can be removed. Here only the report: the real run is the CLI with --apply.',
    steps: [
      { title: 'Run the report', does: 'GET /dev/licenses/cleanup?days=180.', expect: 'dryRun true, nothing deleted.',
        run: async function (s) {
          var r = await s.req('GET', '/dev/licenses/cleanup?days=180');
          s.expect('a dry run', ok(r) && r.json.dryRun === true, r.json);
          s.expect('nothing deleted', r.json.deleted === 0, r.json);
        } },
      { title: 'A bad rule', does: 'days=0.', expect: 'refused with 400.',
        run: async function (s) {
          var r = await s.req('GET', '/dev/licenses/cleanup?days=0');
          s.expect('400', r.status === 400, r);
        } }
    ]
  });

  PG.scenario({
    id: 'X1', phase: 4, nav: 'Whole flow, two brands', title: 'The whole device flow on brand A, then brand B', tasks: ['CORE'],
    story: 'The merge-point test: register, add a playlist, activate, switch MAC and recover, first on ibo, then on bob, and neither brand sees the other’s devices.',
    steps: [0, 1].map(function (i) {
      var brand = i === 0 ? 'ibo' : 'bob';
      return { title: 'Full flow on ' + brand, does: 'Register → playlist → lifetime → switch MAC → recovery code → recover on a third TV, all on ' + brand + '.localhost.',
        expect: 'every step answers; the device keeps one id from start to end.',
        run: async function (s) {
          var o = { brand: brand };
          var a = PG.mac('af'), b = PG.mac('af'), c = PG.mac('af');
          var reg = await register(s, a, {}, brand);
          var id = reg.json && reg.json.found && reg.json.found.device.id;
          s.expect('registered', ok(reg) && !!id, reg.json);
          var pl = await s.req('POST', P(a) + '/add', { name: 'Main', source: { kind: 'link', url: 'http://x1-' + PG.word() + '.example/m.m3u' } }, o);
          s.expect('playlist added', ok(pl), pl.json);
          var act = await activate(s, a, { type: 'lifetime', source: 'admin' }, brand);
          s.expect('lifetime activated', ok(act), act.json);
          await register(s, b, {}, brand);
          var sw = await s.req('POST', L(a) + '/switch', { newMac: b }, o);
          s.expect('switched to a second TV', ok(sw), sw.json);
          var made = await s.req('POST', L(b) + '/recovery-code', undefined, o);
          await register(s, c, {}, brand);
          var rec = await s.req('POST', '/dev/licenses/recover', { code: made.json.code, newMac: c }, o);
          s.expect('recovered on a third TV', ok(rec) && rec.json.deviceId === id, rec.json);
          var fin = (await s.req('GET', D + '/' + c, undefined, o)).json;
          s.expect('same id, paid, with its playlist', fin.paid && fin.device.id === id, fin);
          var other = await s.req('GET', D + '/' + c, undefined, { brand: i === 0 ? 'bob' : 'ibo' });
          s.expect('the other brand does not see it', code(other) === 'devices.not_found', other.json);
          s.show(c, brand);
        } };
    })
  });

  PG.scenario({
    id: 'A1', phase: 5, nav: 'Customer on two brands', title: 'A customer signs up, verifies and logs in; the same email on another brand', tasks: ['CUS-1', 'CUS-2'],
    story: 'A customer creates an account on the IBO site. The email must be verified before the first login. The same email on BOB is a separate account with its own password.',
    steps: [
      { title: 'Sign up on ibo', does: 'POST /customer/sign-up with a new email.', expect: 'an account that is not verified yet; no login before the email is checked.',
        run: async function (s) {
          await s.req('POST', '/dev/rate-limits/reset');
          s.vars.email = 'ana-' + PG.word() + '@playground.test';
          var up = await call(s, 'POST', '/customer/sign-up', { body: { email: s.vars.email, password: 'ana-pass-1', firstName: 'Ana' } });
          s.expect('created, not verified', up.status === 201 && up.json.customer.emailVerified === false, up.json);
          var early = await call(s, 'POST', '/customer/login', { body: { email: s.vars.email, password: 'ana-pass-1' } });
          s.expect('no login yet', code(early) === 'customers.email_not_verified', early.json);
        } },
      { title: 'Open the emailed link', does: 'Take the link from the dev outbox and verify; then log in.', expect: 'verified once; login gives a session.',
        run: async function (s) {
          var token = await PG.outbox(s.vars.email, 'ibo');
          var v = await call(s, 'POST', '/customer/verify-email', { body: { token: token } });
          s.expect('verified', v.status === 200 && v.json.customer.emailVerified, v.json);
          var login = await call(s, 'POST', '/customer/login', { body: { email: s.vars.email, password: 'ana-pass-1' } });
          s.vars.token = login.json && login.json.token;
          s.expect('logged in', login.status === 200 && !!s.vars.token, login.json);
        } },
      { title: 'The same email on bob', does: 'Sign up on bob with the same email and another password.', expect: 'a separate account; the ibo password and session do not work on bob.',
        run: async function (s) {
          var up = await call(s, 'POST', '/customer/sign-up', { brand: 'bob', body: { email: s.vars.email, password: 'other-pass-2' } });
          s.expect('a new account on bob', up.status === 201, up.json);
          var withIbo = await call(s, 'POST', '/customer/login', { brand: 'bob', body: { email: s.vars.email, password: 'ana-pass-1' } });
          s.expect('the ibo password does not open it', code(withIbo) === 'customers.invalid_credentials', withIbo.json);
          var cross = await call(s, 'GET', '/customer/me', { brand: 'bob', token: s.vars.token });
          s.expect('the ibo session is refused on bob', cross.status === 401, cross.json);
        } }
    ]
  });

  PG.scenario({
    id: 'A3', phase: 5, nav: 'Staff limited to a brand', title: 'A staff member limited to ibo activates on ibo, not on bob', tasks: ['STF-3', 'PRM-2'],
    story: 'One staff login works for every brand, but each person only acts on the brands in their tenantAccess, and only with the permissions in their role.',
    steps: [
      { title: 'The super admin makes a role and a member', does: 'A role with devices.view and devices.activate; Sam, limited to ibo.', expect: 'both created; Sam logs in.',
        run: async function (s) {
          var root = await superAdmin(s);
          s.vars.root = root.token;
          var role = await call(s, 'POST', '/admin/roles', { token: s.vars.root, body: { name: 'Sellers ' + PG.word(), permissions: ['devices.view', 'devices.activate'] } });
          s.expect('role created', role.status === 201, role.json);
          s.vars.sam = 'sam-' + PG.word() + '@playground.test';
          var made = await call(s, 'POST', '/admin/staff', { token: s.vars.root, body: { email: s.vars.sam, name: 'Sam', password: 'sam-pass-1', roleId: role.json.role.id, tenantAccess: ['ibo'] } });
          s.expect('Sam added for ibo', made.status === 201, made.json);
          s.vars.samId = made.json.staff.id;
          s.vars.samToken = (await call(s, 'POST', '/admin/login', { body: { email: s.vars.sam, password: 'sam-pass-1' } })).json.token;
          s.expect('Sam logs in', !!s.vars.samToken);
        } },
      { title: 'Sam activates a TV on ibo', does: 'POST /admin/devices/:mac/activate on the ibo host.', expect: 'allowed, recorded with Sam’s id.',
        run: async function (s) {
          var tv = await PG.paidWithKey('ibo');
          var r = await call(s, 'POST', '/admin/devices/' + tv.mac + '/activate', { token: s.vars.samToken, body: { type: 'yearly' } });
          s.expect('activated by Sam', r.status === 200 && r.json.license.activatedBy.actorId === s.vars.samId, r.json);
          s.show(tv.mac);
        } },
      { title: 'Sam tries the same on bob', does: 'The same request on the bob host.', expect: '403 staff.brand_not_allowed, even with the permission.',
        run: async function (s) {
          var tv = await PG.paidWithKey('bob');
          var r = await call(s, 'POST', '/admin/devices/' + tv.mac + '/activate', { brand: 'bob', token: s.vars.samToken, body: { type: 'yearly' } });
          s.expect('refused on bob', r.status === 403 && code(r) === 'staff.brand_not_allowed', r.json);
          var m = await call(s, 'GET', '/admin/staff', { token: s.vars.samToken });
          s.expect('and staff management: missing permission', m.status === 403 && code(m) === 'staff.missing_permission', m.json);
        } }
    ]
  });

  PG.scenario({
    id: 'A5', phase: 5, nav: 'Disable a staff member', title: 'Disabling a staff member ends their session at once', tasks: ['STF-2'],
    story: 'When someone leaves, the super admin disables them. Their open session stops working on the next request, on every server, because sessions live in Redis.',
    steps: [
      { title: 'A member is logged in', does: 'The super admin adds Lea; Lea logs in.', expect: 'Lea’s session works.',
        run: async function (s) {
          var root = await superAdmin(s);
          s.vars.root = root.token;
          var roles = await call(s, 'GET', '/admin/roles', { token: s.vars.root });
          var support = roles.json.roles.filter(function (x) { return !x.system; })[0];
          s.vars.lea = 'lea-' + PG.word() + '@playground.test';
          var made = await call(s, 'POST', '/admin/staff', { token: s.vars.root, body: { email: s.vars.lea, name: 'Lea', password: 'lea-pass-1', roleId: support.id, tenantAccess: ['*'] } });
          s.vars.leaId = made.json.staff.id;
          s.vars.leaToken = (await call(s, 'POST', '/admin/login', { body: { email: s.vars.lea, password: 'lea-pass-1' } })).json.token;
          var me = await call(s, 'GET', '/admin/me', { token: s.vars.leaToken });
          s.expect('Lea is logged in', me.status === 200, me.json);
        } },
      { title: 'The super admin disables Lea', does: 'PATCH /admin/staff/:id { status: disabled }.', expect: 'Lea’s next request is refused, and so is a new login.',
        run: async function (s) {
          var d = await call(s, 'PATCH', '/admin/staff/' + s.vars.leaId, { token: s.vars.root, body: { status: 'disabled' } });
          s.expect('disabled', d.status === 200, d.json);
          var me = await call(s, 'GET', '/admin/me', { token: s.vars.leaToken });
          s.expect('the open session is refused', me.status === 401, me.json);
          var again = await call(s, 'POST', '/admin/login', { body: { email: s.vars.lea, password: 'lea-pass-1' } });
          s.expect('a new login too', code(again) === 'staff.disabled', again.json);
        } }
    ]
  });
})();
`;
