// End-to-end check of Phase 4 · Moves and cleanup over HTTP, against a running API, a real database
// and the real Redis locks, through the dev-only routes: MAC switch (DEV-7), recovery (REC-1 to
// REC-3), provider domain moves (DOM-1, DOM-2) and the cleanup report (LIC-4, dry run only).
//
//   pnpm seed          # once
//   pnpm dev:api       # in another terminal
//   pnpm e2e:moves     # PORT=3001 pnpm e2e:moves for another port
//
// It writes new devices and playlists into the `ibo` brand, and provider moves (random hosts) into
// the central database.
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 3000);
let passed = 0;
let failed = 0;

function request(method, path, body) {
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
const ok = (r) => r.status === 200 || r.status === 201;
function check(name, condition, detail) {
  if (condition) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + '  ' + JSON.stringify(detail).slice(0, 300)); }
}
const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
const randomMac = () => 'ae:' + Array.from({ length: 5 }, hex).join(':');
const word = () => Math.random().toString(36).slice(2, 8);
const L = (mac) => '/dev/licenses/' + mac;
const P = (mac) => '/dev/playlists/' + mac;

async function trial() {
  const mac = randomMac();
  await request('POST', '/dev/devices/register', { mac, platform: 'samsung' });
  return mac;
}
async function paid(type = 'lifetime', extra = {}) {
  const mac = await trial();
  await request('POST', L(mac) + '/activate', { type, source: 'admin', sourceId: 'e2e-' + word(), ...extra });
  return mac;
}
const addLink = (mac, name, url) => request('POST', P(mac) + '/add', { name, source: { kind: 'link', url } });
const device = async (mac) => (await request('GET', '/dev/devices/' + mac)).json;

console.log('DEV-7 MAC switch');
{
  const from = await paid();
  const to = await trial();
  await addLink(from, 'News', 'http://a.e2e.example/a.m3u');
  await addLink(to, 'News', 'http://b.e2e.example/b.m3u');
  const before = await device(from);
  const sw = await request('POST', L(from) + '/switch', { newMac: to });
  check('a lifetime license switches to a MAC whose app is installed', ok(sw), sw.json);
  const after = await device(to);
  check('the paid device keeps its id on the new MAC', after?.paid && after.device.id === before.device.id, after);
  const names = (await request('GET', P(to))).json.map((p) => p.name).sort();
  check('the new TV trial playlist is absorbed as "News (2)"', JSON.stringify(names) === '["News","News (2)"]', names);
  const old = await device(from);
  check('the old MAC keeps an ended trial', old && !old.paid && new Date(old.device.trialEndsAt) < new Date(), old);
  const again = await request('POST', L(to) + '/switch', { newMac: await trial() });
  check('a second switch is refused (limit 1)', code(again) === 'licensing.mac_switch_limit', again.json);

  const yearly = await paid('yearly');
  const target = await trial();
  const noAllow = await request('POST', L(yearly) + '/switch', { newMac: target });
  check('yearly is refused without allowYearly', code(noAllow) === 'licensing.yearly_switch_not_allowed', noAllow.json);
  check('yearly switches with allowYearly', ok(await request('POST', L(yearly) + '/switch', { newMac: target, allowYearly: true })));
  const multi = await paid('lifetime', { multiActivate: true });
  const multiTo = await trial();
  check('multiActivate is refused', code(await request('POST', L(multi) + '/switch', { newMac: multiTo })) === 'licensing.multi_activate_switch');
  const p2 = await paid();
  check('a paid device on the new MAC refuses it', code(await request('POST', L(await paid()) + '/switch', { newMac: p2 })) === 'licensing.mac_taken');
}

console.log('REC-1 recovery code');
{
  const t = await trial();
  check('a trial device gets no code', code(await request('POST', L(t) + '/recovery-code')) === 'licensing.recovery_needs_paid_device');
  const revoked = await paid();
  await request('POST', L(revoked) + '/revoke', {});
  check('a revoked license gets no code', code(await request('POST', L(revoked) + '/recovery-code')) === 'licensing.license_not_running');
  const mac = await paid();
  const first = await request('POST', L(mac) + '/recovery-code');
  const minutes = (new Date(first.json?.expiresAt) - Date.now()) / 60000;
  check('a paid device gets an 8-character code for 30 minutes', /^[A-Z2-9]{8}$/.test(first.json?.code ?? '') && minutes > 29 && minutes <= 30, first.json);
  const second = await request('POST', L(mac) + '/recovery-code');
  const oldTv = await trial();
  const usedOld = await request('POST', '/dev/licenses/recover', { code: first.json.code, newMac: oldTv });
  check('a new code replaces the old one', ok(second) && code(usedOld) === 'licensing.recovery_code_not_found', usedOld.json);
}

console.log('REC-2/3 apply the code on a new TV');
{
  const mac = await paid();
  await addLink(mac, 'Mine', 'http://own.e2e.example/own.m3u');
  const id = (await device(mac)).device.id;
  const tv = await trial();
  await addLink(tv, 'Trial list', 'http://tv.e2e.example/tv.m3u');
  const tvId = (await device(tv)).device.id;
  const made = (await request('POST', L(mac) + '/recovery-code')).json;

  check('a wrong code is refused', code(await request('POST', '/dev/licenses/recover', { code: 'WRONG234', newMac: tv })) === 'licensing.recovery_code_not_found');
  const rec = await request('POST', '/dev/licenses/recover', { code: ' ' + made.code.toLowerCase(), newMac: tv });
  check('the code (any case) moves the paid device to the new TV', ok(rec) && rec.json.deviceId === id && rec.json.to === tv, rec.json);
  const now = await device(tv);
  check('it keeps its id and license', now.paid && now.device.id === id && now.device.recovery.recoveredFrom === mac, now);
  const lists = (await request('GET', P(tv))).json.map((p) => p.name);
  check('it keeps its own playlists; the new TV trial ones are gone', JSON.stringify(lists) === '["Mine"]', lists);
  check('the new TV trial device was removed with its playlists', rec.json.removedTrialId === tvId && rec.json.removedPlaylists === 1, rec.json);
  const old = await device(mac);
  check('the old MAC keeps one ended trial device, nothing else', old && !old.paid && old.device.playlistCount === 0, old);
  const reuse = await request('POST', '/dev/licenses/recover', { code: made.code, newMac: await trial() });
  check('the code works once', code(reuse) === 'licensing.recovery_code_not_found', reuse.json);
}

console.log('DOM-1/2 provider domain moves');
{
  const oldHost = `line-${word()}.e2e.example:8080`;
  const newHost = `line-${word()}.e2e.example:8080`;
  const link = (host) => `http://${host}/get.php?username=u&password=p&type=m3u_plus`;
  /** A paid device edits its own playlist to the new host, from its own IP. */
  async function moveFrom(ip, kind = 'paid') {
    const mac = kind === 'paid' ? await paid() : await trial();
    const added = await addLink(mac, 'Provider', link(oldHost));
    await request('POST', P(mac) + '/' + added.json.id + '/edit', { source: { kind: 'link', url: link(newHost) }, ip });
    return mac;
  }
  const find = async (filter) =>
    (await request('GET', '/dev/domain-moves?filter=' + filter)).json.find((m) => m.fromHost === oldHost);

  await moveFrom('198.51.100.1', 'trial');
  check('a trial device does not report a move', !(await find('pending')));
  await moveFrom('198.51.100.1');
  await moveFrom('198.51.100.1');
  let pending = await find('pending');
  check('the first report makes a pending move; the same IP counts once', pending?.confirmations === 1 && pending.toHost === newHost, pending);
  await moveFrom('198.51.100.2');
  check('two IPs: not yet up for approval', !(await find('awaiting')));
  const watcher = await paid();
  await addLink(watcher, 'Provider', link(oldHost));
  await moveFrom('198.51.100.3');
  const awaiting = await find('awaiting');
  check('three IPs: shows up for approval', awaiting?.confirmations === 3, awaiting);
  const before = (await request('GET', P(watcher) + '/reply')).json.playlists[0];
  check('not served before it is approved', before.url.includes(oldHost), before);

  const approved = await request('POST', '/dev/domain-moves/' + awaiting.id + '/approve', { by: 'e2e' });
  check('approving records who decided', ok(approved) && approved.json.status === 'approved' && approved.json.decidedBy === 'e2e', approved.json);
  const served = (await request('GET', P(watcher) + '/reply?platform=samsung')).json.playlists[0];
  check('an approved move is served on the new host, the old host first in the backups',
    served.url.includes(newHost) && !served.url.includes(oldHost) && served.backupUrls[0]?.includes(oldHost.split(':')[0]), served);
  const stored = (await request('GET', P(watcher))).json[0];
  check('the stored playlist is not changed', stored.url === link(oldHost), stored);

  const blocked = await request('POST', '/dev/domain-moves/' + awaiting.id + '/block', { by: 'e2e' });
  const after = (await request('GET', P(watcher) + '/reply')).json.playlists[0];
  check('a blocked move is not served', ok(blocked) && after.url.includes(oldHost), after);
  check('approving an unknown move is refused', code(await request('POST', '/dev/domain-moves/nope/approve', { by: 'e2e' })) === 'domain_migrations.not_found');
}

console.log('LIC-4 cleanup report (dry run)');
{
  const report = await request('GET', '/dev/licenses/cleanup?days=180');
  check('the dry run reports and deletes nothing', ok(report) && report.json.dryRun === true && report.json.deleted === 0, report.json);
  check('a rule that is not whole days is refused', (await request('GET', '/dev/licenses/cleanup?days=0')).status === 400);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
