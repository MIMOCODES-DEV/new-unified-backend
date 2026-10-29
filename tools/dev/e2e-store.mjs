// End-to-end check of Phase 7 (the store's routes, docs/inventory/store-contract.md) over HTTP,
// against a running API and a real database: the `ibo` brand (ibo replies) and `cr7` (cr replies).
//
//   MONGO_URI=… REDIS_URL=… pnpm seed         # once, on a database you can wipe
//   MONGO_URI=… REDIS_URL=… pnpm cli tenant:set cr7 legacy.dialect cr
//   MONGO_URI=… REDIS_URL=… PORT=3001 pnpm dev:api
//   MONGO_URI=… REDIS_URL=… PORT=3001 pnpm e2e:store
//
// It sets the store key of ibo and cr7 and ibo's EUR→EGP rate with the CLI (same MONGO_URI as the
// API); `bob` keeps no store key, to check that it refuses every call.
import { spawnSync } from 'node:child_process';
import http from 'node:http';

if (!process.env.MONGO_URI) {
  console.error('Set MONGO_URI (a database you can wipe) for this run; .env is not used.');
  process.exit(1);
}

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
          ...(token ? { token } : {}),
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
  else { failed++; console.log('  FAIL ' + name + '  ' + JSON.stringify(detail).slice(0, 300)); }
}
const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
const randomMac = () => 'ae:' + Array.from({ length: 5 }, hex).join(':');
const cli = (...args) =>
  spawnSync(
    process.execPath,
    ['--env-file-if-exists=.env', '--import', '@swc-node/register/esm-register', 'src/main.cli.ts', ...args],
    { env: process.env, encoding: 'utf8' },
  );
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

/** A new trial device on a brand, through the dev route. */
async function trialDevice(brand) {
  const mac = randomMac();
  const reg = await request('POST', '/dev/devices/register', { brand, body: { mac, platform: 'lg' } });
  return { mac, key: reg.json?.found?.device?.deviceKey };
}

const KEY = 'store-key-' + Math.random().toString(36).slice(2);
const store = (path, body, brand = 'ibo', token = KEY) => request('POST', '/api/' + path, { brand, body, token });

console.log('Setup: store keys and the EUR→EGP rate from the CLI');
check('ibo store key set', cli('tenant:set-secret', 'ibo', 'store.key', KEY).status === 0);
check('cr7 store key set', cli('tenant:set-secret', 'cr7', 'store.key', KEY).status === 0);
check('ibo rate set', cli('tenant:config:set', 'ibo', 'currency.eurToEgp', '52.5').status === 0);

console.log('\nThe store key');
{
  const bad = await store('validate-mac-address', { macAddress: randomMac() }, 'ibo', 'wrong');
  check('a wrong key: 401 TOKEN_NOT_VALID', bad.status === 401 && bad.json?.msgStatus === 'TOKEN_NOT_VALID' && bad.json.mac_valid === 0, bad);
  const none = await request('POST', '/api/validate-mac-address', { body: { macAddress: randomMac() } });
  check('no key: 401', none.status === 401, none);
  const unset = await store('validate-mac-address', { macAddress: randomMac() }, 'bob');
  check('a brand with no store key refuses every call', unset.status === 401, unset);
}

console.log('\nvalidate-mac-address');
const tv = await trialDevice('ibo');
{
  const unknown = await store('validate-mac-address', { macAddress: randomMac() });
  check('unknown MAC: 200 NOT_FOUND, with euro_to_egp on ibo', unknown.status === 200 && unknown.json?.msgStatus === 'NOT_FOUND' && unknown.json.euro_to_egp === 52.5, unknown.json);
  const crUnknown = await store('validate-mac-address', { macAddress: randomMac() }, 'cr7');
  check('cr: NOT_FOUND has no euro_to_egp', crUnknown.json?.msgStatus === 'NOT_FOUND' && !('euro_to_egp' in crUnknown.json), crUnknown.json);
  const trial = await store('validate-mac-address', { macAddress: tv.mac.toUpperCase() });
  check('a trial device: success with the device and its playlists', trial.json?.status === 'success' && trial.json.mac_valid === 1 && trial.json.device?.mac_address === tv.mac && Array.isArray(trial.json.playlists), trial.json);
  check('the device has its key and is_trial 0', trial.json?.device?.device_key === tv.key && trial.json.device.is_trial === 0, trial.json?.device);
}

console.log('\nsave-device-activation');
{
  const missing = await store('save-device-activation', { mac_address: tv.mac });
  check('no expire_date: 422 REQUIRED_DATA', missing.status === 422 && missing.json?.msgStatus === 'REQUIRED_DATA', missing.json);
  const badDate = await store('save-device-activation', { mac_address: tv.mac, expire_date: 'soon' });
  check('a bad date: 422 INVALID_DATE', badDate.status === 422 && badDate.json?.msgStatus === 'INVALID_DATE', badDate.json);
  const unknown = await store('save-device-activation', { mac_address: randomMac(), expire_date: isoDay(30), is_trial: 3 });
  check('unknown MAC: 200 NOT_FOUND', unknown.status === 200 && unknown.json?.msgStatus === 'NOT_FOUND', unknown.json);

  const until = isoDay(200);
  const sale = await store('save-device-activation', { mac_address: tv.mac, expire_date: until, is_trial: 3, reseller_id: 'r-1', amount: 10 });
  check('a sale: activated until the store\'s date', sale.json?.status === 'success' && sale.json.mac_activated === 1 && sale.json.device?.expire_date === until && sale.json.device.is_trial === 3, sale.json);
  check('the old message', sale.json?.msg === `Device activated successfully for MAC Address: ${tv.mac} until ${until}`, sale.json?.msg);
  const warn = await store('validate-mac-address', { macAddress: tv.mac });
  check('validate now warns it is already activated', warn.json?.status === 'warning' && warn.json.already_activated === true && warn.json.device?.reseller_id === 'r-1', warn.json);

  const lifetime = await store('save-device-activation', { mac_address: tv.mac, expire_date: isoDay(1), is_trial: 2 });
  check('is_trial 2: lifetime', lifetime.json?.device?.is_trial === 2 && lifetime.json.device.expire_date === '2438-11-01', lifetime.json?.device);
  const again = await store('save-device-activation', { mac_address: tv.mac, expire_date: isoDay(1), is_trial: 2 });
  check('lifetime sold again: still success', again.json?.status === 'success' && again.json.device?.is_trial === 2, again.json);

  const cancel = await store('save-device-activation', { mac_address: tv.mac, expire_date: isoDay(-1), is_trial: 0 });
  check('a cancel (past date, is_trial 0): the license ends', cancel.json?.status === 'success' && cancel.json.device?.is_trial === 1 && cancel.json.device.expire_date < isoDay(0), cancel.json?.device);
  const resold = await store('save-device-activation', { mac_address: tv.mac, expire_date: isoDay(90), is_trial: 3 });
  check('sold again after a cancel', resold.json?.device?.is_trial === 3 && resold.json.device.expire_date === isoDay(90), resold.json?.device);

  const crNew = randomMac();
  const created = await store('save-device-activation', { mac_address: crNew, expire_date: isoDay(365), is_trial: 3, create_if_missing: true, appType: 'android' }, 'cr7');
  check('cr: create_if_missing makes the device', created.json?.device_created === true && created.json.device?.mac_address === crNew && created.json.msg.startsWith('Device created and activated'), created.json);
  const iboNew = await store('save-device-activation', { mac_address: randomMac(), expire_date: isoDay(365), is_trial: 3, create_if_missing: true });
  check('ibo: no create_if_missing (NOT_FOUND)', iboNew.json?.msgStatus === 'NOT_FOUND', iboNew.json);
}

console.log('\nsave-play-list');
const owner = await trialDevice('ibo');
let xcId;
{
  const missing = await store('save-play-list', {});
  check('no MAC: 400 INVALID_INPUT', missing.status === 400 && missing.json?.msgStatus === 'INVALID_INPUT', missing.json);
  const wrongKey = await store('save-play-list', { mac_address: owner.mac, device_key: '000000', current_playlist_url_id: -1, playlist_url: 'http://a.example.com/x.m3u', playlist_name: 'A' });
  check('a wrong device key: 200 NOT_FOUND', wrongKey.status === 200 && wrongKey.json?.msgStatus === 'NOT_FOUND', wrongKey.json);
  const xc = await store('save-play-list', {
    mac_address: owner.mac, device_key: owner.key, current_playlist_url_id: -1, playlist_type: 'xc',
    playlist_url: 'http://line.example.com:8080', username: 'u1', password: 'p1', playlist_name: 'Main',
    logo: 'logo.png', whatsapp: '+201000000000',
  });
  xcId = xc.json?.data?._id;
  check('adds an Xtream playlist', xc.json?.status === 'success' && xc.json.data?.playlist_type === 'xc' && xc.json.data.username === 'u1', xc.json);
  check('with the provider contact', xc.json?.data?.logo === 'logo.png' && xc.json.data.whatsapp === '+201000000000', xc.json?.data);
  const form = await store('save-play-list', { mac_address: owner.mac, current_playlist_url_id: '-1', playlist_url: 'http://old.example.com/list.m3u', playlist_name: 'Second' });
  check('-1 sent as text adds too', form.json?.status === 'success' && form.json.data?.playlist_type === 'general', form.json);
  const edit = await store('save-play-list', { mac_address: owner.mac, current_playlist_url_id: xcId, playlist_type: 'xc', playlist_url: 'http://line.example.com:8080', username: 'u1', password: 'p2', playlist_name: 'Main renamed' });
  check('edits by id', edit.json?.data?._id === xcId && edit.json.data.playlist_name === 'Main renamed' && edit.json.data.password === 'p2', edit.json);
  const other = await trialDevice('ibo');
  const foreign = await store('save-play-list', { mac_address: other.mac, current_playlist_url_id: xcId, playlist_url: 'http://x.example.com/a.m3u', playlist_name: 'Steal' });
  check('another device cannot edit it: 404', foreign.status === 404, foreign.json);
  const crTv = await trialDevice('cr7');
  const badCode = await store('save-play-list', { mac_address: crTv.mac, current_playlist_url_id: -1, code: '12ab' }, 'cr7');
  check('cr: a code with letters: 400', badCode.status === 400 && badCode.json?.msg === 'Code can only contain digits', badCode.json);
  const goodCode = await store('save-play-list', { mac_address: crTv.mac, current_playlist_url_id: -1, code: '0123', playlist_name: 'Code' }, 'cr7');
  check('cr: a code playlist (leading zero kept)', goodCode.json?.data?.code === '0123' && goodCode.json.data.playlist_type === 'code', goodCode.json);
  const delCode = await store('delete-playlist', { mac_address: crTv.mac, playlist_type: 'code', playlist_code: '0123' }, 'cr7');
  check('cr delete-playlist by type and code', delCode.json?.status === 'success', delCode.json);
  const byId = await store('save-play-list', { mac_address: crTv.mac, current_playlist_url_id: -1, playlist_url: 'http://b.example.com/b.m3u', playlist_name: 'B' }, 'cr7');
  const delById = await store('delete-playlist-by-id', { mac_address: crTv.mac, id: byId.json?.data?._id }, 'cr7');
  check('delete-playlist-by-id', delById.json?.msg === 'Playlist deleted successfully', delById.json);
  const delAgain = await store('delete-playlist-by-id', { mac_address: crTv.mac, id: byId.json?.data?._id }, 'cr7');
  check('then 404 Playlist not found', delAgain.status === 404 && delAgain.json?.msg === 'Playlist not found', delAgain.json);
}

console.log('\ncount-domain-updates and update-domain');
{
  const bad = await store('update-domain', { current_domain: 'old.example.com', new_domain: 'new.example.com' });
  check('no is_admin: 400 Request Can Not Be Processed', bad.status === 400 && bad.json?.msg === 'Request Can Not Be Processed', bad.json);
  const count = await store('count-domain-updates', { current_domain: 'http://old.example.com' });
  check('count on the whole brand', count.json?.matchedCount >= 1, count.json);
  const mine = await store('count-domain-updates', { current_domain: 'old.example.com', is_admin: false, activated_macs: [randomMac()] });
  check('count only for given devices', mine.json?.matchedCount === 0, mine.json);
  const moved = await store('update-domain', { current_domain: 'old.example.com', new_domain: 'new.example.com', is_admin: false, activated_macs: [owner.mac] });
  check('update-domain for given devices', moved.json?.msgStatus === 'SUCCESS' && moved.json.modifiedCount === 1, moved.json);
  const none = await store('update-domain', { current_domain: 'old.example.com', new_domain: 'new.example.com', is_admin: false, activated_macs: [owner.mac] });
  check('nothing left: NO_UPDATES', none.json?.msgStatus === 'NO_UPDATES' && none.json.matchedCount === 0, none.json);
  const after = await store('validate-mac-address', { macAddress: owner.mac });
  check('the playlist is on the new host', after.json?.playlists?.some((p) => p.url === 'http://new.example.com/list.m3u'), after.json?.playlists);
}

console.log('\ndelete-playlist and reset-playlist (ibo)');
{
  const noKey = await store('delete-playlist', { mac_address: owner.mac, playlist_type: 'xc' });
  check('ibo needs the device key: 400', noKey.status === 400, noKey.json);
  const del = await store('delete-playlist', { mac_address: owner.mac, playlist_type: 'xc', device_key: owner.key });
  check('deletes the Xtream playlist', del.json?.msg === 'Playlist deleted successfully.', del.json);
  const gone = await store('delete-playlist', { mac_address: owner.mac, playlist_type: 'xc', device_key: owner.key });
  check('then 404 Playlist not found.', gone.status === 404, gone.json);
  const reset = await store('reset-playlist', { mac_address: owner.mac, device_key: owner.key });
  check('reset deletes the rest', reset.json?.status === 'success', reset.json);
  const empty = await store('reset-playlist', { mac_address: owner.mac, device_key: owner.key });
  check('reset with none left: 404', empty.status === 404 && empty.json?.msg === 'Playlist not found.', empty.json);
}

console.log('\nswitch-mac-address');
{
  const paid = await trialDevice('ibo');
  await store('save-device-activation', { mac_address: paid.mac, expire_date: isoDay(1), is_trial: 2 });
  const missing = await store('switch-mac-address', { current_mac_address: paid.mac });
  check('a MAC missing: 302 with the old message', missing.status === 302 && missing.json?.message === 'Sorry, both current and new device Mac Addresses are required', missing.json);
  const unregistered = await store('switch-mac-address', { current_mac_address: paid.mac, mac_address: randomMac() });
  check('new MAC not registered: 302', unregistered.status === 302 && unregistered.json?.message.startsWith('The requested device is not registered'), unregistered.json);
  const target = await trialDevice('ibo');
  const ok = await store('switch-mac-address', { current_mac_address: paid.mac, mac_address: target.mac });
  check('a lifetime switches', ok.status === 200 && ok.json?.status === 'success' && ok.json.playlists_moved === 0, ok.json);
  const moved = await store('validate-mac-address', { macAddress: target.mac });
  check('the license is on the new MAC', moved.json?.device?.is_trial === 2, moved.json?.device);
  const yearly = await trialDevice('ibo');
  await store('save-device-activation', { mac_address: yearly.mac, expire_date: isoDay(100), is_trial: 3 });
  const yTarget = await trialDevice('ibo');
  const refused = await store('switch-mac-address', { current_mac_address: yearly.mac, mac_address: yTarget.mac });
  check('a yearly is refused without allow_one_year', refused.status === 302 && refused.json?.message.startsWith('Your device is activated for One Year'), refused.json);
  const allowed = await store('switch-mac-address', { current_mac_address: yearly.mac, mac_address: yTarget.mac, allow_one_year: true });
  check('and switches with it', allowed.status === 200 && allowed.json?.status === 'success', allowed.json);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
