// End-to-end check of the Phase 1 playlist rules (PL-1 to PL-8) over HTTP, against a running API
// and a real database, through the dev-only /dev/playlists routes.
//
//   pnpm seed             # once
//   pnpm dev:api          # in another terminal
//   pnpm e2e:playlists    # PORT=3001 pnpm e2e:playlists for another port
//
// It writes new devices and playlists into the `ibo` brand; hosts are random, so runs do not clash.
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
        path,
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
const ok = (r) => r.status === 200 || r.status === 201;
function check(name, condition, detail) {
  if (condition) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + '  ' + JSON.stringify(detail).slice(0, 300)); }
}
const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
const randomMac = () => 'ab:' + Array.from({ length: 5 }, hex).join(':');
const tag = Math.random().toString(36).slice(2, 8);
const HOST = `line-${tag}.example.com`;

async function newDevice() {
  const mac = randomMac();
  await ibo('POST', '/dev/devices/register', { mac, platform: 'samsung' });
  return mac;
}
const P = (mac) => '/dev/playlists/' + mac;

console.log('PL-1 kinds and PL-2 add, edit, delete');
const mac = await newDevice();
{
  const x = await ibo('POST', P(mac) + '/add', {
    name: 'Xtream', source: { kind: 'link', url: `http://${HOST}:8080/get.php?username=u1&password=p1&type=m3u_plus` },
  });
  check('an Xtream link is parsed once into server, username, password', ok(x) && x.json.type === 'xtream' &&
    x.json.xtream.server === `http://${HOST}:8080/` && x.json.xtream.password === 'p1', x.json);
  const m = await ibo('POST', P(mac) + '/add', { name: 'M3U', source: { kind: 'link', url: `http://${HOST}/list.m3u` } });
  const s = await ibo('POST', P(mac) + '/add', { name: 'Portal', source: { kind: 'stalker', portalUrl: `http://${HOST}/c/`, mac: '00-1A-79-00-00-01' } });
  const c = await ibo('POST', P(mac) + '/add', { name: 'Code', source: { kind: 'code', code: '482915' } });
  check('m3u, stalker and code each fill only their part', m.json?.type === 'm3u' && m.json.xtream === null &&
    s.json?.stalker?.mac === '00:1a:79:00:00:01' && c.json?.code?.code === '482915', [m.json, s.json, c.json]);
  const dup = await ibo('POST', P(mac) + '/add', { name: 'Again', source: { kind: 'link', url: `http://${HOST}/list.m3u` } });
  check('the same playlist twice is refused', code(dup) === 'playlists.exists', dup.json);
  const device = (await ibo('GET', '/dev/devices/' + mac)).json.device;
  check('the trial device counts 4 playlists', device.playlistCount === 4 && device.firstPlaylistAt, device);
  const renamed = await ibo('POST', P(mac) + '/' + m.json.id + '/edit', { name: 'Renamed' });
  check('edit changes the name', renamed.json?.name === 'Renamed', renamed.json);
  const del = await ibo('POST', P(mac) + '/' + c.json.id + '/delete', {});
  const after = (await ibo('GET', '/dev/devices/' + mac)).json.device;
  check('delete removes it and counts it down', ok(del) && after.playlistCount === 3, after);
}

console.log('PL-3 PIN hides data on the dashboard only');
{
  const kids = await ibo('POST', P(mac) + '/add', {
    name: 'Kids', source: { kind: 'link', url: `http://${HOST}/kids.m3u` }, pin: '1234', via: 'website',
  });
  check('added protected in one step, PIN encrypted', kids.json?.protected === true &&
    kids.json.pinEnc?.startsWith('v1:') && !kids.json.pinEnc.includes('1234'), kids.json);
  const dash = (await ibo('GET', P(mac) + '/dashboard')).json;
  const hidden = dash.find((p) => p.id === kids.json.id);
  check('the dashboard list hides its link', hidden?.hidden === true && hidden.url === undefined, hidden);
  const noPin = await ibo('POST', P(mac) + '/' + kids.json.id + '/unlock', {});
  const wrong = await ibo('POST', P(mac) + '/' + kids.json.id + '/unlock', { pin: '9999' });
  const right = await ibo('POST', P(mac) + '/' + kids.json.id + '/unlock', { pin: '1234' });
  check('unlocking needs the right PIN', code(noPin) === 'playlists.pin_required' &&
    code(wrong) === 'playlists.wrong_pin' && right.json?.url === `http://${HOST}/kids.m3u`, [noPin.json, wrong.json]);
  const dashEdit = await ibo('POST', P(mac) + '/' + kids.json.id + '/edit', { by: 'dashboard', name: 'X' });
  const appEdit = await ibo('POST', P(mac) + '/' + kids.json.id + '/edit', { by: 'app', name: 'Kids TV' });
  check('the dashboard needs the PIN to edit; the app does not', code(dashEdit) === 'playlists.pin_required' &&
    appEdit.json?.name === 'Kids TV', [dashEdit.json, appEdit.json]);
  const reply = (await ibo('GET', P(mac) + '/reply')).json.playlists.find((p) => p.id === kids.json.id);
  const roku = (await ibo('GET', P(mac) + '/reply?includePins=true')).json.playlists.find((p) => p.id === kids.json.id);
  check('the app gets the link; the PIN only when asked (Roku, iOS)', reply?.url && reply.pin === undefined && roku?.pin === '1234', [reply, roku]);
}

console.log('PL-4 replies');
{
  const reply = (await ibo('GET', P(mac) + '/reply')).json;
  const xc = reply.playlists.find((p) => p.name === 'Xtream');
  check('ibo (xc profile): Xtream goes as server + login', xc?.type === 'xc' && xc.url === `http://${HOST}:8080/` && xc.username === 'u1', xc);
  const empty = await newDevice();
  const demo = (await ibo('GET', P(empty) + '/reply')).json;
  check('a device with no playlist gets the demo or nothing, and hasOwnPlaylist false',
    demo.hasOwnPlaylist === false && demo.playlists.every((p) => p.demo), demo);
}

console.log('PL-5 backups');
{
  const list = (await ibo('GET', P(mac))).json;
  const xtream = list.find((p) => p.name === 'Xtream');
  const set = await ibo('POST', P(mac) + '/' + xtream.id + '/backup', { enabled: true, hosts: ['Mirror.example.com', 'https://m2.example.com:2095'] });
  const item = (await ibo('GET', P(mac) + '/reply')).json.playlists.find((p) => p.id === xtream.id);
  check('backup hosts are stored and the reply has the links', ok(set) &&
    JSON.stringify(item.backupUrls) === JSON.stringify(['http://mirror.example.com:8080/', 'https://m2.example.com:2095/']), item?.backupUrls);
  await ibo('POST', P(mac) + '/' + xtream.id + '/backup', { enabled: false });
  const off = (await ibo('GET', P(mac))).json.find((p) => p.id === xtream.id);
  check('turning backups off keeps the hosts', off.backup.enabled === false && off.backup.hosts.length === 2, off.backup);
  const bad = await ibo('POST', P(mac) + '/' + xtream.id + '/backup', { enabled: true, hosts: ['localhost'] });
  check('a bad host is refused', code(bad) === 'playlists.invalid_playlist', bad.json);
}

console.log('PL-2 bulk sync');
{
  const other = await newDevice();
  const theirs = await ibo('POST', P(other) + '/add', { name: 'Theirs', source: { kind: 'link', url: `http://${HOST}/theirs.m3u` } });
  const sync = await ibo('POST', P(mac) + '/sync', {
    playlists: [{ originId: 'non_saved_1', name: 'Synced', url: `http://${HOST}/synced.m3u` }, { originId: theirs.json.id, name: 'Hijack', url: `http://${HOST}/h.m3u` }],
    removeIds: [theirs.json.id],
  });
  const still = (await ibo('GET', P(other))).json;
  check('sync adds new items and returns their ids', ok(sync) && sync.json.playlists[0].id && sync.json.playlists[0].originId === 'non_saved_1', sync.json);
  check('sync never touches another device’s playlist', still.length === 1 && still[0].name === 'Theirs', still);
}

console.log('PL-6 without a login');
{
  const added = await ibo('POST', P(mac) + '/by-mac/add', { name: 'From QR', source: { kind: 'link', url: `http://${HOST}/qr.m3u` } });
  check('add by MAC records the website', added.json?.addedBy?.via === 'website', added.json);
  const target = await newDevice();
  await ibo('POST', P(target) + '/add', { name: 'Open', source: { kind: 'link', url: `http://${HOST}/o.m3u` } });
  await ibo('POST', P(target) + '/add', { name: 'Locked', source: { kind: 'link', url: `http://${HOST}/l.m3u` }, pin: '1111' });
  const wiped = await ibo('POST', P(target) + '/by-mac/delete');
  check('delete by MAC keeps protected playlists (or is rate limited)', (ok(wiped) &&
    wiped.json.deleted === 1 && wiped.json.keptProtected === 1) || code(wiped) === 'playlists.too_many_requests', wiped.json);
}

console.log('PL-7 status sync');
{
  const xtream = (await ibo('GET', P(mac))).json.find((p) => p.name === 'Xtream');
  const report = await ibo('POST', P(mac) + '/' + xtream.id + '/status', { status: 'Active', expiresAt: '1798761600', name: 'Hijacked' });
  const after = (await ibo('GET', P(mac))).json.find((p) => p.id === xtream.id);
  check('an Xtream playlist stores the account status; nothing else changes', ok(report) &&
    after.account.status === 'Active' && after.account.expiresAt.startsWith('2027-01-01') && after.name === 'Xtream', after);
}

console.log('PL-8 provider moved host');
{
  const count = await ibo('POST', '/dev/playlists/move-host', { from: HOST, to: `new-${HOST}`, countOnly: true, macs: [mac] });
  const before = (await ibo('GET', P(mac))).json.find((p) => p.name === 'Xtream');
  check('count-only counts and changes nothing', count.json?.matched >= 3 && count.json.changed === 0 && before.url.includes(`//${HOST}:`), count.json);
  const moved = await ibo('POST', '/dev/playlists/move-host', { from: HOST, to: `new-${HOST}`, countOnly: false, macs: [mac] });
  const after = (await ibo('GET', P(mac))).json.find((p) => p.name === 'Xtream');
  check('the move changes only the host; path and login stay', moved.json?.changed >= 3 &&
    after.url === `http://new-${HOST}:8080/get.php?username=u1&password=p1&type=m3u_plus` &&
    after.xtream.server === `http://new-${HOST}:8080/`, after);
  const pattern = await ibo('POST', '/dev/playlists/move-host', { from: 'line-.*', to: 'x.example.com' });
  check('a pattern is refused', code(pattern) === 'playlists.invalid_playlist', pattern.json);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
