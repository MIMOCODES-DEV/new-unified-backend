/**
 * The playground's test and scenario runner (`/dev/playground/runner.js`). It calls the dev routes of
 * any brand on this machine (`<brand>.localhost`, CORS is open), speaks the V4 apps' envelope, runs
 * the suites of playground-tests.ts and the stories of playground-scenarios.ts, and draws their pages.
 * Plain browser JavaScript inside a string: no backticks or template placeholders.
 */
export const PLAYGROUND_RUNNER_JS = String.raw`(function () {
  var PORT = location.port ? ':' + location.port : '';
  var PG = (window.PG = { suites: [], scenarios: [], stopped: false });
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function brief(v) { try { var s = JSON.stringify(v); return s && s.length > 600 ? s.slice(0, 600) + '…' : s; } catch (e) { return String(v); } }

  // HTTP ----------------------------------------------------------------------------------------
  PG.origin = function (brand) { return location.protocol + '//' + brand + '.localhost' + PORT; };
  PG.recorder = null;
  PG.req = async function (method, path, body, opts) {
    opts = opts || {};
    if (PG.stopped) throw new Error('stopped');
    var brand = opts.brand || 'ibo';
    var headers = Object.assign({}, opts.headers || {});
    var init = { method: method, headers: headers };
    if (opts.form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; init.body = new URLSearchParams(opts.form).toString(); }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    var res = await fetch(PG.origin(brand) + path, init);
    var text = await res.text();
    var json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    var out = { status: res.status, json: json };
    if (PG.recorder) PG.recorder.push({ brand: brand, method: method, path: path, body: body, status: res.status, json: json });
    return out;
  };
  PG.code = function (r) { return (r && r.json && r.json.error && r.json.error.code) || 'ok'; };
  PG.ok = function (r) { return r.status === 200 || r.status === 201; };
  function hex() { return ('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2); }
  PG.mac = function (first) { var b = [first || 'aa']; for (var i = 0; i < 5; i++) b.push(hex()); return b.join(':'); };
  PG.word = function () { return Math.random().toString(36).slice(2, 8); };
  /** The end of the UTC day, a year after the given date. */
  PG.yearAfter = function (iso) {
    var d = new Date(iso);
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)).toISOString();
  };
  PG.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /** The 6-digit code an authenticator app shows for a base32 secret now (RFC 6238, SHA-1, 30 s). */
  PG.totp = async function (secret, at) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', bits = '';
    for (var i = 0; i < secret.length; i++) bits += ('00000' + alphabet.indexOf(secret[i]).toString(2)).slice(-5);
    var key = new Uint8Array(Math.floor(bits.length / 8));
    for (var k = 0; k < key.length; k++) key[k] = parseInt(bits.substr(k * 8, 8), 2);
    var counter = new DataView(new ArrayBuffer(8));
    counter.setUint32(4, Math.floor((at || Date.now()) / 30000));
    var cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    var h = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, counter.buffer));
    var o = h[h.length - 1] & 15;
    var n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    return ('000000' + (n % 1000000)).slice(-6);
  };
  /** A paid device on a brand, with its device key. */
  PG.paidWithKey = async function (brand) {
    var mac = PG.mac('ae');
    var reg = await PG.req('POST', '/dev/devices/register', { mac: mac, platform: 'lg' }, { brand: brand });
    await PG.req('POST', '/dev/licenses/' + mac + '/activate', { type: 'yearly', source: 'admin', actorId: 'playground', sourceId: 'pg-' + PG.word() }, { brand: brand });
    return { mac: mac, key: reg.json.found.device.deviceKey };
  };
  /** The token of the latest email the brand would have sent to this address (dev outbox). */
  PG.outbox = async function (to, brand) {
    var r = await PG.req('GET', '/dev/outbox?to=' + encodeURIComponent(to), undefined, { brand: brand });
    return r.json && r.json.token;
  };

  // The V4 apps' envelope: a random key inside the base64, its place and length in front (requests)
  // or at the end (replies).
  var ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
  function rand(min, max) { return min + Math.floor(Math.random() * (max - min)); }
  PG.encryptRequest = function (value) {
    var text = JSON.stringify(value), latin = '';
    for (var i = 0; i < text.length; i++) latin += String.fromCharCode(text.charCodeAt(i) & 255);
    var base64 = btoa(latin), key = '';
    for (var k = rand(20, 30); k > 0; k--) key += ALPHABET[rand(0, ALPHABET.length)];
    var position = rand(0, Math.min(base64.length, ALPHABET.length));
    return ALPHABET[position] + ALPHABET[key.length] + base64.slice(0, position) + key + base64.slice(position);
  };
  PG.decryptResponse = function (reply) {
    var data = reply.data;
    var position = ALPHABET.indexOf(data[data.length - 2]);
    var length = ALPHABET.indexOf(data[data.length - 1]);
    var body = data.slice(0, -2);
    var binary = atob(body.slice(0, position) + body.slice(position + length));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  };
  /** POST to a V4 app route in the envelope; the reply is decoded like the apps do. */
  PG.v4 = async function (appType, path, payload, headers) {
    var res = await PG.req('POST', '/api/' + appType + '/v4/' + path, { data: PG.encryptRequest(payload) }, { headers: headers });
    return { status: res.status, body: res.json && res.json.data ? PG.decryptResponse(res.json) : res.json };
  };

  // Shared setup steps
  PG.trial = async function (opts) {
    opts = opts || {};
    var mac = PG.mac(opts.first || 'ae');
    await PG.req('POST', '/dev/devices/register', { mac: mac, platform: opts.platform || 'samsung', appVersion: '1.0.0' }, { brand: opts.brand });
    return mac;
  };
  PG.paid = async function (type, extra, opts) {
    opts = opts || {};
    var mac = await PG.trial(opts);
    await PG.req('POST', '/dev/licenses/' + mac + '/activate', Object.assign({ type: type || 'lifetime', source: 'admin', sourceId: 'pg-' + PG.word() }, extra || {}), { brand: opts.brand });
    return mac;
  };
  PG.addLink = function (mac, name, url, opts) {
    return PG.req('POST', '/dev/playlists/' + mac + '/add', { name: name, source: { kind: 'link', url: url } }, opts);
  };
  PG.device = async function (mac, opts) { return (await PG.req('GET', '/dev/devices/' + mac, undefined, opts)).json; };

  // Database snapshots: row counts of the ibo and bob brand databases and the central one, taken
  // before and after a step or a run, so the page can say what was written or removed.
  // With "since" (the server time of the snapshot before), each collection also says how many rows
  // were created since then and how many older rows changed.
  PG.snapshot = async function (since) {
    var keep = PG.recorder; PG.recorder = null;
    var stopped = PG.stopped; PG.stopped = false;
    try {
      var out = { now: null, rows: {}, created: {}, changed: {} };
      var q = since ? '?since=' + encodeURIComponent(since) : '';
      var all = await Promise.all(['ibo', 'bob'].map(function (b) { return PG.req('GET', '/dev/db/summary' + q, undefined, { brand: b }); }));
      all.forEach(function (r, i) {
        if (!r.json || !r.json.collections) return;
        var put = function (prefix) { return function (c) { var k = prefix + '.' + c.name; out.rows[k] = c.rows; out.created[k] = c.created || 0; out.changed[k] = c.changed || 0; }; };
        r.json.collections.forEach(put(i === 0 ? 'ibo' : 'bob'));
        if (i === 0) { out.now = r.json.now; r.json.central.collections.forEach(put('central')); }
      });
      return out;
    } catch (e) { return null; }
    finally { PG.recorder = keep; PG.stopped = stopped; }
  };
  /**
   * What changed between two snapshots, per database.collection: rows added, removed and updated.
   * A row moved in (a trial device paying moves to devices, keeping its createdAt) counts as added.
   */
  PG.diff = function (before, after) {
    if (!before || !after) return [];
    return Object.keys(after.rows).map(function (k) {
      var delta = after.rows[k] - (before.rows[k] || 0);
      var created = after.created[k] || 0, changed = after.changed[k] || 0;
      var added = Math.max(created, delta);
      return { key: k, added: added, removed: added - delta, updated: Math.max(0, changed - (added - created)) };
    }).filter(function (c) { return c.added || c.removed || c.updated; });
  };
  function diffPills(changes) {
    if (!changes) return '';
    var head = '<div class="mt-2 flex flex-wrap items-center gap-1 text-xs"><span class="font-semibold text-slate-500 dark:text-slate-400">Database:</span>';
    if (!changes.length) return head + '<span class="hint">nothing written (reads only)</span></div>';
    return head + changes.map(function (c) {
      return '<span class="pill"><span class="mono">' + esc(c.key) + '</span>' +
        (c.added ? ' <span class="text-emerald-600 dark:text-emerald-400">+' + c.added + '</span>' : '') +
        (c.removed ? ' <span class="text-rose-600 dark:text-rose-400">−' + c.removed + '</span>' : '') +
        (c.updated ? ' <span class="text-indigo-600 dark:text-indigo-400">~' + c.updated + ' updated</span>' : '') + '</span>';
    }).join('') + '</div>';
  }

  PG.suite = function (def) { PG.suites.push(def); };
  PG.scenario = function (def) { PG.scenarios.push(def); };

  // Test cases ----------------------------------------------------------------------------------
  var results = {};   // suite id -> { state, checks: [{ group, name, pass, detail }], ms }
  var showFailedOnly = false;
  var running = false;

  function totals() {
    var t = { pass: 0, fail: 0, expected: 0 };
    PG.suites.forEach(function (s) {
      t.expected += s.expected;
      (results[s.id] ? results[s.id].checks : []).forEach(function (c) { if (c.pass) t.pass++; else t.fail++; });
    });
    return t;
  }

  function suiteState(s) {
    var r = results[s.id];
    if (!r) return { cls: '', text: s.expected + ' checks' };
    if (r.state === 'running') return { cls: 'run', text: 'running · ' + r.checks.length + '/' + s.expected };
    var fails = r.checks.filter(function (c) { return !c.pass; }).length;
    if (r.state === 'stopped') return { cls: 'warn', text: 'stopped · ' + r.checks.length + '/' + s.expected };
    return fails ? { cls: 'bad', text: fails + ' failed · ' + (r.checks.length - fails) + ' passed' }
      : { cls: 'ok', text: r.checks.length + '/' + s.expected + ' passed · ' + (r.ms / 1000).toFixed(1) + 's' };
  }

  function renderTests() {
    var box = $('tests-suites');
    if (!box) return;
    var t = totals();
    $('tests-pass').textContent = t.pass;
    $('tests-fail').textContent = t.fail;
    $('tests-total').textContent = t.expected;
    var done = t.pass + t.fail;
    $('tests-bar-pass').style.width = (100 * t.pass / t.expected) + '%';
    $('tests-bar-fail').style.width = (100 * t.fail / t.expected) + '%';
    $('tests-progress').textContent = done ? done + ' of ' + t.expected + ' run' : 'not run yet';
    $('tests-run').disabled = running;
    $('tests-stop').disabled = !running;
    paintDots();
    box.innerHTML = PG.suites.map(function (s) {
      var st = suiteState(s);
      return '<button class="suite-card" data-suite-card="' + s.id + '">' +
        '<div class="flex items-center justify-between gap-2"><span class="font-semibold">' + esc(s.title) + '</span><span class="pill ' + st.cls + '">' + esc(st.text) + '</span></div>' +
        '<div class="hint mt-1">' + esc(s.about) + '</div>' +
        '<div class="mt-2 flex flex-wrap gap-1">' + s.tasks.map(function (k) { return '<span class="pill">' + esc(k) + '</span>'; }).join('') +
        '<span class="pill mono">' + esc(s.script) + '</span></div></button>';
    }).join('');
    renderResults();
  }

  function renderResults() {
    var box = $('tests-results');
    var html = '';
    PG.suites.forEach(function (s) {
      var r = results[s.id];
      if (!r) return;
      var rows = r.checks.filter(function (c) { return !showFailedOnly || !c.pass; });
      if (!rows.length && showFailedOnly) return;
      html += '<section class="card"><div class="card-head"><h3 class="card-title">' + esc(s.title) + '</h3><span class="pill ' + suiteState(s).cls + '">' + esc(suiteState(s).text) + '</span></div><div class="card-body space-y-1">';
      var group = null;
      rows.forEach(function (c) {
        if (c.group !== group) { group = c.group; html += '<div class="step-title mt-3 first:mt-0">' + esc(group) + '</div>'; }
        html += '<div class="check-row ' + (c.pass ? 'pass' : 'fail') + '"><span class="check-mark">' + (c.pass ? '✓' : '✕') + '</span><div class="min-w-0 flex-1"><div>' + esc(c.name) + '</div>' +
          (c.pass ? '' : '<pre class="detail">' + esc(brief(c.detail)) + '</pre>') + '</div></div>';
      });
      if (r.state === 'running') html += '<div class="check-row"><span class="spinner"></span><div class="hint">running…</div></div>';
      html += '</div></section>';
    });
    box.innerHTML = html || '<p class="empty">Press <b>Run all</b>, or a suite above. Results appear here, one line per check.</p>';
  }

  async function runSuite(s) {
    var r = (results[s.id] = { state: 'running', checks: [], ms: 0 });
    var group = s.title, started = Date.now();
    var t = {
      group: function (name) { group = name; },
      check: function (name, pass, detail) { r.checks.push({ group: group, name: name, pass: !!pass, detail: detail }); renderTests(); }
    };
    renderTests();
    try { await s.run(t); r.state = 'done'; }
    catch (e) {
      if (PG.stopped) r.state = 'stopped';
      else { r.checks.push({ group: group, name: 'the suite stopped on an error', pass: false, detail: String(e && e.message || e) }); r.state = 'done'; }
    }
    r.ms = Date.now() - started;
    renderTests();
  }

  PG.runTests = async function (only) {
    if (running) return;
    running = true; PG.stopped = false;
    var list = PG.suites.filter(function (s) { return !only || s.id === only; });
    list.forEach(function (s) { delete results[s.id]; });
    $('tests-db').innerHTML = '';
    renderTests();
    var before = await PG.snapshot();
    for (var i = 0; i < list.length && !PG.stopped; i++) await runSuite(list[i]);
    running = false;
    renderTests();
    $('tests-db').innerHTML = diffPills(PG.diff(before, await PG.snapshot(before && before.now))).replace('Database:', 'This run changed the database:');
    var t = totals();
    if ($('home-last')) {
      $('home-last').textContent = t.pass + '/' + (t.pass + t.fail);
      $('home-last').className = 'stat-num ' + (t.fail ? 'text-rose-600' : 'text-emerald-600');
      $('home-last-label').textContent = 'passed in the last run · ' + new Date().toLocaleTimeString();
    }
    if (window.PGUI) window.PGUI.toast(t.fail ? 'bad' : 'ok', t.fail ? t.fail + ' check(s) failed' : 'All checks passed', t.pass + ' passed, ' + t.fail + ' failed');
  };

  // Scenarios -----------------------------------------------------------------------------------
  var current = null;   // { def, vars, steps: [{ state, expects, calls }], next }

  function resetScenario(def) {
    current = { def: def, vars: {}, next: 0, busy: false, steps: def.steps.map(function () { return { state: 'todo', expects: [], calls: [] }; }) };
    renderScenario();
  }

  PG.showScenario = function (id) {
    var def = PG.scenarios.filter(function (s) { return s.id === id; })[0] || PG.scenarios[0];
    if (!current || current.def !== def) resetScenario(def);
    else renderScenario();
  };

  function renderScenario() {
    var box = $('scenario-view');
    if (!box || !current) return;
    var def = current.def;
    var done = current.steps.filter(function (s) { return s.state === 'pass'; }).length;
    var failed = current.steps.some(function (s) { return s.state === 'fail'; });
    var status = failed ? '<span class="pill bad">failed at step ' + (current.next + 1) + '</span>'
      : done === def.steps.length ? '<span class="pill ok">passed · ' + done + ' steps</span>'
      : current.busy ? '<span class="pill run">running</span>' : '<span class="pill">' + done + ' of ' + def.steps.length + ' steps</span>';
    var html = '<div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0">' +
      '<div class="flex flex-wrap items-center gap-2"><span class="pill mono">E2E-' + esc(def.id) + '</span>' +
      def.tasks.map(function (k) { return '<span class="pill">' + esc(k) + '</span>'; }).join('') + '</div>' +
      '<h2 class="mt-2 text-xl font-semibold tracking-tight">' + esc(def.title) + '</h2>' +
      '<p class="hint mt-1 max-w-2xl text-sm">' + esc(def.story) + '</p></div>' + status + '</div>' +
      '<div class="row mt-4"><button class="btn btn-primary" id="sc-run"' + (current.busy ? ' disabled' : '') + '>Run all steps</button>' +
      '<button class="btn" id="sc-next"' + (current.busy || failed || current.next >= def.steps.length ? ' disabled' : '') + '>Next step</button>' +
      '<button class="btn" id="sc-reset"' + (current.busy ? ' disabled' : '') + '>Reset</button></div><ol class="mt-5 space-y-3">';
    def.steps.forEach(function (step, i) {
      var st = current.steps[i];
      html += '<li class="scenario-step ' + st.state + '"><div class="step-num">' + (st.state === 'pass' ? '✓' : st.state === 'fail' ? '✕' : st.state === 'run' ? '<span class="spinner"></span>' : (i + 1)) + '</div>' +
        '<div class="min-w-0 flex-1"><div class="font-medium">' + esc(step.title) + '</div>' +
        '<div class="hint mt-0.5">' + esc(step.does) + '</div>' +
        '<div class="mt-1 text-xs"><span class="font-semibold text-slate-500 dark:text-slate-400">Should:</span> ' + esc(step.expect) + '</div>';
      if (st.expects.length) {
        html += '<ul class="mt-2 space-y-1">' + st.expects.map(function (e) {
          return '<li class="check-row ' + (e.pass ? 'pass' : 'fail') + '"><span class="check-mark">' + (e.pass ? '✓' : '✕') + '</span><div class="min-w-0 flex-1">' + esc(e.name) +
            (e.pass ? '' : '<pre class="detail">' + esc(brief(e.detail)) + '</pre>') + '</div></li>';
        }).join('') + '</ul>';
      }
      if (st.state === 'pass' || st.state === 'fail') html += diffPills(st.db);
      if (st.calls.length) {
        html += '<details class="mt-2"><summary class="cursor-pointer text-xs font-medium text-indigo-600 dark:text-indigo-400">' + st.calls.length + ' request(s)</summary><div class="mt-2 space-y-1">' +
          st.calls.map(function (c) {
            return '<details class="call"><summary><span class="pill">' + esc(c.method) + '</span><span class="mono min-w-0 flex-1 truncate">' + esc((c.brand !== 'ibo' ? c.brand + ' · ' : '') + c.path) + '</span>' +
              '<span class="pill ' + (c.status < 300 ? 'ok' : c.status < 500 ? 'warn' : 'bad') + '">' + c.status + (c.json && c.json.error ? ' ' + esc(c.json.error.code) : '') + '</span></summary>' +
              '<pre class="detail">' + esc((c.body !== undefined ? 'sent ' + JSON.stringify(c.body) + '\n\n' : '') + JSON.stringify(c.json, null, 2)) + '</pre></details>';
          }).join('') + '</div></details>';
      }
      html += '</div></li>';
    });
    box.innerHTML = html + '</ol>';
    $('sc-run').addEventListener('click', function () { runScenario(true); });
    $('sc-next').addEventListener('click', function () { runScenario(false); });
    $('sc-reset').addEventListener('click', function () { resetScenario(def); });
    scenarioDots[def.id] = failed ? 'bad' : done === def.steps.length ? 'ok' : current.busy ? 'run' : '';
    paintDots();
  }
  var scenarioDots = {};
  function paintDots() {
    document.querySelectorAll('[data-view^="scenario:"] .nav-dot').forEach(function (dot) {
      dot.className = 'nav-dot ' + (scenarioDots[dot.parentNode.dataset.view.split(':')[1]] || '');
    });
    document.querySelectorAll('[data-view^="tests"] .nav-dot').forEach(function (dot) {
      var id = dot.parentNode.dataset.view.split(':')[1];
      var list = id ? PG.suites.filter(function (s) { return s.id === id; }) : PG.suites;
      var cls = list.map(suiteState).map(function (s) { return s.cls; });
      dot.className = 'nav-dot ' + (cls.indexOf('bad') >= 0 ? 'bad' : cls.indexOf('run') >= 0 ? 'run' : cls.length && cls.every(function (c) { return c === 'ok'; }) ? 'ok' : '');
    });
  }

  async function runStep() {
    var i = current.next, step = current.def.steps[i], st = current.steps[i];
    st.state = 'run'; st.expects = []; st.calls = [];
    renderScenario();
    var s = {
      vars: current.vars,
      req: PG.req,
      expect: function (name, pass, detail) { st.expects.push({ name: name, pass: !!pass, detail: detail }); },
      show: function (mac, brand) { if (window.PGUI) window.PGUI.focusMac(mac, brand); }
    };
    var before = await PG.snapshot();
    PG.recorder = st.calls;
    try { await step.run(s); }
    catch (e) { st.expects.push({ name: 'the step stopped on an error', pass: false, detail: String(e && e.message || e) }); }
    PG.recorder = null;
    st.db = PG.diff(before, await PG.snapshot(before && before.now));
    if (!st.expects.length) st.expects.push({ name: 'done', pass: true });
    st.state = st.expects.every(function (e) { return e.pass; }) ? 'pass' : 'fail';
    if (st.state === 'pass') current.next = i + 1;
    if (window.PGUI) window.PGUI.refreshInspector();
    return st.state === 'pass';
  }

  async function runScenario(all) {
    if (current.busy) return;
    if (all && current.next >= current.def.steps.length) resetScenario(current.def);
    if (all && current.steps.some(function (s) { return s.state === 'fail'; })) resetScenario(current.def);
    current.busy = true; PG.stopped = false;
    do { if (!(await runStep())) break; } while (all && current.next < current.def.steps.length);
    current.busy = false;
    renderScenario();
    var failed = current.steps.some(function (s) { return s.state === 'fail'; });
    if (window.PGUI && (failed || current.next >= current.def.steps.length)) {
      window.PGUI.toast(failed ? 'bad' : 'ok', failed ? 'Scenario ' + current.def.id + ' failed' : 'Scenario ' + current.def.id + ' passed', current.def.title);
    }
  }

  // Mounting ------------------------------------------------------------------------------------
  PG.mount = function () {
    // Each phase's section of the menu lists its own scenarios and test suites.
    document.querySelectorAll('[data-phase-scenarios]').forEach(function (box) {
      var p = +box.dataset.phaseScenarios;
      var list = PG.scenarios.filter(function (s) { return (s.phase || 3) === p; });
      box.innerHTML = list.length ? list.map(function (s) {
        return '<button class="nav-item" data-view="scenario:' + s.id + '"><span class="nav-dot"></span><span class="mono w-7 shrink-0 text-[11px] text-slate-400">' + esc(s.id) + '</span><span class="truncate">' + esc(s.nav) + '</span></button>';
      }).join('') : '';
    });
    document.querySelectorAll('[data-phase-tests]').forEach(function (box) {
      var p = +box.dataset.phaseTests;
      var list = PG.suites.filter(function (s) { return (s.phase || 3) === p; });
      box.innerHTML = list.length ? list.map(function (s) {
        return '<button class="nav-item" data-view="tests:' + s.id + '"><span class="nav-dot"></span><span class="truncate">' + esc(s.title) + '</span><span class="code">' + s.expected + '</span></button>';
      }).join('') : '';
    });
    document.querySelectorAll('[data-phase-count]').forEach(function (el) {
      var p = +el.dataset.phaseCount;
      var sc = PG.scenarios.filter(function (s) { return (s.phase || 3) === p; }).length;
      var tc = PG.suites.filter(function (s) { return (s.phase || 3) === p; }).reduce(function (n, s) { return n + s.expected; }, 0);
      el.textContent = sc + ' scenario' + (sc === 1 ? '' : 's') + ' · ' + tc + ' test cases';
    });
    var count = PG.suites.reduce(function (n, s) { return n + s.expected; }, 0);
    if ($('nav-tests-count')) $('nav-tests-count').textContent = count;
    if ($('home-checks')) $('home-checks').textContent = count;
    if ($('home-suites')) $('home-suites').textContent = PG.suites.length;
    if ($('home-scenarios')) $('home-scenarios').textContent = PG.scenarios.length;
    if ($('mode-count-scenarios')) $('mode-count-scenarios').textContent = PG.scenarios.length;
    if ($('mode-count-tests')) $('mode-count-tests').textContent = count;
    $('tests-run').addEventListener('click', function () { PG.runTests(); });
    $('tests-stop').addEventListener('click', function () { PG.stopped = true; });
    $('tests-failed').addEventListener('change', function () { showFailedOnly = $('tests-failed').checked; renderResults(); });
    $('tests-suites').addEventListener('click', function (e) {
      var b = e.target.closest('[data-suite-card]');
      if (b && !running) PG.runTests(b.dataset.suiteCard);
    });
    renderTests();
    if (window.PGUI) window.PGUI.mounted();
  };
  PG.showTests = function (only) {
    renderTests();
    if (only) { var card = document.querySelector('[data-suite-card="' + only + '"]'); if (card) card.scrollIntoView({ block: 'nearest' }); }
  };
  window.addEventListener('load', PG.mount);
})();
`;
