/**
 * The playground's scenarios (`/dev/playground/scenarios.js`): the E2E-* stories of the phase tests
 * pages, told step by step against the `ibo` brand (D1 also reads `bob`). Each step says what it does and
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

  PG.scenario({
    id: 'D1', nav: 'A new TV registers', title: 'A new MAC registers and gets a trial', tasks: ['DEV-1'],
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
    id: 'D2', nav: 'Ten sign-ups at once', title: 'The same MAC registers 10 times at once', tasks: ['UNQ', 'LOCK'],
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
    id: 'D3', nav: 'Placeholder MAC, two TVs', title: 'A fallback MAC registers from two TVs', tasks: ['DEV-2'],
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
    id: 'D4', nav: 'V4 app, solved captcha', title: 'A V4 device sends the same solved code again', tasks: ['DEV-4'],
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
    id: 'L1', nav: 'Activate from a code', title: 'Activate a device from a code', tasks: ['LIC-1', 'LIC-2'],
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
    id: 'L2', nav: 'Same code twice', title: 'The same source activates once', tasks: ['LIC-2'],
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
    id: 'L3', nav: 'Stack a year', title: 'Stack a year, then go lifetime', tasks: ['LIC-1'],
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
    id: 'L4', nav: 'Revoke, pay again', title: 'Revoke a license, then pay again', tasks: ['LIC-3'],
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
    id: 'P1', nav: 'Playlists add and sync', title: 'Playlists: add, edit, delete and sync', tasks: ['PL-1', 'PL-2'],
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
    id: 'P2', nav: 'Playlist PIN', title: 'A PIN protects a playlist on the website', tasks: ['PL-3'],
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
    id: 'P3', nav: 'Reply profiles', title: 'What the app gets: profiles, demo and backups', tasks: ['PL-4', 'PL-5'],
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
})();
`;
