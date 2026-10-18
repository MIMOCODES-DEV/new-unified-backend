// CAP-02: catalogue every live route of the old backends, with a verdict per route.
// Reads routes/*.js (comments stripped), expands the V4 per-app-type loop, tags routes real clients call.
//
// Usage: node tools/legacy-analysis/endpoint-catalogue.cjs <revampDir> <outDir>
const fs = require('fs');
const path = require('path');

const [revampDir, outDir] = process.argv.slice(2);
if (!revampDir || !outDir) {
  console.error('Usage: node endpoint-catalogue.cjs <revampDir> <outDir>');
  process.exit(1);
}

const BACKENDS = {
  'iboplayer-backend': { short: 'ibo', mounts: { 'frontend.js': '', 'admin.js': '/lgPq8HIC2R7Qpm4YZ', 'api.js': '/api' } },
  'bobplayer-backend': { short: 'bob', mounts: { 'frontend.js': '', 'reseller.js': '/reseller', 'admin.js': '/Uac9NWDSY86RJI362NQ8', 'api.js': '/api' } },
  'cr-unified-backend': { short: 'cr', mounts: { 'frontend.js': '', 'reseller.js': '/reseller', 'admin.js': '/admin', 'api.js': '/api' } },
};

// Calls observed in the real clients (docs/inventory/client-usage.md). `{t}` = any V4 app type.
const CLIENT_CALLS = {
  cr: {
    'cr website': ['GET /frontend/captcha/generate', 'POST /frontend/device/login', 'POST /frontend/user/login', 'GET /frontend/user', 'GET /frontend/device', 'GET /frontend/device/logout', 'GET /frontend/user-logout', 'POST /frontend/user/signup', 'GET /frontend/verify-password-token/:x', 'POST /frontend/set-password/:x', 'POST /frontend/password-reset/:x', 'POST /frontend/password-reset/request', 'POST /frontend/user/changePassword', 'POST /frontend/user/select-device', 'PATCH /frontend/user/change-device-name', 'POST /frontend/user/assign-device', 'POST /frontend/user/assign-device-user', 'POST /frontend/user/remove-device', 'POST /frontend/user/reset-uid', 'POST /frontend/user/generate-recovery-code', 'GET /frontend/user/plans', 'POST /frontend/order-package-plan', 'POST /frontend/user/assign-device-plan', 'POST /frontend/user/switchMacAddress', 'PUT /frontend/user/delete-playlists', 'POST /frontend/device/playlists', 'POST /frontend/device/savePlaylist', 'POST /frontend/device/fetch-playlist/:x', 'PUT /frontend/device/editPlaylist/:x', 'DELETE /frontend/device/deletePlayListUrl/:x', 'POST /frontend/device/verify-playlist-pin', 'POST /frontend/device/saveDeviceKey', 'POST /frontend/device/saveParentPin', 'POST /frontend/device/switchMacAddress', 'GET /frontend/device/checkMacValid', 'POST /frontend/device/saveActivation', 'POST /frontend/device/checkMacValidByMac', 'POST /frontend/device/savePlaylistByMacOnly', 'POST /frontend/device/deletePlaylistsByMacOnly', 'POST /frontend/check-playlist', 'POST /api/{t}/v4/recaptcha', 'POST /api/{t}/v4/device_login'],
    CRPlayer: ['POST /api/v4/recaptcha', 'POST /api/tv/v4/playlist_info', 'POST /api/update_playlist', 'POST /api/add_playlist', 'POST /api/remove_playlist', 'PUT /api/edit_playlist', 'POST /api/changeParentPin', 'GET /api/status_check'],
  },
  ibo: {
    'ibo website': ['GET /frontend/captcha/generate', 'POST /frontend/device/login', 'GET /frontend/device', 'GET /frontend/device/logout', 'GET /frontend/device/playlists/:x', 'POST /frontend/device/savePlaylist', 'DELETE /frontend/device/deletePlayListUrl/:x', 'GET /frontend/device/checkPlaylistPinCode/:x/:x', 'POST /frontend/device/switchMacAddress', 'POST /frontend/device/saveParentPin', 'POST /frontend/device/saveDeviceKey', 'POST /frontend/device/saveDeviceUid', 'POST /frontend/device/generateRecoveryCode', 'GET /frontend/device/checkMacValid', 'POST /frontend/device/saveActivation', 'POST /frontend/paypal/order/create', 'POST /frontend/paypal/order/capture/:x', 'POST /api/device/check-activate', 'POST /frontend/qr/addPlaylist', 'POST /api/{t}/v4/recaptcha', 'POST /api/{t}/v4/device_login'],
  },
  bob: {
    BobPlayer: ['POST /api/{t}/v4/recaptcha', 'POST /api/{t}/v4/device_login', 'POST /api/{t}/v4/device_info', 'POST /api/{t}/v4/manage/add_playlist', 'POST /api/{t}/v4/manage/update_playlist', 'POST /api/{t}/v4/manage/delete_playlist', 'POST /api/{t}/v4/device/add', 'POST /api/changeParentPin', 'GET /api/status_check'],
  },
};

const DROP = /(^|\/)(test|email-test|mylist-test|activation-test)(\/|$)|FromPHP|FromPhp|fromPhp|clearLanguageWord|saveCountryCode|removeDuplicatedMacAddress|remove-duplicated|get_ip_request_count|test-block-ip|get_non_mac_addresses|get-samsung-active-users|activateOpayDevices|convertAllMacToLowerCase|fixPaymentTime|create-reseller-coupon|assignCreatedTime|google_pay|Old\d*$/i;
const PROVIDER_PATH = /callback|webhook|ipn|stripe\/(success|cancel)|activation\/(telr|crypto)|cowpay|paymob|payment\/status|checkPayskyTransaction|generatePayskyTransactionID/i;
const STORE_HANDLERS = /validateMacAddress|saveDeviceActivation|savePlayList|deletePlaylist|resetPlaylist|updateDomain|countDomainUpdates|switchMacAddress|statusCheck|checkDeviceStatusFromExternal|activateWithCouponFromExternal|transferDeviceApp|ResellerNotification|getAvailableConnections|activateFromExternalLink/i;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Splits the argument list of a call starting at `open` (index of "(") at top level. */
function callArgs(src, open) {
  const args = [];
  let depth = 0, start = open + 1, quote = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) {
        args.push(src.slice(start, i).trim());
        return { args, end: i };
      }
    } else if (c === ',' && depth === 1) {
      args.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }
  return { args, end: src.length };
}

function v4Types(src) {
  const m = /(?:const|let|var)\s+\w*[aA]pp[_]?[tT]ypes\w*\s*=\s*\[([^\]]+)\]/.exec(src);
  return m ? [...m[1].matchAll(/['"`]([a-z_]+)['"`]/g)].map((x) => x[1]) : [];
}

const norm = (p) => p.replace(/:[a-zA-Z_]+\??/g, ':x').replace(/\/+$/, '') || '/';

const catalogue = {};
for (const [backend, cfg] of Object.entries(BACKENDS)) {
  const rows = [];
  for (const [file, mount] of Object.entries(cfg.mounts)) {
    const raw = fs.readFileSync(path.join(revampDir, backend, 'routes', file), 'utf8');
    const src = stripComments(raw);
    const types = v4Types(src);
    for (const m of src.matchAll(/\brouter\.(get|post|put|patch|delete|all)\s*\(/g)) {
      const { args } = callArgs(src, m.index + m[0].length - 1);
      const p = args[0] ?? '';
      const lit = /^(['"`])(.*)\1$/s.exec(p);
      if (!lit) continue;
      let routePath = lit[2];
      const isV4 = routePath.includes('${');
      if (isV4) routePath = routePath.replace(/\$\{\s*\w+\s*\}/, '/{t}/v4');
      const line = src.slice(0, m.index).split('\n').length;
      const handler = (args[args.length - 1] ?? '').replace(/\s+/g, ' ').slice(0, 80);
      const middleware = args.slice(1, -1).map((a) => a.replace(/\s+/g, ' ').slice(0, 40));
      rows.push({ method: m[1].toUpperCase(), path: (mount + routePath).replace(/\/\//g, '/'), file: `routes/${file}:${line}`, handler, middleware, v4Types: isV4 ? types.length : 0 });
    }
  }

  const calls = CLIENT_CALLS[cfg.short] ?? {};
  for (const r of rows) {
    const key = `${r.method} ${norm(r.path)}`;
    r.usedBy = Object.entries(calls).filter(([, list]) => list.some((c) => norm(c.split(' ')[1]) === norm(r.path) && c.split(' ')[0] === r.method)).map(([client]) => client);
    const file = r.file.split(':')[0];
    if (DROP.test(r.path) || DROP.test(r.handler)) r.verdict = 'drop';
    else if (PROVIDER_PATH.test(r.path)) r.verdict = 'keep path (provider-configured)';
    else if (file.endsWith('api.js')) r.verdict = STORE_HANDLERS.test(r.handler) ? 'rebuild (store contract, frozen)' : 'rebuild (app contract, frozen)';
    else if (file.endsWith('admin.js')) r.verdict = 'replace (admin API)';
    else if (file.endsWith('reseller.js')) r.verdict = 'replace (reseller API)';
    else r.verdict = 'replace (unified customer API)';
    r.key = key;
  }
  catalogue[backend] = rows;
}

// ---------------- Markdown ----------------
fs.mkdirSync(outDir, { recursive: true });
const VERDICTS = ['rebuild (app contract, frozen)', 'rebuild (store contract, frozen)', 'keep path (provider-configured)', 'replace (unified customer API)', 'replace (admin API)', 'replace (reseller API)', 'drop'];
const urlCount = (rows) => rows.reduce((a, r) => a + (r.v4Types || 1), 0);

const summary = ['| Verdict | ibo | bob | cr |', '|---|---|---|---|'];
for (const v of VERDICTS) {
  summary.push(`| ${v} | ${['iboplayer-backend', 'bobplayer-backend', 'cr-unified-backend'].map((b) => catalogue[b].filter((r) => r.verdict === v).length).join(' | ')} |`);
}
summary.push(`| **Route definitions** | ${Object.values(catalogue).map((r) => `**${r.length}**`).join(' | ')} |`);
summary.push(`| **Live URLs** (V4 × app types) | ${Object.values(catalogue).map((r) => `**${urlCount(r)}**`).join(' | ')} |`);
summary.push(`| Called by a known client | ${Object.values(catalogue).map((r) => r.filter((x) => x.usedBy.length).length).join(' | ')} |`);

const index = [
  '# Endpoint catalogue (CAP-02)',
  '',
  `> Generated ${new Date().toISOString().slice(0, 10)} by \`tools/legacy-analysis/endpoint-catalogue.cjs\` from \`routes/*.js\` of the three old backends (comments stripped, multi-line definitions included). V4 routes are written once in a loop and listed once with \`{t}\` = app type.`,
  '> "Called by" uses the real clients surveyed in [client-usage.md](client-usage.md). A route nobody here calls is not automatically dead: other apps exist; production traffic logs decide.',
  '',
  '## Verdicts',
  '',
  '| Verdict | Meaning |',
  '|---|---|',
  '| rebuild (app contract, frozen) | Installed apps call it: same path, method, encoding and response shape; logic rebuilt clean behind a legacy adapter |',
  '| rebuild (store contract, frozen) | The external store calls it: same contract, see store-contract.md |',
  '| keep path (provider-configured) | Payment providers redirect or post to it; the URL is configured in their dashboards |',
  '| replace (unified customer API) | Old website route; the unified frontend uses the new customer API instead (D15) |',
  '| replace (admin API) / (reseller API) | Old server-rendered panel; replaced by the new admin and reseller APIs |',
  '| drop | Test, debug, one-off maintenance or unsafe route; not rebuilt |',
  '',
  ...summary,
  '',
  'Per backend: [ibo](endpoints-ibo.md) · [bob](endpoints-bob.md) · [cr](endpoints-cr.md)',
  '',
];
fs.writeFileSync(path.join(outDir, 'endpoints.md'), index.join('\n'));

for (const [backend, rows] of Object.entries(catalogue)) {
  const short = BACKENDS[backend].short;
  const out = [`# Endpoints: ${backend}`, '', `> ${rows.length} route definitions, ${urlCount(rows)} live URLs. Generated by \`tools/legacy-analysis/endpoint-catalogue.cjs\`. Back to [summary](endpoints.md).`, ''];
  for (const v of VERDICTS) {
    const list = rows.filter((r) => r.verdict === v);
    if (!list.length) continue;
    out.push(`## ${v} · ${list.length}`, '', '| Method | Path | Handler | Middleware | Called by | Source |', '|---|---|---|---|---|---|');
    for (const r of list.sort((a, b) => a.path.localeCompare(b.path))) {
      const p = r.v4Types ? `${r.path} (×${r.v4Types})` : r.path;
      out.push(`| ${r.method} | \`${p}\` | \`${r.handler.replace(/\|/g, '\\|')}\` | ${r.middleware.map((m) => `\`${m.replace(/\|/g, '\\|')}\``).join(' ')} | ${r.usedBy.join(', ')} | ${r.file} |`);
    }
    out.push('');
  }
  fs.writeFileSync(path.join(outDir, `endpoints-${short}.md`), out.join('\n'));
}
fs.writeFileSync(path.join(outDir, 'endpoints.json'), JSON.stringify(catalogue, null, 1) + '\n');
console.log(Object.entries(catalogue).map(([b, r]) => `${b}: ${r.length} routes, ${urlCount(r)} URLs, ${r.filter((x) => x.usedBy.length).length} used by known clients`).join('\n'));
