// End-to-end check of Phase 5 (customers, staff, roles, permissions; E2E-A1 to A5) over HTTP, against
// a running API, a real database and real Redis sessions.
//
//   MONGO_URI=… REDIS_URL=… pnpm seed         # once, on a database you can wipe
//   MONGO_URI=… REDIS_URL=… PORT=3001 pnpm dev:api
//   MONGO_URI=… REDIS_URL=… PORT=3001 pnpm e2e:accounts
//
// It creates a super admin with `pnpm cli staff:create` (same MONGO_URI as the API), then customers,
// staff, a role and devices in the `ibo` and `bob` brands. MONGO_URI must be given on the command
// line: the CLI reads the rest of .env, but the variables given here win.
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
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
const rand = () => Math.random().toString(36).slice(2, 8);
const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
const randomMac = () => 'ae:' + Array.from({ length: 5 }, hex).join(':');
const outbox = async (to, brand) => (await request('GET', '/dev/outbox?to=' + encodeURIComponent(to), { brand })).json?.token;

/** RFC 6238 code, as an authenticator app makes it. */
function totp(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

/** A paid device on a brand: registered as a trial, then activated through the dev routes. */
async function paidDevice(brand) {
  const mac = randomMac();
  const reg = await request('POST', '/dev/devices/register', { brand, body: { mac, platform: 'lg' } });
  await request('POST', `/dev/licenses/${mac}/activate`, {
    brand,
    body: { type: 'yearly', source: 'admin', actorId: 'e2e', sourceId: 'e2e-' + rand() },
  });
  return { mac, key: reg.json.found.device.deviceKey };
}

console.log('Setup: a super admin from the CLI');
const adminEmail = `root-${rand()}@e2e.test`;
const adminPassword = 'root-pass-' + rand();
const cli = spawnSync(
  process.execPath,
  ['--env-file-if-exists=.env', '--import', '@swc-node/register/esm-register', 'src/main.cli.ts', 'staff:create', adminEmail, 'E2E', 'Root'],
  { input: adminPassword, env: process.env, encoding: 'utf8' },
);
check('staff:create makes the first super admin', cli.status === 0, cli.stderr || cli.stdout);
const rootLogin = await request('POST', '/admin/login', { body: { email: adminEmail.toUpperCase(), password: adminPassword } });
const root = rootLogin.json?.token;
check('the super admin logs in (email in any case)', rootLogin.status === 200 && root, rootLogin.json);

console.log('\nE2E-A1 sign up, verify, log in; the same email on another brand');
const ana = `ana-${rand()}@e2e.test`;
let anaIbo;
{
  const signUp = await request('POST', '/customer/sign-up', { body: { email: ana, password: 'ana-pass-1', firstName: 'Ana' } });
  check('sign-up on ibo makes an unverified account', signUp.status === 201 && signUp.json.customer.emailVerified === false, signUp.json);
  const early = await request('POST', '/customer/login', { body: { email: ana, password: 'ana-pass-1' } });
  check('no login before the email is verified', code(early) === 'customers.email_not_verified', early.json);
  const token = await outbox(ana, 'ibo');
  const verified = await request('POST', '/customer/verify-email', { body: { token } });
  check('the emailed link verifies the email', verified.status === 200 && verified.json.customer.emailVerified, verified.json);
  const reused = await request('POST', '/customer/verify-email', { body: { token } });
  check('the link works once', code(reused) === 'customers.invalid_link', reused.json);
  const login = await request('POST', '/customer/login', { body: { email: ana, password: 'ana-pass-1' } });
  anaIbo = login.json?.token;
  check('login on ibo', login.status === 200 && anaIbo, login.json);
  const wrong = await request('POST', '/customer/login', { body: { email: ana, password: 'wrong-pass' } });
  const unknown = await request('POST', '/customer/login', { body: { email: 'nobody-' + ana, password: 'ana-pass-1' } });
  check('a wrong password and an unknown email give the same answer',
    wrong.status === 401 && JSON.stringify(wrong.json) === JSON.stringify(unknown.json), [wrong.json, unknown.json]);

  const onBob = await request('POST', '/customer/sign-up', { brand: 'bob', body: { email: ana, password: 'other-pass-2' } });
  check('the same email signs up on bob: a separate account', onBob.status === 201 && onBob.json.customer.id !== verified.json.customer.id, onBob.json);
  const bobLogin = await request('POST', '/customer/login', { brand: 'bob', body: { email: ana, password: 'ana-pass-1' } });
  check("ibo's password does not open the bob account", code(bobLogin) === 'customers.invalid_credentials', bobLogin.json);
  const crossBrand = await request('GET', '/customer/me', { brand: 'bob', token: anaIbo });
  check("an ibo session is refused on bob's host", crossBrand.status === 401, crossBrand.json);
  const me = await request('GET', '/customer/me', { token: anaIbo });
  check('the ibo session works on ibo', me.status === 200 && me.json.customer.email === ana, me.json);
  const again = await request('POST', '/customer/sign-up', { body: { email: ana.toUpperCase(), password: 'ana-pass-1' } });
  check('the email is unique within a brand, whatever the case', again.status === 409, again.json);
}

console.log('\nE2E-A2 link a TV with MAC + device key');
{
  const tv = await paidDevice('ibo');
  const wrongKey = await request('POST', '/customer/devices/link', { token: anaIbo, body: { mac: tv.mac, deviceKey: '000000' === tv.key ? '111111' : '000000' } });
  check('a wrong device key is refused', code(wrongKey) === 'customers.device_key_mismatch', wrongKey.json);
  const linked = await request('POST', '/customer/devices/link', { token: anaIbo, body: { mac: tv.mac.toUpperCase(), deviceKey: tv.key } });
  check('the TV is linked', linked.status === 200 && linked.json.device.macAddress === tv.mac, linked.json);
  const list = await request('GET', '/customer/devices', { token: anaIbo });
  check('the TV is listed', list.json?.devices?.some((d) => d.macAddress === tv.mac), list.json);

  const ben = `ben-${rand()}@e2e.test`;
  await request('POST', '/customer/sign-up', { body: { email: ben, password: 'ben-pass-1' } });
  await request('POST', '/customer/verify-email', { body: { token: await outbox(ben, 'ibo') } });
  const benToken = (await request('POST', '/customer/login', { body: { email: ben, password: 'ben-pass-1' } })).json?.token;
  const stolen = await request('POST', '/customer/devices/link', { token: benToken, body: { mac: tv.mac, deviceKey: tv.key } });
  check('another customer cannot link it', code(stolen) === 'customers.device_linked_elsewhere', stolen.json);
  const otherBrand = await paidDevice('bob');
  const crossLink = await request('POST', '/customer/devices/link', { token: anaIbo, body: { mac: otherBrand.mac, deviceKey: otherBrand.key } });
  check("bob's device is not found from ibo", code(crossLink) === 'customers.device_key_mismatch', crossLink.json);
  const trial = randomMac();
  const trialReg = await request('POST', '/dev/devices/register', { body: { mac: trial, platform: 'lg' } });
  const trialLink = await request('POST', '/customer/devices/link', { token: anaIbo, body: { mac: trial, deviceKey: trialReg.json.found.device.deviceKey } });
  check('a trial device cannot be linked', code(trialLink) === 'customers.device_not_paid', trialLink.json);
  const deviceId = linked.json.device.id;
  const benUnlink = await request('DELETE', '/customer/devices/' + deviceId, { token: benToken });
  check('only its customer can unlink it', benUnlink.status === 404, benUnlink.json);
  const unlink = await request('DELETE', '/customer/devices/' + deviceId, { token: anaIbo });
  const after = await request('GET', '/customer/devices', { token: anaIbo });
  check('unlink removes it from the account', unlink.status === 200 && !after.json.devices.some((d) => d.id === deviceId), [unlink.json, after.json]);
}

console.log('\nCUS-2/4 password reset, profile, logout');
{
  await request('POST', '/customer/password-reset', { body: { email: ana } });
  const unknownReset = await request('POST', '/customer/password-reset', { body: { email: 'nobody@e2e.test' } });
  check('a reset for an unknown email gets the same answer', unknownReset.status === 202 && unknownReset.json.sent, unknownReset.json);
  const reset = await request('POST', '/customer/password-reset/confirm', { body: { token: await outbox(ana, 'ibo'), password: 'ana-pass-2' } });
  check('the reset link sets a new password', reset.status === 200, reset.json);
  const oldSession = await request('GET', '/customer/me', { token: anaIbo });
  check('a reset logs out the old sessions', oldSession.status === 401, oldSession.json);
  anaIbo = (await request('POST', '/customer/login', { body: { email: ana, password: 'ana-pass-2' } })).json?.token;
  const newEmail = 'new-' + ana;
  const changed = await request('PATCH', '/customer/me', { token: anaIbo, body: { email: newEmail, currentPassword: 'ana-pass-2' } });
  check('a new email clears the verification', changed.status === 200 && changed.json.customer.emailVerified === false, changed.json);
  await request('POST', '/customer/verify-email', { body: { token: await outbox(newEmail, 'ibo') } });
  const me = await request('GET', '/customer/me', { token: anaIbo });
  check('until its link is opened', me.json?.customer?.emailVerified === true && me.json.customer.email === newEmail, me.json);
  await request('POST', '/customer/logout', { token: anaIbo });
  const afterLogout = await request('GET', '/customer/me', { token: anaIbo });
  check('logout ends the session', afterLogout.status === 401, afterLogout.json);
}

console.log('\nE2E-A3 staff limited to ibo activates on ibo, not on bob');
const sam = `sam-${rand()}@e2e.test`;
let samToken;
let samId;
let roleId;
{
  const role = await request('POST', '/admin/roles', { token: root, body: { name: 'E2E sellers ' + rand(), permissions: ['devices.view', 'devices.activate'] } });
  roleId = role.json?.role?.id;
  check('the super admin makes a role from active keys', role.status === 201 && roleId, role.json);
  const badRole = await request('POST', '/admin/roles', { token: root, body: { name: 'Bad ' + rand(), permissions: ['made.up'] } });
  check('a role with an unknown key is refused', code(badRole) === 'staff.unknown_permission', badRole.json);
  const created = await request('POST', '/admin/staff', { token: root, body: { email: sam, name: 'Sam', password: 'sam-pass-1', roleId, tenantAccess: ['ibo'] } });
  samId = created.json?.staff?.id;
  check('the super admin adds a staff member for ibo', created.status === 201 && samId && !('passwordHash' in created.json.staff), created.json);
  samToken = (await request('POST', '/admin/login', { body: { email: sam, password: 'sam-pass-1' } })).json?.token;
  const iboTv = await paidDevice('ibo');
  const bobTv = await paidDevice('bob');
  const view = await request('GET', '/admin/devices/' + iboTv.mac, { token: samToken });
  check('views a device on ibo', view.status === 200 && view.json.paid, view.json);
  const onIbo = await request('POST', `/admin/devices/${iboTv.mac}/activate`, { token: samToken, body: { type: 'yearly' } });
  check('activates on ibo', onIbo.status === 200 && onIbo.json.license?.activatedBy?.actorId === samId, onIbo.json);
  const onBob = await request('POST', `/admin/devices/${bobTv.mac}/activate`, { brand: 'bob', token: samToken, body: { type: 'yearly' } });
  check('refused on bob: brand not allowed (403)', onBob.status === 403 && code(onBob) === 'staff.brand_not_allowed', onBob.json);
  const manage = await request('GET', '/admin/staff', { token: samToken });
  check('refused staff management: missing permission (403)', manage.status === 403 && code(manage) === 'staff.missing_permission', manage.json);
  const rootOnBob = await request('GET', '/admin/devices/' + bobTv.mac, { brand: 'bob', token: root });
  check('super_admin may act on every brand', rootOnBob.status === 200, rootOnBob.json);
  const noSession = await request('GET', '/admin/devices/' + iboTv.mac);
  check('no session: 401', noSession.status === 401, noSession.json);
  const samBrands = await request('GET', '/admin/brands', { brand: 'bob', token: samToken });
  check('the brand list has only the brands a member may manage', samBrands.status === 200 && samBrands.json.brands.map((b) => b.slug).join() === 'ibo', samBrands.json);
  const rootBrands = await request('GET', '/admin/brands', { token: root });
  const ibo = rootBrands.json?.brands?.find((b) => b.slug === 'ibo');
  check('a super admin gets every brand, with its hosts', rootBrands.json?.brands?.length > 1 && ibo?.mainHost === ibo?.hosts[0] && ibo.hosts.includes('ibo.localhost'), rootBrands.json);
  const noSessionBrands = await request('GET', '/admin/brands');
  check('the brand list needs a session', noSessionBrands.status === 401, noSessionBrands.json);
}

console.log('\nE2E-A4 a permission removed from a role');
{
  const tv = await paidDevice('ibo');
  const edit = await request('PATCH', '/admin/roles/' + roleId, { token: root, body: { permissions: ['devices.view'] } });
  check('the super admin removes devices.activate from the role', edit.status === 200 && edit.json.role.permissions.join() === 'devices.view', edit.json);
  const refused = await request('POST', `/admin/devices/${tv.mac}/activate`, { token: samToken, body: { type: 'yearly' } });
  check('the next request with it is refused', refused.status === 403 && code(refused) === 'staff.missing_permission', refused.json);
  const stillViews = await request('GET', '/admin/devices/' + tv.mac, { token: samToken });
  check('the kept permission still works', stillViews.status === 200, stillViews.json);
  const sysEdit = await request('PATCH', '/admin/roles/super_admin', { token: root, body: { name: 'Root' } });
  const sysDelete = await request('DELETE', '/admin/roles/super_admin', { token: root });
  check('super_admin cannot be edited or deleted', code(sysEdit) === 'staff.system_role' && code(sysDelete) === 'staff.system_role', [sysEdit.json, sysDelete.json]);
  const perms = await request('GET', '/admin/permissions', { token: root });
  check('permissions come from the code', ['devices.view', 'devices.activate', 'staff.manage', 'roles.manage'].every((k) => perms.json?.permissions?.some((p) => p.key === k && p.active)), perms.json);
}

console.log('\nTwo-factor login');
{
  const setUp = await request('POST', '/admin/me/two-factor/setup', { token: samToken });
  check('setup gives a secret for the app', setUp.status === 200 && /^[A-Z2-7]{32}$/.test(setUp.json.secret), setUp.json);
  const enable = await request('POST', '/admin/me/two-factor/enable', { token: samToken, body: { code: totp(setUp.json.secret) } });
  check('a first code turns it on', enable.status === 200 && enable.json.enabled, enable.json);
  const step1 = await request('POST', '/admin/login', { body: { email: sam, password: 'sam-pass-1' } });
  check('the password alone gives a challenge, not a session', step1.json?.twoFactorRequired && !step1.json.token, step1.json);
  const challengeAsSession = await request('GET', '/admin/me', { token: step1.json.challenge });
  check('the challenge is not a session', challengeAsSession.status === 401, challengeAsSession.json);
  const bad = await request('POST', '/admin/login/two-factor', { body: { challenge: step1.json.challenge, code: '000000' === totp(setUp.json.secret) ? '111111' : '000000' } });
  check('a wrong code is refused', code(bad) === 'staff.invalid_two_factor_code', bad.json);
  const step2 = await request('POST', '/admin/login/two-factor', { body: { challenge: step1.json.challenge, code: totp(setUp.json.secret) } });
  check('the right code finishes the login', step2.status === 200 && step2.json.token, step2.json);
  const me = await request('GET', '/admin/me', { token: step2.json.token });
  check('/admin/me shows 2FA on and the role', me.json?.staff?.twoFactorEnabled && me.json.role?.id === roleId, me.json);
  samToken = step2.json.token;
}

console.log('\nE2E-A5 disable a staff member while logged in');
{
  const before = await request('GET', '/admin/me', { token: samToken });
  const self = await request('PATCH', '/admin/staff/' + rootLogin.json.staff.id, { token: root, body: { status: 'disabled' } });
  check('nobody disables themselves', code(self) === 'staff.cannot_change_self', self.json);
  const disabled = await request('PATCH', '/admin/staff/' + samId, { token: root, body: { status: 'disabled' } });
  const after = await request('GET', '/admin/me', { token: samToken });
  check('the next request is refused', before.status === 200 && disabled.status === 200 && after.status === 401, [before.status, disabled.json, after.json]);
  const relogin = await request('POST', '/admin/login', { body: { email: sam, password: 'sam-pass-1' } });
  check('and a new login too', code(relogin) === 'staff.disabled', relogin.json);
  await request('POST', '/admin/logout', { token: root });
  const rootAfter = await request('GET', '/admin/me', { token: root });
  check('logout ends the staff session', rootAfter.status === 401, rootAfter.json);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
