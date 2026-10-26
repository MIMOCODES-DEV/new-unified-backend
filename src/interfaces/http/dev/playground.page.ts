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
    </div>
  </section>

  <section>
    <div class="panel">
      <h2>Device</h2>
      <div id="device"><p class="empty">No device for this MAC yet.</p></div>
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
  function call(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch('/dev/devices' + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        log(method, path, body, res.status, json);
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
    var left = document.createElement('span'); left.textContent = method + ' /dev/devices' + path;
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

  lookUp();
})();
</script>
</body>
</html>
`;
