// End-to-end check of the Phase 1 license rules (LIC-1 to LIC-3) over HTTP, against a running API,
// a real database and the real Redis lock, through the dev-only /dev/licenses routes.
//
//   pnpm seed            # once
//   pnpm dev:api         # in another terminal
//   pnpm e2e:licenses    # PORT=3001 pnpm e2e:licenses for another port
//
// It writes new devices and licenses into the `ibo` brand.
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
const randomMac = () => 'ac:' + Array.from({ length: 5 }, hex).join(':');
const id = () => 'src-' + Math.random().toString(36).slice(2, 10);
const L = (mac) => '/dev/licenses/' + mac;

/** The end of the UTC day, a year after `date`. */
function yearAfter(iso) {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)).toISOString();
}

async function newTrial() {
  const mac = randomMac();
  const reg = await request('POST', '/dev/devices/register', { mac, platform: 'lg' });
  return { mac, trialEndsAt: reg.json.found.device.trialEndsAt };
}
const activate = (mac, body) =>
  request('POST', L(mac) + '/activate', { type: 'yearly', source: 'reseller', actorId: 'r-1', sourceId: id(), ...body });

console.log('LIC-1 state and stacking');
{
  const { mac, trialEndsAt } = await newTrial();
  const trial = (await request('GET', L(mac))).json;
  check('a new device is in trial until its trial end', trial.state === 'trial' && trial.active && trial.endsAt === trialEndsAt, trial);
  const year = await activate(mac, {});
  check('a year bought in the trial keeps the trial days left', year.json?.license?.expiresAt === yearAfter(trialEndsAt), [year.json, trialEndsAt]);
  check('a year costs 1 credit', year.json.license.creditCost === 1, year.json);
  const second = await activate(mac, {});
  check('a second year stacks on the first', second.json?.license?.expiresAt === yearAfter(year.json.license.expiresAt), second.json);
  const life = await activate(mac, { type: 'lifetime' });
  check('lifetime has no end and costs 2', life.json?.license?.expiresAt === null && life.json.license.creditCost === 2, life.json);
  const more = await activate(mac, {});
  check('a running lifetime gets no year', code(more) === 'licensing.already_lifetime', more.json);
  const st = (await request('GET', L(mac))).json;
  check('the state is lifetime', st.state === 'lifetime' && st.active && st.endsAt === null, st);
}

console.log('LIC-2 activation');
{
  const { mac } = await newTrial();
  const sourceId = id();
  const first = await activate(mac, { sourceId, resellerId: 'r-9', multiActivate: true });
  const again = await activate(mac, { sourceId });
  check('the trial device moved to devices', (await request('GET', '/dev/devices/' + mac)).json?.paid === true, first.json);
  check('the same source twice activates once', again.json?.created === false && again.json.license.id === first.json.license.id, again.json);
  check('multiActivate is stored', first.json.license.multiActivate === true, first.json);
  const raced = await Promise.all([activate(mac, {}), activate(mac, {})]);
  const ends = raced.map((r) => r.json?.license?.expiresAt).sort();
  check('two activations at once both stack (the device lock holds)', ends[1] === yearAfter(ends[0]), raced.map((r) => r.json));
  const sources = ['admin', 'reseller', 'code', 'coupon', 'payment', 'store', 'transfer', 'plan'];
  const other = (await newTrial()).mac;
  for (const source of sources) await activate(other, { source, type: 'yearly' });
  const hist = (await request('GET', L(other) + '/history')).json;
  check('every source is recorded', JSON.stringify(hist.map((e) => e.license.activatedBy.source)) === JSON.stringify(sources), hist.map((e) => e.license.activatedBy));
  const unknown = await activate(randomMac(), {});
  check('an unknown MAC is refused', code(unknown) === 'devices.not_found', unknown.json);
}

console.log('LIC-3 revoke and history');
{
  const { mac } = await newTrial();
  const trialRevoke = await request('POST', L(mac) + '/revoke');
  check('a trial device has nothing to revoke', code(trialRevoke) === 'licensing.no_license', trialRevoke.json);
  const paid = await activate(mac, { actorId: 'r-1' });
  const revoked = await request('POST', L(mac) + '/revoke');
  const twice = await request('POST', L(mac) + '/revoke');
  const st = (await request('GET', L(mac))).json;
  check('revoke keeps the row with revokedAt', revoked.json?.revoked === true && revoked.json.revokedAt && revoked.json.id === paid.json.license.id, revoked.json);
  check('the device stays paid with no valid license', st.state === 'revoked' && !st.active && (await request('GET', '/dev/devices/' + mac)).json.paid, st);
  check('revoking twice is refused', code(twice) === 'licensing.already_revoked', twice.json);
  const repaid = await activate(mac, { actorId: 'r-2' });
  const today = new Date().toISOString();
  check('paying again starts the year today', repaid.json?.license?.expiresAt === yearAfter(today), repaid.json);
  const hist = (await request('GET', L(mac) + '/history')).json;
  check('history lists both, oldest first, with who and which is current',
    hist.length === 2 && hist[0].state === 'revoked' && !hist[0].current && hist[0].license.activatedBy.actorId === 'r-1' &&
    hist[1].current && hist[1].license.activatedBy.actorId === 'r-2', hist);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
