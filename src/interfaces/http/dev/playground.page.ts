/**
 * The device playground: one page, served by the backend in development only
 * (`http://<brand>.localhost:3000/dev/playground`). It calls the /dev/devices routes on the same
 * host, so the brand is the one in the address bar. The page uses no backticks or template
 * placeholders, because it lives inside this string.
 */
export const PLAYGROUND_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Device Playground</title>
<style>
  :root {
    --bg: #f6f7f9; --panel: #ffffff; --text: #1b1f24; --muted: #5f6b7a; --line: #e2e6ec;
    --accent: #2f6fde; --accent-text: #ffffff; --ok: #1f8a4c; --warn: #b26a00; --bad: #c43d3d;
    --chip: #eef2f7; --code: #f2f4f7;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #111418; --panel: #191d23; --text: #e6e9ee; --muted: #98a2b3; --line: #2a3039;
      --accent: #5b8ff0; --accent-text: #0b1220; --ok: #4cc283; --warn: #e0a440; --bad: #ef6b6b;
      --chip: #232a33; --code: #141820;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 2; }
  h1 { font-size: 17px; margin: 0; }
  h1 small { color: var(--muted); font-weight: 400; margin-left: 6px; }
  h2 { font-size: 14px; margin: 0 0 10px; }
  main { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; padding: 16px 20px; max-width: 1400px; margin: 0 auto; }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; padding: 16px; } header { padding: 12px 16px; } }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px; margin-bottom: 16px; }
  .hint { color: var(--muted); font-size: 12.5px; margin: -4px 0 10px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; margin-bottom: 8px; }
  label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--muted); min-width: 110px; flex: 1; }
  input, select { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 7px; padding: 6px 8px; min-width: 0; }
  button { font: inherit; border: 1px solid var(--line); background: var(--chip); color: var(--text); border-radius: 7px; padding: 6px 11px; cursor: pointer; white-space: nowrap; }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
  button:hover { filter: brightness(1.06); }
  .tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
  .tabs button[aria-selected="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
  .tab { display: none; } .tab.active { display: block; }
  .captcha { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 6px 0 10px; }
  .captcha img { height: 64px; border-radius: 6px; border: 1px solid var(--line); background: #000; }
  .kv { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 4px 10px; font-size: 13px; }
  .kv div:nth-child(odd) { color: var(--muted); }
  .kv code { word-break: break-all; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--chip); }
  .pill.ok { color: var(--ok); } .pill.warn { color: var(--warn); } .pill.bad { color: var(--bad); }
  .log { display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow: auto; }
  .entry { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  .entry .head { display: flex; gap: 8px; align-items: center; justify-content: space-between; font-size: 12.5px; }
  .entry pre { margin: 6px 0 0; background: var(--code); padding: 8px; border-radius: 6px; font-size: 12px; overflow: auto; max-height: 260px; white-space: pre-wrap; word-break: break-all; }
  .empty { color: var(--muted); font-size: 13px; }
  .brand { display: flex; gap: 8px; align-items: center; }
  h3.sub { font-size: 13px; margin: 14px 0 6px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  textarea { font: 12px/1.4 ui-monospace, Consolas, monospace; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 7px; padding: 6px 8px; width: 100%; min-height: 90px; }
  .cards { display: flex; flex-direction: column; gap: 8px; }
  .card { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; cursor: pointer; font-size: 13px; }
  .card.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
  .card .top { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; }
  .card .name { font-weight: 600; }
  .card .line { color: var(--muted); word-break: break-all; }
  .check { flex-direction: row; align-items: center; gap: 6px; min-width: 0; flex: 0 0 auto; }
</style>
</head>
<body>
<header>
  <h1>Device Playground <small>Phase 1 device rules on the real database</small></h1>
  <div class="brand">
    <span class="hint" style="margin:0">Brand</span>
    <select id="brand" aria-label="Brand"></select>
  </div>
</header>
<main>
  <section>
    <div class="panel">
      <h2>Device MAC</h2>
      <p class="hint">Every action below uses this MAC. Case and separators do not matter.</p>
      <div class="row">
        <label>MAC address<input id="mac" placeholder="aa:bb:cc:dd:ee:ff"></label>
        <button id="randomMac">Random MAC</button>
        <button id="fallbackMac" title="A shared placeholder MAC: treated as no MAC">Fallback MAC</button>
        <button id="refresh">Look up</button>
      </div>
      <label style="flex-direction:row;align-items:center;gap:6px;min-width:0"><input type="checkbox" id="reveal"> Show captcha answers (dev only)</label>
    </div>

    <div class="panel">
      <div class="tabs" role="tablist">
        <button data-tab="register" aria-selected="true">Old app (DEV-1/2/3/6)</button>
        <button data-tab="v4">V4 login (DEV-4)</button>
        <button data-tab="tv">Old TV code (DEV-4)</button>
        <button data-tab="owner">Key and PIN (DEV-5)</button>
        <button data-tab="playlists">Playlists (PL-1 to PL-8)</button>
        <button data-tab="license">License (LIC-1 to LIC-3)</button>
      </div>

      <div class="tab active" id="tab-register">
        <p class="hint">What an old app route does on every start: find the device, or make it with a trial.</p>
        <div class="row">
          <label>Platform<select id="r-platform"></select></label>
          <label>App version<input id="r-version" value="1.0.0"></label>
          <label>API version<select id="r-api"><option>legacy</option><option>v4</option><option>v5</option></select></label>
        </div>
        <div class="row">
          <label>App device id (no MAC)<input id="r-appid" placeholder="optional"></label>
          <label>uid<input id="r-uid" placeholder="optional"></label>
          <button class="primary" id="register">Register / visit</button>
        </div>
      </div>

      <div class="tab" id="tab-v4">
        <p class="hint">A new MAC needs a solved captcha once. A different uid needs the recovery captcha, which shows the stored uid.</p>
        <div class="row">
          <label>Platform<select id="v-platform"></select></label>
          <label>uid (6 letters or digits)<input id="v-uid" value="QW12ER"></label>
          <label>App version<input id="v-version" value="4.0.0"></label>
        </div>
        <div class="row">
          <button id="v-captcha">1. Get captcha</button>
          <button id="v-uidcaptcha">Get uid recovery captcha</button>
        </div>
        <div class="captcha" id="v-captcha-box"></div>
        <div class="row">
          <label>Captcha answer<input id="v-answer" placeholder="type what the picture shows"></label>
          <label>Recovery answer<input id="v-uidanswer" placeholder="only after a uid mismatch"></label>
          <button class="primary" id="v-login">2. Log in</button>
        </div>
      </div>

      <div class="tab" id="tab-tv">
        <p class="hint">Old TV apps send the code they typed once on every start. The first time it answers the open captcha; after that the same code keeps working.</p>
        <div class="row">
          <button id="t-captcha">Get 2-character captcha</button>
        </div>
        <div class="captcha" id="t-captcha-box"></div>
        <div class="row">
          <label>Code<input id="t-code"></label>
          <button class="primary" id="t-send">Send code</button>
        </div>
      </div>

      <div class="tab" id="tab-owner">
        <p class="hint">The website login is MAC + device key. Keys are not unique; they are always checked with the MAC.</p>
        <div class="row">
          <label>Device key<input id="o-key" placeholder="6 digits"></label>
          <button id="o-verify">Log in with key</button>
          <button id="o-change">Change key to this</button>
          <button id="o-random">Random new key</button>
        </div>
        <p class="hint">Parental control: a 4-digit PIN turns it on, off removes the PIN. New devices start on with 0000.</p>
        <div class="row">
          <label>Parent PIN<input id="o-pin" placeholder="4 digits"></label>
          <button id="o-pin-on">Turn on / change PIN</button>
          <button id="o-pin-off">Turn off</button>
        </div>
      </div>

      <div class="tab" id="tab-license">
        <p class="hint">Activating moves a trial device to devices. A year starts where the running trial or year ends; lifetime never ends. The state is worked out from the dates, never stored.</p>
        <div class="row">
          <label>Type<select id="l-type"><option value="yearly">Yearly (1 credit)</option><option value="lifetime">Lifetime (2 credits)</option></select></label>
          <label>Paid by<select id="l-source">
            <option>admin</option><option>reseller</option><option>code</option><option>coupon</option>
            <option>payment</option><option>store</option><option>transfer</option><option>plan</option>
          </select></label>
          <label>Who (actor id)<input id="l-actor" placeholder="optional"></label>
        </div>
        <div class="row">
          <label>Source id (transaction, code, …)<input id="l-source-id"></label>
          <button id="l-new-source" title="A new source id: a new payment">New id</button>
          <label>Reseller id<input id="l-reseller" placeholder="optional"></label>
          <label class="check"><input type="checkbox" id="l-multi"> multi-device order</label>
        </div>
        <div class="row">
          <button class="primary" id="l-activate">Activate</button>
          <button id="l-revoke">Revoke current license</button>
        </div>
        <p class="hint">Send the same source id twice: it activates once. Use New id for a second payment.</p>
      </div>

      <div class="tab" id="tab-playlists">
        <p class="hint">Playlists of the device with the MAC above; register it first (Old app tab). The list on the right shows them.</p>
        <h3 class="sub">Add (PL-1, PL-3, PL-6)</h3>
        <div class="row">
          <label>Kind<select id="p-kind">
            <option value="link">Link (M3U, or Xtream when it looks like one)</option>
            <option value="xtream">Xtream as 3 fields</option>
            <option value="stalker">Stalker portal</option>
            <option value="code">Provider code</option>
          </select></label>
          <label>Name<input id="p-name" value="My list"></label>
        </div>
        <div class="row" data-kind="link"><label>Link<input id="p-url" value="http://line.example.com:8080/get.php?username=demo&amp;password=demo&amp;type=m3u_plus"></label></div>
        <div class="row" data-kind="xtream" hidden>
          <label>Server<input id="p-server" value="http://line.example.com:8080"></label>
          <label>Username<input id="p-user" value="demo"></label>
          <label>Password<input id="p-pass" value="demo"></label>
        </div>
        <div class="row" data-kind="stalker" hidden>
          <label>Portal link<input id="p-portal" value="http://portal.example.com/c/"></label>
          <label>Portal name<input id="p-portal-name" placeholder="optional"></label>
          <label>Fallback portal<input id="p-fallback" placeholder="optional"></label>
          <label>Portal MAC<input id="p-portal-mac" placeholder="optional"></label>
        </div>
        <div class="row" data-kind="code" hidden><label>Code (digits)<input id="p-code" value="482915"></label></div>
        <div class="row">
          <label>EPG link<input id="p-epg" placeholder="optional"></label>
          <label>PIN<input id="p-pin" placeholder="optional: 4 digits protects it"></label>
        </div>
        <div class="row">
          <button class="primary" id="p-add">Add from the app</button>
          <button id="p-add-web">Add from the website</button>
          <button id="p-add-mac" title="QR code page, Stalker form, add by MAC: no login, limited per IP">Add without login</button>
        </div>

        <h3 class="sub">Selected playlist (click one on the right)</h3>
        <div class="row">
          <label>Acting as<select id="p-by">
            <option value="app">The TV app: no PIN needed</option>
            <option value="dashboard">The website dashboard: PIN needed when protected</option>
          </select></label>
          <label>Its current PIN<input id="p-curpin" placeholder="dashboard only"></label>
        </div>
        <div class="row">
          <label>New name<input id="p-newname"></label><button id="p-rename">Rename</button>
          <label>New link<input id="p-newurl"></label><button id="p-relink">Change link</button>
        </div>
        <div class="row">
          <label>New PIN<input id="p-newpin" placeholder="empty removes it"></label>
          <button id="p-setpin">Set / remove PIN</button>
          <button id="p-unlock">Unlock on dashboard</button>
          <button id="p-delete">Delete</button>
        </div>
        <div class="row">
          <label>Backup hosts (PL-5)<input id="p-hosts" placeholder="mirror1.example.com, mirror2.example.com:8080"></label>
          <label class="check"><input type="checkbox" id="p-backup-on" checked> on</label>
          <button id="p-backup">Save backups</button>
        </div>
        <div class="row">
          <label>Account status (PL-7)<input id="p-status" value="Active"></label>
          <label>Expires<input id="p-exp" placeholder="2027-01-01 or Unix seconds"></label>
          <button id="p-report">Report as the app</button>
        </div>

        <h3 class="sub">Whole device (PL-2, PL-6)</h3>
        <label>Bulk sync as the app sends it (update_playlist)<textarea id="p-sync">{
  "playlists": [
    { "originId": "non_saved_1", "name": "Synced A", "url": "http://cdn.example.com/a.m3u" },
    { "originId": "non_saved_2", "name": "Synced B", "url": "http://line.example.com/get.php?username=u&amp;password=p" }
  ],
  "removeIds": []
}</textarea></label>
        <div class="row" style="margin-top:8px">
          <button id="p-sync-send">Send sync</button>
          <button id="p-delete-mac" title="Keeps protected playlists; limited per IP">Delete all without login</button>
        </div>

        <h3 class="sub">Provider moved host (PL-8)</h3>
        <div class="row">
          <label>Old host<input id="p-from" value="line.example.com"></label>
          <label>New host<input id="p-to" value="line2.example.com"></label>
          <label>At most<input id="p-limit" placeholder="all"></label>
          <label class="check"><input type="checkbox" id="p-only-mac"> only this MAC</label>
        </div>
        <div class="row">
          <button id="p-count">Count</button>
          <button id="p-move">Move</button>
        </div>
      </div>
    </div>
  </section>

  <section>
    <div class="panel">
      <h2>Device</h2>
      <div id="device"><p class="empty">No device for this MAC yet.</p></div>
    </div>
    <div class="panel">
      <h2>License</h2>
      <div id="license"><p class="empty">No device for this MAC yet.</p></div>
    </div>
    <div class="panel">
      <div class="row" style="justify-content:space-between;align-items:end">
        <h2 style="margin:0">Playlists</h2>
        <label style="flex:0 1 220px">Show<select id="pv-view">
          <option value="stored">As stored</option>
          <option value="reply">As the app gets them (PL-4)</option>
          <option value="dashboard">As the dashboard lists them</option>
        </select></label>
      </div>
      <div class="row" id="pv-reply-options" hidden>
        <label>Platform<select id="pv-platform"></select></label>
        <label>App version<input id="pv-version" value="1.0.0"></label>
        <label class="check"><input type="checkbox" id="pv-stalker" checked> Stalker on</label>
        <label class="check"><input type="checkbox" id="pv-pins"> with PINs (Roku, iOS)</label>
      </div>
      <div class="cards" id="playlists"><p class="empty">No device for this MAC yet.</p></div>
    </div>
    <div class="panel">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">Requests</h2>
        <button id="clear">Clear</button>
      </div>
      <div class="log" id="log"><p class="empty">Requests and answers appear here.</p></div>
    </div>
  </section>
</main>
<script>
(function () {
  var PLATFORMS = ['samsung','lg','android','android_tv','ios','tvos','macos','windows','linux','roku','vidaa','titanos','zeasn','vegaos','unknown'];
  var $ = function (id) { return document.getElementById(id); };
  var state = { device: null, v4Token: null, uidToken: null };

  ['r-platform', 'v-platform'].forEach(function (id) {
    PLATFORMS.forEach(function (p) { var o = document.createElement('option'); o.textContent = p; $(id).appendChild(o); });
  });
  $('v-platform').value = 'lg';

  var saved = null;
  try { saved = localStorage.getItem('playground.mac'); } catch (e) {}
  $('mac').value = saved || randomMac();
  $('mac').addEventListener('change', function () { remember(); lookUp(); });

  function remember() { try { localStorage.setItem('playground.mac', $('mac').value); } catch (e) {} }
  function randomMac() {
    var b = [];
    for (var i = 0; i < 6; i++) b.push(('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2));
    b[0] = 'aa';
    return b.join(':');
  }
  function orNull(v) { v = v.trim(); return v === '' ? null : v; }
  function mac() { return orNull($('mac').value); }

  // Tabs
  document.querySelectorAll('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.id === 'tab-' + btn.dataset.tab); });
    });
  });

  // Brands
  fetch('/dev/brands').then(function (r) { return r.json(); }).then(function (data) {
    data.brands.forEach(function (slug) {
      var o = document.createElement('option'); o.textContent = slug; $('brand').appendChild(o);
    });
    $('brand').value = data.current;
  });
  $('brand').addEventListener('change', function () {
    var port = location.port ? ':' + location.port : '';
    location.href = location.protocol + '//' + $('brand').value + '.localhost' + port + '/dev/playground';
  });

  // Requests
  function call(method, path, body, base) {
    base = base || '/dev/devices';
    var opts = { method: method, headers: {} };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(base + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        log(method, base + path, body, res.status, json);
        return { status: res.status, json: json };
      });
    });
  }

  function log(method, path, body, status, json) {
    var box = $('log');
    if (box.querySelector('.empty')) box.innerHTML = '';
    var e = document.createElement('div'); e.className = 'entry';
    var cls = status < 300 ? 'ok' : status < 500 ? 'warn' : 'bad';
    var label = json && json.error ? json.error.code : String(status);
    var head = document.createElement('div'); head.className = 'head';
    var left = document.createElement('span'); left.textContent = method + ' ' + path;
    var pill = document.createElement('span'); pill.className = 'pill ' + cls; pill.textContent = status + ' ' + (json && json.error ? label : 'ok');
    head.appendChild(left); head.appendChild(pill); e.appendChild(head);
    var pre = document.createElement('pre');
    pre.textContent = (body !== undefined ? 'sent ' + JSON.stringify(body) + '\n\n' : '') + JSON.stringify(shorten(json), null, 2);
    e.appendChild(pre);
    box.insertBefore(e, box.firstChild);
  }
  function shorten(json) {
    if (json && typeof json.imageUrl === 'string') return Object.assign({}, json, { imageUrl: '(picture shown above)' });
    return json;
  }
  $('clear').addEventListener('click', function () { $('log').innerHTML = '<p class="empty">Requests and answers appear here.</p>'; });

  // Device card
  function lookUp() {
    if (!mac()) return Promise.resolve();
    return fetch('/dev/devices/' + encodeURIComponent(mac())).then(function (r) { return r.json(); }).then(function (json) {
      show(json && json.device ? json : null);
    });
  }
  function show(found) {
    state.device = found;
    var box = $('device');
    if (!found) { box.innerHTML = '<p class="empty">No device for this MAC yet.</p>'; return; }
    var d = found.device;
    var now = new Date();
    var status;
    if (found.paid) status = '<span class="pill ok">paid</span>';
    else if (new Date(d.trialEndsAt) > now) status = '<span class="pill ok">trial</span>';
    else status = '<span class="pill bad">trial ended</span>';
    var rows = [
      ['Status', status],
      ['Collection', found.paid ? 'devices' : 'trialDevices'],
      ['Id', '<code>' + esc(d.id) + '</code>'],
      ['MAC', '<code>' + esc(d.macAddress) + '</code>'],
      ['Platform', esc(d.platform)],
      ['API version', esc(d.apiVersion)],
      ['App version', esc(d.appVersion || '-')],
      ['Device key', '<code>' + esc(d.deviceKey) + '</code>'],
      ['Parental control', d.parentPin === null ? 'off' : 'on, PIN <code>' + esc(d.parentPin) + '</code>'],
      ['uid', esc(d.uid || '-')],
      ['App device id', esc(d.appDeviceId || '-')]
    ];
    if (!found.paid) {
      rows.push(['Trial ends', esc(new Date(d.trialEndsAt).toUTCString())]);
      rows.push(['Playlists', String(d.playlistCount)]);
    } else {
      rows.push(['Activated', esc(new Date(d.activatedAt).toUTCString())]);
    }
    rows.push(['Last seen', esc(new Date(d.lastSeenAt).toLocaleString())]);
    box.innerHTML = '<div class="kv">' + rows.map(function (r) { return '<div>' + r[0] + '</div><div>' + r[1] + '</div>'; }).join('') + '</div>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function deviceId() {
    if (!state.device) { alert('Register a device for this MAC first.'); return null; }
    return state.device.device.id;
  }
  function reveal() { return $('reveal').checked; }
  function showCaptcha(boxId, url, answer) {
    var img = document.createElement('img'); img.src = url; img.alt = 'captcha';
    $(boxId).innerHTML = ''; $(boxId).appendChild(img);
    if (answer) { var a = document.createElement('span'); a.className = 'pill'; a.textContent = 'answer: ' + answer; $(boxId).appendChild(a); }
  }

  $('randomMac').addEventListener('click', function () { $('mac').value = randomMac(); remember(); lookUp(); });
  $('fallbackMac').addEventListener('click', function () { $('mac').value = '52:54:00:12:34:57'; remember(); lookUp(); });
  $('refresh').addEventListener('click', lookUp);

  // Old app
  $('register').addEventListener('click', function () {
    call('POST', '/register', {
      mac: mac(), platform: $('r-platform').value, appVersion: orNull($('r-version').value),
      apiVersion: $('r-api').value, appDeviceId: orNull($('r-appid').value), uid: orNull($('r-uid').value)
    }).then(function (r) {
      if (r.json.found) {
        if (r.json.found.device.macAddress !== (mac() || '').toLowerCase()) $('mac').value = r.json.found.device.macAddress;
        remember();
        show(r.json.found);
      }
    });
  });

  // V4
  $('v-captcha').addEventListener('click', function () {
    call('POST', '/captcha', { mac: mac(), platform: $('v-platform').value, length: 4, revealAnswer: reveal() }).then(function (r) {
      if (r.json.token) { state.v4Token = r.json.token; showCaptcha('v-captcha-box', r.json.imageUrl, r.json.answer); $('v-answer').value = r.json.answer || ''; $('v-answer').focus(); }
    });
  });
  $('v-uidcaptcha').addEventListener('click', function () {
    call('POST', '/v4/uid-captcha', { mac: mac(), platform: $('v-platform').value, revealAnswer: reveal() }).then(function (r) {
      if (r.json.token) { state.uidToken = r.json.token; showCaptcha('v-captcha-box', r.json.imageUrl, r.json.answer); $('v-uidanswer').value = r.json.answer || ''; $('v-uidanswer').focus(); }
    });
  });
  $('v-login').addEventListener('click', function () {
    var answer = orNull($('v-answer').value), uidAnswer = orNull($('v-uidanswer').value);
    call('POST', '/v4/login', {
      mac: mac(), platform: $('v-platform').value, uid: $('v-uid').value, appVersion: orNull($('v-version').value),
      captcha: answer && state.v4Token ? { token: state.v4Token, answer: answer } : null,
      uidCaptcha: uidAnswer && state.uidToken ? { token: state.uidToken, answer: uidAnswer } : null
    }).then(function (r) {
      $('v-answer').value = ''; $('v-uidanswer').value = '';
      if (r.json.device) show(r.json);
    });
  });

  // Old TV
  $('t-captcha').addEventListener('click', function () {
    call('POST', '/captcha', { mac: mac(), platform: 'samsung', length: 2, revealAnswer: reveal() }).then(function (r) {
      if (r.json.imageUrl) { showCaptcha('t-captcha-box', r.json.imageUrl, r.json.answer); $('t-code').value = r.json.answer || ''; $('t-code').focus(); }
    });
  });
  $('t-send').addEventListener('click', function () { call('POST', '/captcha-code', { mac: mac(), code: $('t-code').value }); });

  // Key and PIN
  $('o-verify').addEventListener('click', function () { call('POST', '/key/verify', { mac: mac(), key: $('o-key').value }); });
  $('o-change').addEventListener('click', function () {
    var id = deviceId(); if (id) call('POST', '/' + id + '/key', { key: $('o-key').value }).then(lookUp);
  });
  $('o-random').addEventListener('click', function () {
    var id = deviceId(); if (id) call('POST', '/' + id + '/key', { key: null }).then(lookUp);
  });
  $('o-pin-on').addEventListener('click', function () {
    var id = deviceId(); if (id) call('POST', '/' + id + '/parent-pin', { pin: $('o-pin').value }).then(lookUp);
  });
  $('o-pin-off').addEventListener('click', function () {
    var id = deviceId(); if (id) call('POST', '/' + id + '/parent-pin', { pin: null }).then(lookUp);
  });

  // Playlists
  var pl = { selected: null, items: [] };
  PLATFORMS.forEach(function (p) { var o = document.createElement('option'); o.textContent = p; $('pv-platform').appendChild(o); });
  function plCall(method, path, body) { return call(method, path, body, '/dev/playlists'); }
  function macPath() { return '/' + encodeURIComponent(mac() || ''); }
  function both() { refreshPlaylists(); lookUp(); refreshLicense(); }

  // License
  function newSourceId() { $('l-source-id').value = 'src-' + Math.random().toString(36).slice(2, 8); }
  newSourceId();
  $('l-new-source').addEventListener('click', newSourceId);
  $('l-activate').addEventListener('click', function () {
    call('POST', macPath() + '/activate', {
      type: $('l-type').value, source: $('l-source').value, actorId: orNull($('l-actor').value),
      sourceId: orNull($('l-source-id').value), multiActivate: $('l-multi').checked,
      resellerId: orNull($('l-reseller').value)
    }, '/dev/licenses').then(both);
  });
  $('l-revoke').addEventListener('click', function () { call('POST', macPath() + '/revoke', undefined, '/dev/licenses').then(both); });

  var STATE_PILL = { trial: 'ok', yearly: 'ok', lifetime: 'ok', expired: 'bad', revoked: 'bad' };
  function when(iso) { return iso ? new Date(iso).toUTCString().replace(' GMT', ' UTC') : 'never'; }
  function refreshLicense() {
    var box = $('license');
    if (!mac()) { box.innerHTML = '<p class="empty">Type a MAC first.</p>'; return; }
    Promise.all([
      fetch('/dev/licenses' + macPath()).then(function (r) { return r.json(); }),
      fetch('/dev/licenses' + macPath() + '/history').then(function (r) { return r.json(); })
    ]).then(function (both) {
      var st = both[0], hist = both[1];
      if (st && st.error) { box.innerHTML = '<p class="empty">No device for this MAC yet.</p>'; return; }
      var html = '<div class="kv">' +
        '<div>State</div><div><span class="pill ' + STATE_PILL[st.state] + '">' + esc(st.state) + '</span>' + (st.active ? ' can play' : ' cannot play') + '</div>' +
        '<div>Ends</div><div>' + esc(when(st.endsAt)) + '</div>' +
        (st.license ? '<div>Current license</div><div><code>' + esc(st.license.id) + '</code></div>' : '') +
        '</div>';
      if (Array.isArray(hist) && hist.length) {
        html += '<h3 class="sub">History, oldest first</h3><div class="cards">' + hist.map(function (e) {
          var l = e.license;
          return '<div class="card"><div class="top"><span class="name">' + esc(l.type) + '</span>' +
            '<span class="pill ' + STATE_PILL[e.state] + '">' + esc(e.state) + '</span>' +
            (e.current ? '<span class="pill">current</span>' : '') +
            (l.multiActivate ? '<span class="pill warn">multi-device</span>' : '') + '</div>' +
            '<div class="line">by ' + esc(l.activatedBy.source) + (l.activatedBy.actorId ? ' (' + esc(l.activatedBy.actorId) + ')' : '') +
            ' on ' + esc(when(l.createdAt)) + ', ' + l.creditCost + ' credit' + (l.creditCost > 1 ? 's' : '') + '</div>' +
            '<div class="line">ends ' + esc(when(l.expiresAt)) + (l.sourceId ? ', source ' + esc(l.sourceId) : '') + '</div>' +
            (l.revoked ? '<div class="line">revoked ' + esc(when(l.revokedAt)) + '</div>' : '') + '</div>';
        }).join('') + '</div>';
      }
      box.innerHTML = html;
    });
  }

  $('p-kind').addEventListener('change', function () {
    document.querySelectorAll('[data-kind]').forEach(function (row) { row.hidden = row.dataset.kind !== $('p-kind').value; });
  });
  $('pv-view').addEventListener('change', function () {
    $('pv-reply-options').hidden = $('pv-view').value !== 'reply';
    refreshPlaylists();
  });
  ['pv-platform', 'pv-version', 'pv-stalker', 'pv-pins'].forEach(function (id) { $(id).addEventListener('change', refreshPlaylists); });

  function plSource() {
    switch ($('p-kind').value) {
      case 'xtream': return { kind: 'xtream', server: $('p-server').value, username: $('p-user').value, password: $('p-pass').value };
      case 'stalker': return { kind: 'stalker', portalUrl: $('p-portal').value, portalName: orNull($('p-portal-name').value), fallbackUrl: orNull($('p-fallback').value), mac: orNull($('p-portal-mac').value) };
      case 'code': return { kind: 'code', code: $('p-code').value };
      default: return { kind: 'link', url: $('p-url').value };
    }
  }
  function plAdd(path, extra) {
    return plCall('POST', macPath() + path, Object.assign({
      name: $('p-name').value, source: plSource(), epgUrl: orNull($('p-epg').value), pin: orNull($('p-pin').value)
    }, extra)).then(both);
  }
  $('p-add').addEventListener('click', function () { plAdd('/add', { via: 'app' }); });
  $('p-add-web').addEventListener('click', function () { plAdd('/add', { via: 'website' }); });
  $('p-add-mac').addEventListener('click', function () { plAdd('/by-mac/add', {}); });

  function selected() {
    if (!pl.selected) { alert('Click a playlist in the list on the right first.'); return null; }
    return pl.selected;
  }
  function acting() { return { by: $('p-by').value, pin: orNull($('p-curpin').value) }; }
  function onSelected(path, body) {
    var id = selected(); if (!id) return;
    plCall('POST', macPath() + '/' + id + path, body).then(both);
  }
  $('p-rename').addEventListener('click', function () { onSelected('/edit', Object.assign(acting(), { name: $('p-newname').value })); });
  $('p-relink').addEventListener('click', function () { onSelected('/edit', Object.assign(acting(), { source: { kind: 'link', url: $('p-newurl').value } })); });
  $('p-setpin').addEventListener('click', function () {
    var a = acting();
    onSelected('/pin', { by: a.by, pin: orNull($('p-newpin').value), currentPin: a.pin });
  });
  $('p-unlock').addEventListener('click', function () { onSelected('/unlock', { pin: orNull($('p-curpin').value) }); });
  $('p-delete').addEventListener('click', function () {
    var id = selected(); if (!id) return;
    plCall('POST', macPath() + '/' + id + '/delete', acting()).then(function () { pl.selected = null; both(); });
  });
  $('p-backup').addEventListener('click', function () {
    var hosts = $('p-hosts').value.split(/[\s,]+/).filter(function (h) { return h; });
    onSelected('/backup', Object.assign(acting(), { enabled: $('p-backup-on').checked, hosts: hosts }));
  });
  $('p-report').addEventListener('click', function () {
    var exp = $('p-exp').value.trim();
    onSelected('/status', { status: orNull($('p-status').value), expiresAt: exp === '' ? undefined : exp });
  });
  $('p-sync-send').addEventListener('click', function () {
    var body;
    try { body = JSON.parse($('p-sync').value); } catch (e) { alert('The sync is not valid JSON: ' + e.message); return; }
    plCall('POST', macPath() + '/sync', body).then(both);
  });
  $('p-delete-mac').addEventListener('click', function () { plCall('POST', macPath() + '/by-mac/delete').then(both); });
  function moveHost(countOnly) {
    var limit = parseInt($('p-limit').value, 10);
    var body = { from: $('p-from').value, to: $('p-to').value, countOnly: countOnly };
    if (limit > 0) body.limit = limit;
    if ($('p-only-mac').checked && mac()) body.macs = [mac()];
    plCall('POST', '/move-host', body).then(function () { if (!countOnly) both(); });
  }
  $('p-count').addEventListener('click', function () { moveHost(true); });
  $('p-move').addEventListener('click', function () { moveHost(false); });

  function refreshPlaylists() {
    var box = $('playlists');
    if (!mac()) { box.innerHTML = '<p class="empty">Type a MAC first.</p>'; return; }
    var view = $('pv-view').value, path = macPath();
    if (view === 'dashboard') path += '/dashboard';
    if (view === 'reply') {
      path += '/reply?platform=' + encodeURIComponent($('pv-platform').value) +
        '&appVersion=' + encodeURIComponent($('pv-version').value) +
        '&stalkerEnabled=' + $('pv-stalker').checked + '&includePins=' + $('pv-pins').checked;
    }
    fetch('/dev/playlists' + path).then(function (r) { return r.json(); }).then(function (json) {
      if (json && json.error) {
        box.innerHTML = '<p class="empty">' + esc(json.error.code === 'devices.not_found' ? 'No device for this MAC yet.' : json.error.message) + '</p>';
        return;
      }
      var items = Array.isArray(json) ? json : json.playlists;
      pl.items = items;
      if (!items.length) { box.innerHTML = '<p class="empty">No playlists.</p>'; return; }
      box.innerHTML = '';
      if (!Array.isArray(json)) {
        var own = document.createElement('p'); own.className = 'hint'; own.style.margin = '0';
        own.textContent = 'hasOwnPlaylist: ' + json.hasOwnPlaylist;
        box.appendChild(own);
      }
      items.forEach(function (p) { box.appendChild(card(p)); });
    });
  }
  function card(p) {
    var el = document.createElement('div');
    el.className = 'card' + (p.id && p.id === pl.selected ? ' selected' : '');
    var pills = '<span class="pill">' + esc(p.type) + '</span>';
    if (p.demo) pills += '<span class="pill warn">demo</span>';
    if (p.protected) pills += '<span class="pill warn">protected' + (p.hidden ? ', hidden' : '') + '</span>';
    if (p.backup && p.backup.enabled) pills += '<span class="pill ok">backups on</span>';
    if (p.account) pills += '<span class="pill ok">' + esc((p.account.status || 'no status') + (p.account.expiresAt ? ' until ' + p.account.expiresAt.slice(0, 10) : '')) + '</span>';
    var lines = [];
    if (p.url) lines.push(p.url);
    if (p.username) lines.push('username ' + p.username + ', password ' + p.password);
    if (p.xtream && !p.username) lines.push('xtream: ' + p.xtream.server + ' / ' + p.xtream.username);
    if (p.stalker) lines.push('portal ' + p.stalker.portalUrl + (p.stalker.mac ? ' (MAC ' + p.stalker.mac + ')' : ''));
    if (p.code && typeof p.code === 'object') lines.push('code ' + p.code.code);
    if (typeof p.code === 'string') lines.push('code ' + p.code);
    if (p.backup && p.backup.hosts && p.backup.hosts.length) lines.push('backup hosts: ' + p.backup.hosts.join(', '));
    if (p.backupUrls && p.backupUrls.length) lines.push('backup links: ' + p.backupUrls.join('  '));
    if (p.pin !== undefined) lines.push('PIN sent to the app: ' + p.pin);
    if (p.pinEnc) lines.push('pinEnc: ' + p.pinEnc.slice(0, 24) + '…');
    el.innerHTML = '<div class="top"><span class="name">' + esc(p.name) + '</span>' + pills + '</div>' +
      lines.map(function (l) { return '<div class="line">' + esc(l) + '</div>'; }).join('');
    if (p.id) {
      el.addEventListener('click', function () {
        pl.selected = p.id;
        $('p-newname').value = p.name;
        if (p.url) $('p-newurl').value = p.url;
        if (p.backup) { $('p-hosts').value = p.backup.hosts.join(', '); $('p-backup-on').checked = p.backup.enabled; }
        document.querySelectorAll('#playlists .card').forEach(function (c) { c.classList.remove('selected'); });
        el.classList.add('selected');
      });
    }
    return el;
  }
  $('mac').addEventListener('change', function () { pl.selected = null; refreshPlaylists(); refreshLicense(); });
  ['randomMac', 'fallbackMac', 'refresh'].forEach(function (id) { $(id).addEventListener('click', function () { pl.selected = null; refreshPlaylists(); refreshLicense(); }); });
  $('register').addEventListener('click', function () { setTimeout(function () { refreshPlaylists(); refreshLicense(); }, 300); });

  lookUp();
  refreshPlaylists();
  refreshLicense();
})();
</script>
</body>
</html>
`;
