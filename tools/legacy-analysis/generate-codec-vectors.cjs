// CAP-03: generate legacy wire-format test vectors by RUNNING the real functions from the old code.
//
// Loads, without modification:
//   - each old backend's decryptRequest / makeEncryptResponse / generateToken / decryptToken
//     (controllers/ApiController.js) and encryptMsg / decryptMsg (server.js)
//   - each TV app's encryptRequest / decryptResponse (app_src/js/common.js)
// and runs them in a sandbox with FAKE keys and a seeded Math.random, so the output is deterministic.
//
// Usage: node tools/legacy-analysis/generate-codec-vectors.cjs <revampDir> <tvAppsDir> <outDir>
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');
const CryptoJS = require('crypto-js');

const [revampDir, tvAppsDir, outDir] = process.argv.slice(2);
if (!revampDir || !tvAppsDir || !outDir) {
  console.error('Usage: node generate-codec-vectors.cjs <revampDir> <tvAppsDir> <outDir>');
  process.exit(1);
}

const BACKENDS = ['iboplayer-backend', 'bobplayer-backend', 'cr-unified-backend'];
const APPS = ['bobplayer-app', 'crplayer-app'];

// Fake secrets — never real ones. The real values stay per-tenant secrets in the new backend.
const FAKE = {
  TOKEN_KEY: 'fake-token-key-123',
  ANDROID_AES_SECRET: 'fake-aes-old',
  ANDROID_AES_NEW_SECRET: 'fake-aes-new-v2',
  TV_AES_NEW_SECRET: 'fake-aes-tv-v3',
  ANDROID_V3_AES_NEW_SECRET: 'fake-aes-android-v3',
  ANDROID_SIGNING_SECRET: 'fake-sign-android',
  TV_SIGNING_SECRET: 'fake-sign-tv',
};

const { extract, sandbox: baseSandbox, loadApp: loadAppFrom } = require('./legacy-loader.cjs');

const sandbox = (seed) =>
  baseSandbox(seed, {
    encryption_secret_key: FAKE.ANDROID_AES_SECRET,
    encryption_new_secret_key: FAKE.ANDROID_AES_NEW_SECRET,
    encryption_v3_secret_key: FAKE.TV_AES_NEW_SECRET,
    encryption_android_v3_secret_key: FAKE.ANDROID_V3_AES_NEW_SECRET,
  });

function loadBackend(name, seed) {
  const api = fs.readFileSync(path.join(revampDir, name, 'controllers', 'ApiController.js'), 'utf8');
  const server = fs.readFileSync(path.join(revampDir, name, 'server.js'), 'utf8');
  const ctx = sandbox(seed);
  const fns = ['getEncryptKeyPosition', 'getEncryptPositionChar', 'makeEncryptResponse', 'decryptRequest', 'generateToken', 'decryptToken'];
  vm.runInContext(fns.map((f) => extract(api, f, `${name}/ApiController.js`)).join('\n'), ctx);
  vm.runInContext(['encryptMsg', 'decryptMsg'].map((f) => extract(server, f, `${name}/server.js`)).join('\n'), ctx);
  return ctx;
}

const loadApp = (name, seed) => loadAppFrom(tvAppsDir, name, seed);

const safe = (fn) => {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, error: `${e.name}: ${e.message}` };
  }
};

// ---------------- 1. Envelope: app encodes → each backend decodes; backend encodes → app decodes ----------------
const PAYLOADS = [
  { name: 'tv-playlist-info', body: { mac_address: '00:1a:79:aa:bb:cc', app_type: 'samsung', version: '1.1.5' } },
  { name: 'v4-device-login', body: { mac_address: '52:54:00:12:34:57', app_type: 'lg', u_id: 'ACDE13', version: '1.0.7', recaptcha_code: 'X7KQ', recaptcha_token: 'tok-123' } },
  { name: 'add-playlist-xc', body: { mac_address: '00:1a:79:aa:bb:cc', app_type: 'samsung', url: 'http://provider.example:8080/get.php?username=u&password=p&type=m3u&output=hls', playlist_name: 'My IPTV' } },
  { name: 'tiny', body: { a: 1 } },
  { name: 'latin1-accent', body: { playlist_name: 'Télé Café' } },
];
const RESPONSES = [
  { name: 'status-success', body: { status: 'success', token: 'abc' } },
  { name: 'device-info', body: { mac_address: '00:1a:79:aa:bb:cc', expire_date: '2027-01-01', is_trial: 3, urls: [{ id: 'p1', url: 'http://h.example/', playlist_name: 'IPTV' }], themes: [] } },
  { name: 'arabic-name', body: { status: 'success', playlist_name: 'قناة' } },
  { name: 'tiny', body: { a: 1 } },
];

const envelope = { requests: [], responses: [], appRequestsWithNonLatin1: [] };
let seed = 1000;
for (const app of APPS) {
  for (const p of PAYLOADS) {
    const appCtx = loadApp(app, ++seed);
    const encoded = safe(() => appCtx.encryptRequest(p.body));
    const decodedBy = {};
    if (encoded.ok) {
      for (const b of BACKENDS) {
        const ctx = loadBackend(b, 1);
        const r = ctx.decryptRequest({ body: { data: encoded.value } });
        decodedBy[b] = r.status === 'success' ? { status: r.status, json: r.json_data, enc_key: r.enc_key, enc_position: r.enc_position, enc_position_char: r.enc_position_char, enc_length_char: r.enc_length_char } : { status: r.status };
      }
    }
    envelope.requests.push({ client: app, payload: p.name, input: p.body, encoded: encoded.ok ? encoded.value : null, encodeError: encoded.ok ? undefined : encoded.error, decodedBy });
  }
  const arabic = safe(() => loadApp(app, 7).encryptRequest({ playlist_name: 'قناة' }));
  envelope.appRequestsWithNonLatin1.push({ client: app, input: { playlist_name: 'قناة' }, result: arabic.ok ? arabic.value : arabic.error });
}

// The real round trip: the app encodes a request, the backend decodes it and answers with the SAME key,
// the app decodes the answer.
for (const b of BACKENDS) {
  for (const app of APPS) {
    for (const r of RESPONSES) {
      const request = loadApp(app, ++seed).encryptRequest({ mac_address: '00:1a:79:aa:bb:cc' });
      const ctx = loadBackend(b, ++seed);
      const decryptedReq = ctx.decryptRequest({ body: { data: request } });
      const encoded = ctx.makeEncryptResponse(decryptedReq, r.body);
      const res = safe(() => loadApp(app, 1).decryptResponse({ data: encoded }));
      envelope.responses.push({
        server: b,
        client: app,
        payload: r.name,
        input: r.body,
        request,
        requestKey: decryptedReq.enc_key,
        encoded,
        decodedByClient: res.ok ? res.value : { error: res.error },
        roundTrips: res.ok && JSON.stringify(res.value) === JSON.stringify(r.body),
      });
    }
  }
}

// ---------------- 2. XOR device token ----------------
const tokens = [];
for (const b of BACKENDS) {
  const ctx = loadBackend(b, 1);
  for (const [deviceId, mac] of [['665f1c2e9b1e8a0012345678', '00:1a:79:aa:bb:cc'], ['abc', 'AA-BB-CC-DD-EE-FF']]) {
    const token = ctx.generateToken(FAKE.TOKEN_KEY, deviceId, mac);
    tokens.push({ server: b, key: FAKE.TOKEN_KEY, deviceId, mac, token, decoded: ctx.decryptToken(FAKE.TOKEN_KEY, token) });
  }
  tokens.push({ server: b, key: FAKE.TOKEN_KEY, tamperedToken: 'AAAA', decoded: safe(() => ctx.decryptToken(FAKE.TOKEN_KEY, 'AAAA')) });
}

// ---------------- 3. CryptoJS passphrase AES (encrypt is salted/random: record ciphertext + decrypt results) ----------------
const aes = [];
const VERSIONS = [['old', 'TV'], ['V2', 'TV'], ['V3', 'TV'], ['V3', 'android']];
for (const b of BACKENDS) {
  const ctx = loadBackend(b, 1);
  for (const [version, deviceType] of VERSIONS) {
    const plaintext = JSON.stringify({ mac_address: '00:1a:79:aa:bb:cc', app_type: 'android' });
    const ciphertext = ctx.encryptMsg(plaintext, version, deviceType);
    const decrypted = safe(() => ctx.decryptMsg(ciphertext, version, deviceType));
    const value = decrypted.ok ? (typeof decrypted.value === 'string' ? decrypted.value : `[non-string: ${Object.prototype.toString.call(decrypted.value)}]`) : decrypted.error;
    aes.push({ server: b, version, deviceType, plaintext, ciphertext, decrypted: value, roundTrips: value === plaintext });
  }
  const long = 'x'.repeat(600);
  aes.push({ server: b, version: 'old', note: 'input over 512 chars is rejected', ciphertextLength: long.length, decrypted: ctx.decryptMsg(long, 'old', 'TV') });
}

// ---------------- 4. Signatures (formulas copied from the old controllers) ----------------
const signedData = CryptoJS.AES.encrypt('{"mac_address":"00:1a:79:aa:bb:cc"}', FAKE.ANDROID_AES_NEW_SECRET).toString();
const signatures = {
  androidV2: { formula: 'base64(HMAC-SHA256(ANDROID_SIGNING_SECRET, data)).trim()', secret: FAKE.ANDROID_SIGNING_SECRET, data: signedData, signature: nodeCrypto.createHmac('sha256', FAKE.ANDROID_SIGNING_SECRET).update(signedData).digest('base64').trim() },
  tvV3: { formula: 'base64(HMAC-SHA256(TV_SIGNING_SECRET, data)).trim()', secret: FAKE.TV_SIGNING_SECRET, data: signedData, signature: nodeCrypto.createHmac('sha256', FAKE.TV_SIGNING_SECRET).update(signedData).digest('base64').trim() },
  tvV3Uid: { formula: 'base64(HMAC-SHA1(TV_SIGNING_SECRET, lower(mac) + TV_AES_NEW_SECRET))', mac: '00:1A:79:AA:BB:CC', u_id: nodeCrypto.createHmac('sha1', FAKE.TV_SIGNING_SECRET).update('00:1a:79:aa:bb:cc' + FAKE.TV_AES_NEW_SECRET).digest('base64') },
};

fs.mkdirSync(outDir, { recursive: true });
const write = (file, data) => fs.writeFileSync(path.join(outDir, file), JSON.stringify(data, null, 2) + '\n');
const meta = { generatedBy: 'tools/legacy-analysis/generate-codec-vectors.cjs', fakeKeys: FAKE, note: 'Outputs of the real old functions, run with fake keys and a seeded Math.random. Never edit by hand; regenerate.' };
write('envelope.json', { ...meta, ...envelope });
write('xor-token.json', { ...meta, tokens });
write('aes.json', { ...meta, aes });
write('signatures.json', { ...meta, signatures });
console.log(`requests ${envelope.requests.length}, responses ${envelope.responses.length}, tokens ${tokens.length}, aes ${aes.length} → ${outDir}`);
