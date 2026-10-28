/**
 * The device playground: one page, served by the backend in development only
 * (`http://<brand>.localhost:3000/dev/playground`). Three parts: tools that call the /dev/devices,
 * /dev/playlists and /dev/licenses routes on the same host (the brand is the one in the address
 * bar); guided scenarios (playground-scenarios.ts); and the e2e test cases run from
 * the browser (playground-tests.ts), both driven by playground-runner.ts. Styled with Tailwind's
 * browser build from a CDN (dev only, so the page needs internet for its styles). The page uses no
 * backticks or template placeholders, because it lives inside this string.
 */
export const PLAYGROUND_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Device Playground</title>
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.11"></script>
<style type="text/tailwindcss">
  @layer components {
    .btn { @apply inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[.98] disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700; }
    .btn-primary { @apply border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-500 dark:border-indigo-500 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400; }
    .btn-danger { @apply border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950; }
    .btn-sm { @apply px-2 py-1 text-xs; }
    .field { @apply flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400; }
    .input { @apply w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100; }
    .check { @apply inline-flex shrink-0 items-center gap-2 text-sm text-slate-600 select-none dark:text-slate-300; }
    .check input { @apply size-4 rounded accent-indigo-600; }
    .card { @apply rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900; }
    .card-head { @apply flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800; }
    .card-title { @apply text-sm font-semibold text-slate-900 dark:text-slate-100; }
    .card-body { @apply p-4; }
    .step { @apply rounded-lg border border-slate-200 p-3 dark:border-slate-800; }
    .step-title { @apply mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400; }
    .row { @apply flex flex-wrap items-end gap-2; }
    .hint { @apply text-xs leading-relaxed text-slate-500 dark:text-slate-400; }
    .pill { @apply inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300; }
    .pill.ok { @apply bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300; }
    .pill.warn { @apply bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300; }
    .pill.bad { @apply bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300; }
    .kv { @apply grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm; }
    .kv > div:nth-child(odd) { @apply text-slate-500 dark:text-slate-400; }
    .kv code, .mono { @apply font-mono text-[12.5px] break-all; }
    .empty { @apply rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400; }
    .tab-btn { @apply inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800; }
    .tab-btn[aria-selected="true"] { @apply bg-indigo-600 text-white shadow-sm hover:bg-indigo-600 dark:bg-indigo-500; }
    .tab-btn .code { @apply rounded bg-black/5 px-1 text-[10px] font-semibold dark:bg-white/10; }
    .tab-btn[aria-selected="true"] .code { @apply bg-white/20; }
    .tab { @apply hidden space-y-3; }
    .tab.active { @apply block; }
    .pl-card { @apply cursor-pointer rounded-lg border border-slate-200 p-3 text-sm transition hover:border-indigo-300 dark:border-slate-800 dark:hover:border-indigo-700; }
    .pl-card.selected { @apply border-indigo-500 ring-2 ring-indigo-500/30; }
    .pl-line { @apply mt-1 font-mono text-xs break-all text-slate-500 dark:text-slate-400; }
    .copy { @apply ml-1 inline-flex size-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200; }
    .spinner { @apply inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent; }
    .pill.run { @apply bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300; }
    .nav-group { @apply mb-1 px-2 pt-4 text-[11px] font-semibold tracking-wider text-slate-400 uppercase first:pt-0 dark:text-slate-500; }
    .nav-item { @apply flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white; }
    .nav-item[aria-current="true"] { @apply bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300; }
    .nav-item .code { @apply ml-auto rounded bg-black/5 px-1 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400; }
    .nav-dot { @apply size-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600; }
    .nav-dot.ok { @apply bg-emerald-500; }
    .nav-dot.bad { @apply bg-rose-500; }
    .nav-dot.run { @apply animate-pulse bg-indigo-500; }
    .view-head { @apply mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800; }
    .view-title { @apply text-lg font-semibold tracking-tight text-slate-900 dark:text-white; }
    .suite-card { @apply rounded-xl border border-slate-200 bg-white p-4 text-left text-sm shadow-sm transition hover:border-indigo-300 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700; }
    .check-row { @apply flex items-start gap-2 rounded-md px-2 py-1 text-sm; }
    .check-row.fail { @apply bg-rose-50 dark:bg-rose-950/40; }
    .check-mark { @apply mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white; }
    .check-row.pass .check-mark { @apply bg-emerald-500; }
    .check-row.fail .check-mark { @apply bg-rose-500; }
    .detail { @apply mt-1 max-h-48 overflow-auto rounded bg-slate-50 p-2 font-mono text-[11px] break-all whitespace-pre-wrap text-slate-600 dark:bg-slate-950 dark:text-slate-400; }
    .scenario-step { @apply flex gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800; }
    .scenario-step.pass { @apply border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20; }
    .scenario-step.fail { @apply border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20; }
    .scenario-step.run { @apply border-indigo-300 ring-2 ring-indigo-500/20 dark:border-indigo-700; }
    .step-num { @apply flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300; }
    .scenario-step.pass .step-num { @apply bg-emerald-500 text-white; }
    .scenario-step.fail .step-num { @apply bg-rose-500 text-white; }
    .scenario-step.run .step-num { @apply bg-indigo-500 text-white; }
    .call > summary { @apply flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800; }
    .home-card { @apply flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700; }
    .kbd { @apply rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300; }
  }
  #layout.wide { grid-template-columns: minmax(0, 1fr); }
  #layout.wide #inspector { display: none; }
</style>
</head>
<body class="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
<header class="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
  <div class="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
    <button class="mr-auto flex items-center gap-3 text-left" data-view="home">
      <span class="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-sm">DP</span>
      <span>
        <span class="block text-base font-semibold leading-tight">Device Playground</span>
        <span class="hint flex items-center gap-1.5"><span id="api-dot" class="nav-dot"></span><span id="api-status">checking the API…</span></span>
      </span>
    </button>
    <div class="flex flex-wrap items-end gap-2" data-submit="refresh">
      <label class="field min-w-[13rem]">Device MAC
        <input id="mac" class="input font-mono" placeholder="aa:bb:cc:dd:ee:ff" autocomplete="off" spellcheck="false">
      </label>
      <button class="btn" id="randomMac" title="A new random MAC">Random</button>
      <button class="btn" id="fallbackMac" title="52:54:00:12:34:57, a shared placeholder MAC: treated as no MAC">Placeholder</button>
      <button class="btn" id="refresh">Look up</button>
      <span id="device-chip" class="pill mb-1.5">no device</span>
    </div>
    <div class="flex items-end gap-3">
      <label class="check mb-1.5" title="The dev routes send the captcha answer back, so you can log in without reading it"><input type="checkbox" id="reveal"> Show captcha answers</label>
      <label class="field min-w-[8rem]">Brand<select id="brand" class="input" aria-label="Brand"></select></label>
    </div>
  </div>
</header>

<div class="mx-auto flex max-w-[1680px] gap-5 px-4 py-5 sm:px-6">
  <aside class="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-60 shrink-0 self-start overflow-y-auto pr-1 lg:block" aria-label="Sections">
    <nav>
      <button class="nav-item" data-view="home"><span class="nav-dot ok"></span>Overview</button>
      <div class="nav-group">Try it</div>
      <button class="nav-item" data-view="register">Old app<span class="code">DEV-1/2/3/6</span></button>
      <button class="nav-item" data-view="v4">V4 login<span class="code">DEV-4</span></button>
      <button class="nav-item" data-view="tv">Old TV code<span class="code">DEV-4</span></button>
      <button class="nav-item" data-view="owner">Key and PIN<span class="code">DEV-5</span></button>
      <button class="nav-item" data-view="playlists">Playlists<span class="code">PL-1–8</span></button>
      <button class="nav-item" data-view="license">License<span class="code">LIC-1–3</span></button>
      <div class="nav-group">Database</div>
      <button class="nav-item" data-view="db">What is stored<span class="code">MongoDB</span></button>
      <div class="nav-group">Scenarios</div>
      <div id="nav-scenarios"></div>
      <div class="nav-group">Test cases</div>
      <div id="nav-tests"></div>
    </nav>
  </aside>

  <main id="layout" class="grid min-w-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
  <section class="card self-start xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
    <div class="border-b border-slate-100 p-2 lg:hidden dark:border-slate-800">
      <select id="view-select" class="input" aria-label="Section"></select>
    </div>
    <div class="card-body">

      <div class="tab" id="tab-home">
        <div class="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow-sm">
          <p class="text-xs font-semibold tracking-wider text-indigo-100 uppercase">Phases 1 to 3 · core features</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">Try every rule on a real database</h2>
          <p class="mt-2 max-w-2xl text-sm text-indigo-100">Brands from the host, devices and trials, V4 login, playlists, licenses and the V4 app routes, through the dev-only routes. This page is 404 in production.</p>
          <div class="mt-4 flex flex-wrap gap-2 text-xs"><span class="rounded-full bg-white/15 px-2.5 py-1">brand <b id="home-brand">…</b></span><span class="rounded-full bg-white/15 px-2.5 py-1"><b id="home-scenarios">…</b> scenarios</span><span class="rounded-full bg-white/15 px-2.5 py-1"><b id="home-checks">…</b> test cases</span></div>
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <button class="home-card" data-view="register"><span class="pill w-fit">Try it</span><span class="font-semibold">Tools</span><span class="hint">Register a TV, log in as a V4 app, add playlists, activate, extend and revoke a license.</span></button>
          <button class="home-card" data-view="scenario:D1"><span class="pill ok w-fit">Scenarios</span><span class="font-semibold">Guided stories</span><span class="hint">E2E-D1 to P3 step by step: what each step does, what should happen, and what came back.</span></button>
          <button class="home-card" data-view="tests"><span class="pill run w-fit">Test cases</span><span class="font-semibold">Run the e2e checks</span><span class="hint">The same checks as pnpm e2e:*, from the browser, with a pass or fail line for each.</span></button>
        </div>
        <div class="step">
          <div class="step-title">Before you start</div>
          <ol class="space-y-2 text-sm">
            <li class="flex flex-wrap items-center gap-2"><span class="pill">1</span> MongoDB and Redis <code class="kbd">docker compose up -d</code></li>
            <li class="flex flex-wrap items-center gap-2"><span class="pill">2</span> Brands and example devices <code class="kbd">npm run seed</code></li>
            <li class="flex flex-wrap items-center gap-2"><span class="pill">3</span> The API <code class="kbd">pnpm dev:api</code></li>
            <li class="flex flex-wrap items-center gap-2"><span class="pill">4</span> Open <code class="kbd">http://ibo.localhost:3000/dev/playground</code></li>
          </ol>
          <p class="hint mt-3">Scenarios and test cases write new devices into the <b>ibo</b> brand (and <b>bob</b> to prove isolation). The device tests also read the example devices, so run the seed once; it resets them.</p>
        </div>
      </div>

      <div class="tab" id="tab-scenario"><div id="scenario-view"></div></div>

      <div class="tab" id="tab-db">
        <div class="view-head">
          <div>
            <h2 class="view-title">What is stored in the database</h2>
            <p class="hint mt-1 max-w-2xl">The real MongoDB behind this API, read only. Each brand has its own database; provider moves live in the central one. Every tool, scenario and test case writes here: watch the counts and the device’s rows change.</p>
          </div>
          <div class="row"><label class="check"><input type="checkbox" id="db-auto" checked> Refresh after each request</label><button class="btn" id="db-refresh">Refresh</button></div>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <div class="step"><div class="step-title">Brand database <span class="pill mono normal-case tracking-normal" id="db-name">…</span></div><div id="db-brand"></div></div>
          <div class="step"><div class="step-title">Central database <span class="pill mono normal-case tracking-normal" id="db-central-name">…</span></div><div id="db-central"></div>
            <p class="hint mt-3">Also central: <code class="mono">tenants</code> (the brands and their hosts) and <code class="mono">tenantSecrets</code>; each brand database also has <code class="mono">tenantConfig</code>.</p></div>
        </div>
        <div class="step">
          <div class="step-title">Rows for the MAC <span class="pill mono normal-case tracking-normal" id="db-mac">…</span></div>
          <p class="hint mb-3">Everything this brand stores for the device in the header: its row in trialDevices or devices (never both), its licenses and playlists by deviceId, its captchas by MAC. Exactly as saved.</p>
          <div id="db-docs" class="space-y-2"></div>
        </div>
      </div>

      <div class="tab" id="tab-tests">
        <div class="view-head">
          <div>
            <h2 class="view-title">Test cases</h2>
            <p class="hint mt-1 max-w-2xl">The checks of <code class="mono">pnpm e2e:devices</code>, <code class="mono">e2e:playlists</code>, <code class="mono">e2e:licenses</code> and <code class="mono">e2e:v4</code>, run from this page against the running API. Click a suite to run only that one.</p>
          </div>
          <div class="row">
            <label class="check"><input type="checkbox" id="tests-failed"> Failed only</label>
            <button class="btn" id="tests-stop" disabled>Stop</button>
            <button class="btn btn-primary" id="tests-run">Run all</button>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="step"><div class="hint">Passed</div><div class="text-2xl font-semibold text-emerald-600 dark:text-emerald-400" id="tests-pass">0</div></div>
          <div class="step"><div class="hint">Failed</div><div class="text-2xl font-semibold text-rose-600 dark:text-rose-400" id="tests-fail">0</div></div>
          <div class="step"><div class="hint">Test cases</div><div class="text-2xl font-semibold" id="tests-total">0</div></div>
        </div>
        <div>
          <div class="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div id="tests-bar-pass" class="bg-emerald-500 transition-all" style="width:0"></div><div id="tests-bar-fail" class="bg-rose-500 transition-all" style="width:0"></div></div>
          <p class="hint mt-1" id="tests-progress">not run yet</p>
          <div id="tests-db"></div>
        </div>
        <div class="grid gap-3 md:grid-cols-2" id="tests-suites"></div>
        <div class="space-y-3" id="tests-results"></div>
      </div>

      <div class="tab" id="tab-register">
        <div class="view-head"><h2 class="view-title">Old app: register or visit</h2><span class="pill">DEV-1 · DEV-2 · DEV-3 · DEV-6</span></div>
        <p class="hint">What an old app route does on every start: find the device, or make it with a trial.</p>
        <div class="step" data-submit="register">
          <div class="row">
            <label class="field">Platform<select id="r-platform" class="input"></select></label>
            <label class="field">App version<input id="r-version" class="input" value="1.0.0"></label>
            <label class="field">API version<select id="r-api" class="input"><option>legacy</option><option>v4</option><option>v5</option></select></label>
          </div>
          <div class="row mt-2">
            <label class="field"><span>App device id <span class="font-normal">(when there is no MAC)</span></span><input id="r-appid" class="input" placeholder="optional"></label>
            <label class="field">uid<input id="r-uid" class="input" placeholder="optional"></label>
            <button class="btn btn-primary" id="register">Register / visit</button>
          </div>
        </div>
      </div>

      <div class="tab" id="tab-v4">
        <div class="view-head"><h2 class="view-title">V4 login with a captcha</h2><span class="pill">DEV-4</span></div>
        <p class="hint">A new MAC needs a solved captcha once. A different uid needs the recovery captcha, which shows the stored uid.</p>
        <div class="step">
          <div class="row">
            <label class="field">Platform<select id="v-platform" class="input"></select></label>
            <label class="field"><span>uid <span class="font-normal">(6 letters or digits)</span></span><input id="v-uid" class="input font-mono" value="QW12ER"></label>
            <label class="field">App version<input id="v-version" class="input" value="4.0.0"></label>
          </div>
        </div>
        <div class="step">
          <div class="step-title"><span class="pill">1</span> Get a captcha</div>
          <div class="row">
            <button class="btn" id="v-captcha">Get captcha</button>
            <button class="btn" id="v-uidcaptcha">Get uid recovery captcha</button>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-3 empty:hidden" id="v-captcha-box"></div>
        </div>
        <div class="step" data-submit="v-login">
          <div class="step-title"><span class="pill">2</span> Log in</div>
          <div class="row">
            <label class="field">Captcha answer<input id="v-answer" class="input font-mono" placeholder="what the picture shows"></label>
            <label class="field">Recovery answer<input id="v-uidanswer" class="input font-mono" placeholder="only after a uid mismatch"></label>
            <button class="btn btn-primary" id="v-login">Log in</button>
          </div>
        </div>
      </div>

      <div class="tab" id="tab-tv">
        <div class="view-head"><h2 class="view-title">Old TV code</h2><span class="pill">DEV-4</span></div>
        <p class="hint">Old TV apps send the code they typed once on every start. The first time it answers the open captcha; after that the same code keeps working.</p>
        <div class="step">
          <div class="step-title"><span class="pill">1</span> Get a captcha</div>
          <button class="btn" id="t-captcha">Get 2-character captcha</button>
          <div class="mt-3 flex flex-wrap items-center gap-3 empty:hidden" id="t-captcha-box"></div>
        </div>
        <div class="step" data-submit="t-send">
          <div class="step-title"><span class="pill">2</span> Send the code</div>
          <div class="row">
            <label class="field">Code<input id="t-code" class="input font-mono"></label>
            <button class="btn btn-primary" id="t-send">Send code</button>
          </div>
        </div>
      </div>

      <div class="tab" id="tab-owner">
        <div class="view-head"><h2 class="view-title">Device key and parental PIN</h2><span class="pill">DEV-5</span></div>
        <div class="step" data-submit="o-verify">
          <div class="step-title">Device key</div>
          <p class="hint mb-2">The website login is MAC + device key. Keys are not unique; they are always checked with the MAC.</p>
          <div class="row">
            <label class="field">Device key<input id="o-key" class="input font-mono" placeholder="6 digits"></label>
            <button class="btn btn-primary" id="o-verify">Log in with key</button>
            <button class="btn" id="o-change">Change key to this</button>
            <button class="btn" id="o-random">Random new key</button>
          </div>
        </div>
        <div class="step" data-submit="o-pin-on">
          <div class="step-title">Parental control</div>
          <p class="hint mb-2">A 4-digit PIN turns it on; off removes the PIN. New devices start on with 0000.</p>
          <div class="row">
            <label class="field">Parent PIN<input id="o-pin" class="input font-mono" placeholder="4 digits"></label>
            <button class="btn btn-primary" id="o-pin-on">Turn on / change PIN</button>
            <button class="btn" id="o-pin-off">Turn off</button>
          </div>
        </div>
      </div>

      <div class="tab" id="tab-license">
        <div class="view-head"><h2 class="view-title">License</h2><span class="pill">LIC-1 · LIC-2 · LIC-3</span></div>
        <div class="step" data-submit="l-activate">
          <div class="step-title">Activate a license <span class="font-normal normal-case tracking-normal">LIC-1, LIC-2</span></div>
          <p class="hint mb-2">Activating moves a trial device to devices. A year starts where the running trial or year ends; lifetime never ends. The state is worked out from the dates, never stored.</p>
          <div class="row">
            <label class="field">Type<select id="l-type" class="input"><option value="yearly">Yearly (1 credit)</option><option value="lifetime">Lifetime (2 credits)</option></select></label>
            <label class="field">Paid by<select id="l-source" class="input">
              <option>admin</option><option>reseller</option><option>code</option><option>coupon</option>
              <option>payment</option><option>store</option><option>transfer</option><option>plan</option>
            </select></label>
            <label class="field"><span>Who <span class="font-normal">(actor id)</span></span><input id="l-actor" class="input" placeholder="optional"></label>
          </div>
          <div class="row mt-2">
            <label class="field"><span>Source id <span class="font-normal">(transaction, code, …)</span></span>
              <span class="flex gap-1.5"><input id="l-source-id" class="input font-mono"><button class="btn" id="l-new-source" title="A new source id: a new payment">New</button></span>
            </label>
            <label class="field">Reseller id<input id="l-reseller" class="input" placeholder="optional"></label>
            <label class="check mb-1.5"><input type="checkbox" id="l-multi"> Multi-device order</label>
          </div>
          <div class="row mt-3">
            <button class="btn btn-primary" id="l-activate">Activate</button>
            <button class="btn btn-danger" id="l-revoke">Revoke current license</button>
          </div>
          <p class="hint mt-2">The same source id twice activates once. Use New for a second payment.</p>
        </div>
      </div>

      <div class="tab" id="tab-playlists">
        <div class="view-head"><h2 class="view-title">Playlists</h2><span class="pill">PL-1–8</span></div>
        <p class="hint">Playlists of the device with the MAC above; register it first. The list on the right shows them; click one to select it.</p>
        <div class="step" data-submit="p-add">
          <div class="step-title">Add <span class="font-normal normal-case tracking-normal">PL-1, PL-3, PL-6</span></div>
          <div class="row">
            <label class="field">Kind<select id="p-kind" class="input">
              <option value="link">Link (M3U, or Xtream when it looks like one)</option>
              <option value="xtream">Xtream as 3 fields</option>
              <option value="stalker">Stalker portal</option>
              <option value="code">Provider code</option>
            </select></label>
            <label class="field">Name<input id="p-name" class="input" value="My list"></label>
          </div>
          <div class="row mt-2" data-kind="link"><label class="field">Link<input id="p-url" class="input font-mono" value="http://line.example.com:8080/get.php?username=demo&amp;password=demo&amp;type=m3u_plus"></label></div>
          <div class="row mt-2" data-kind="xtream" hidden>
            <label class="field">Server<input id="p-server" class="input font-mono" value="http://line.example.com:8080"></label>
            <label class="field">Username<input id="p-user" class="input" value="demo"></label>
            <label class="field">Password<input id="p-pass" class="input" value="demo"></label>
          </div>
          <div class="row mt-2" data-kind="stalker" hidden>
            <label class="field">Portal link<input id="p-portal" class="input font-mono" value="http://portal.example.com/c/"></label>
            <label class="field">Portal name<input id="p-portal-name" class="input" placeholder="optional"></label>
            <label class="field">Fallback portal<input id="p-fallback" class="input font-mono" placeholder="optional"></label>
            <label class="field">Portal MAC<input id="p-portal-mac" class="input font-mono" placeholder="optional"></label>
          </div>
          <div class="row mt-2" data-kind="code" hidden><label class="field">Code (digits)<input id="p-code" class="input font-mono" value="482915"></label></div>
          <div class="row mt-2">
            <label class="field">EPG link<input id="p-epg" class="input font-mono" placeholder="optional"></label>
            <label class="field">PIN<input id="p-pin" class="input font-mono" placeholder="optional: 4 digits protects it"></label>
          </div>
          <div class="row mt-3">
            <button class="btn btn-primary" id="p-add">Add from the app</button>
            <button class="btn" id="p-add-web">Add from the website</button>
            <button class="btn" id="p-add-mac" title="QR code page, Stalker form, add by MAC: no login, limited per IP">Add without login</button>
          </div>
        </div>

        <div class="step">
          <div class="step-title">Selected playlist <span id="p-selected" class="pill normal-case tracking-normal">none: click one on the right</span></div>
          <div class="row">
            <label class="field">Acting as<select id="p-by" class="input">
              <option value="app">The TV app: no PIN needed</option>
              <option value="dashboard">The website dashboard: PIN needed when protected</option>
            </select></label>
            <label class="field">Its current PIN<input id="p-curpin" class="input font-mono" placeholder="dashboard only"></label>
          </div>
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <div class="row" data-submit="p-rename"><label class="field">New name<input id="p-newname" class="input"></label><button class="btn" id="p-rename">Rename</button></div>
            <div class="row" data-submit="p-relink"><label class="field">New link<input id="p-newurl" class="input font-mono"></label><button class="btn" id="p-relink">Change link</button></div>
          </div>
          <div class="row mt-2" data-submit="p-setpin">
            <label class="field">New PIN<input id="p-newpin" class="input font-mono" placeholder="empty removes it"></label>
            <button class="btn" id="p-setpin">Set / remove PIN</button>
            <button class="btn" id="p-unlock">Unlock on dashboard</button>
            <button class="btn btn-danger" id="p-delete">Delete</button>
          </div>
          <div class="row mt-2" data-submit="p-backup">
            <label class="field"><span>Backup hosts <span class="font-normal">PL-5</span></span><input id="p-hosts" class="input font-mono" placeholder="mirror1.example.com, mirror2.example.com:8080"></label>
            <label class="check mb-1.5"><input type="checkbox" id="p-backup-on" checked> On</label>
            <button class="btn" id="p-backup">Save backups</button>
          </div>
          <div class="row mt-2" data-submit="p-report">
            <label class="field"><span>Account status <span class="font-normal">PL-7</span></span><input id="p-status" class="input" value="Active"></label>
            <label class="field">Expires<input id="p-exp" class="input font-mono" placeholder="2027-01-01 or Unix seconds"></label>
            <button class="btn" id="p-report">Report as the app</button>
          </div>
        </div>

        <div class="step">
          <div class="step-title">Whole device <span class="font-normal normal-case tracking-normal">PL-2, PL-6</span></div>
          <label class="field">Bulk sync as the app sends it (update_playlist)<textarea id="p-sync" class="input min-h-[7.5rem] font-mono text-xs" spellcheck="false">{
  "playlists": [
    { "originId": "non_saved_1", "name": "Synced A", "url": "http://cdn.example.com/a.m3u" },
    { "originId": "non_saved_2", "name": "Synced B", "url": "http://line.example.com/get.php?username=u&amp;password=p" }
  ],
  "removeIds": []
}</textarea></label>
          <div class="row mt-2">
            <button class="btn" id="p-sync-send">Send sync</button>
            <button class="btn btn-danger" id="p-delete-mac" title="Keeps protected playlists; limited per IP">Delete all without login</button>
          </div>
        </div>

        <div class="step" data-submit="p-count">
          <div class="step-title">Provider moved host <span class="font-normal normal-case tracking-normal">PL-8</span></div>
          <div class="row">
            <label class="field">Old host<input id="p-from" class="input font-mono" value="line.example.com"></label>
            <label class="field">New host<input id="p-to" class="input font-mono" value="line2.example.com"></label>
            <label class="field max-w-[7rem]">At most<input id="p-limit" class="input" placeholder="all"></label>
            <label class="check mb-1.5"><input type="checkbox" id="p-only-mac"> Only this MAC</label>
          </div>
          <div class="row mt-2">
            <button class="btn" id="p-count">Count</button>
            <button class="btn btn-primary" id="p-move">Move</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="min-w-0 space-y-5" id="inspector">
    <div class="card">
      <div class="card-head"><h2 class="card-title">Device</h2><span id="device-collection" class="hint"></span></div>
      <div class="card-body" id="device"></div>
    </div>
    <div class="card">
      <div class="card-head"><h2 class="card-title">License</h2></div>
      <div class="card-body" id="license"></div>
    </div>
    <div class="card">
      <div class="card-head"><h2 class="card-title">Stored for this MAC</h2><button class="btn btn-sm" data-view="db">Open database view</button></div>
      <div class="card-body" id="stored"></div>
    </div>
    <div class="card">
      <div class="card-head flex-wrap">
        <h2 class="card-title">Playlists</h2>
        <select id="pv-view" class="input w-auto">
          <option value="stored">As stored</option>
          <option value="reply">As the app gets them (PL-4)</option>
          <option value="dashboard">As the dashboard lists them</option>
        </select>
      </div>
      <div class="row border-b border-slate-100 px-4 py-3 dark:border-slate-800" id="pv-reply-options" hidden>
        <label class="field">Platform<select id="pv-platform" class="input"></select></label>
        <label class="field">App version<input id="pv-version" class="input" value="1.0.0"></label>
        <label class="check mb-1.5"><input type="checkbox" id="pv-stalker" checked> Stalker on</label>
        <label class="check mb-1.5"><input type="checkbox" id="pv-pins"> With PINs (Roku, iOS)</label>
      </div>
      <div class="card-body space-y-2" id="playlists"></div>
    </div>
    <div class="card">
      <div class="card-head">
        <h2 class="card-title">Requests <span id="log-count" class="pill ml-1">0</span></h2>
        <button class="btn btn-sm" id="clear">Clear</button>
      </div>
      <div class="card-body max-h-[60vh] space-y-2 overflow-auto" id="log"></div>
    </div>
  </section>
  </main>
</div>

<div id="toasts" class="pointer-events-none fixed right-4 bottom-4 z-30 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"></div>

<script>
(function () {
  var PLATFORMS = ['samsung','lg','android','android_tv','ios','tvos','macos','windows','linux','roku','vidaa','titanos','zeasn','vegaos','unknown'];
  var $ = function (id) { return document.getElementById(id); };
  var state = { device: null, v4Token: null, uidToken: null };
  var EMPTY_LOG = '<p class="empty">Requests and answers appear here.</p>';

  function store(key, value) { try { localStorage.setItem('playground.' + key, value); } catch (e) {} }
  function stored(key) { try { return localStorage.getItem('playground.' + key); } catch (e) { return null; } }

  ['r-platform', 'v-platform', 'pv-platform'].forEach(function (id) {
    PLATFORMS.forEach(function (p) { var o = document.createElement('option'); o.textContent = p; $(id).appendChild(o); });
  });
  $('v-platform').value = 'lg';
  $('log').innerHTML = EMPTY_LOG;

  $('mac').value = stored('mac') || randomMac();
  $('mac').addEventListener('change', function () { remember(); lookUp(); });

  function remember() { store('mac', $('mac').value); }
  function randomMac() {
    var b = [];
    for (var i = 0; i < 6; i++) b.push(('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2));
    b[0] = 'aa';
    return b.join(':');
  }
  function orNull(v) { v = v.trim(); return v === '' ? null : v; }
  function mac() { return orNull($('mac').value); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // Toasts replace alerts: what happened, in words, without blocking the page.
  var TOAST = { ok: 'border-emerald-300 dark:border-emerald-800', warn: 'border-amber-300 dark:border-amber-800', bad: 'border-rose-300 dark:border-rose-800' };
  function toast(kind, title, detail) {
    var t = document.createElement('div');
    t.className = 'pointer-events-auto rounded-lg border-l-4 bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-slate-200 transition dark:bg-slate-900 dark:ring-slate-800 ' + TOAST[kind];
    t.innerHTML = '<div class="font-medium">' + esc(title) + '</div>' + (detail ? '<div class="mono mt-0.5 text-slate-500 dark:text-slate-400">' + esc(detail) + '</div>' : '');
    $('toasts').appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 300); }, kind === 'ok' ? 2500 : 5000);
  }
  function warn(message) { toast('warn', message); }

  // The button that started a request shows a spinner until the answer is in.
  var pressed = null;
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button'); if (b) pressed = b; }, true);
  function busy(button, on) {
    if (!button) return;
    if (on) { button.disabled = true; button.dataset.label = button.innerHTML; button.innerHTML = '<span class="spinner"></span>' + button.innerHTML; }
    else if (button.dataset.label !== undefined) { button.disabled = false; button.innerHTML = button.dataset.label; delete button.dataset.label; }
  }

  // Enter in a field presses the main button of its form.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    var box = e.target.closest('[data-submit]');
    if (box) { e.preventDefault(); $(box.dataset.submit).click(); }
  });

  // Copy buttons
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]');
    if (!b) return;
    navigator.clipboard.writeText(b.dataset.copy).then(function () { toast('ok', 'Copied', b.dataset.copy); });
  });
  function copyable(value) {
    return '<code>' + esc(value) + '</code><button class="copy" title="Copy" data-copy="' + esc(value) + '">⧉</button>';
  }

  // Views: "register", "scenario:D1", "tests", "tests:devices"… remembered between visits. Overview
  // and test cases take the whole width; tools and scenarios show the device panel beside them.
  var WIDE = { home: true, tests: true };
  function openView(view) {
    var name = view.split(':')[0], arg = view.split(':')[1];
    if (!$('tab-' + name)) { view = 'home'; name = 'home'; arg = undefined; }
    document.querySelectorAll('.nav-item[data-view]').forEach(function (b) { b.setAttribute('aria-current', b.dataset.view === view ? 'true' : 'false'); });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.id === 'tab-' + name); });
    $('layout').classList.toggle('wide', !!WIDE[name]);
    if ($('view-select').querySelector('option[value="' + view + '"]')) $('view-select').value = view;
    if (name === 'scenario' && window.PG) window.PG.showScenario(arg);
    if (name === 'tests' && window.PG) window.PG.showTests(arg);
    if (name === 'db') refreshDb();
    if (store.view !== view) window.scrollTo({ top: 0 });
    store.view = view;
    store('view', view);
  }
  function openTab(name) { openView(name); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-view]');
    if (b && !b.matches('option')) openView(b.dataset.view);
  });
  $('view-select').addEventListener('change', function () { openView($('view-select').value); });
  function fillViewSelect() {
    $('view-select').innerHTML = Array.prototype.map.call(document.querySelectorAll('aside .nav-item[data-view]'), function (b) {
      return '<option value="' + esc(b.dataset.view) + '">' + esc(b.textContent.trim()) + '</option>';
    }).join('');
  }

  // Brands
  fetch('/dev/brands').then(function (r) { return r.json(); }).then(function (data) {
    data.brands.forEach(function (slug) {
      var o = document.createElement('option'); o.textContent = slug; $('brand').appendChild(o);
    });
    $('brand').value = data.current;
    $('home-brand').textContent = data.current;
    document.title = 'Playground · ' + data.current;
  });
  $('brand').addEventListener('change', function () {
    var port = location.port ? ':' + location.port : '';
    location.href = location.protocol + '//' + $('brand').value + '.localhost' + port + '/dev/playground';
  });

  // Requests
  function call(method, path, body, base) {
    base = base || '/dev/devices';
    var button = pressed; pressed = null;
    busy(button, true);
    var opts = { method: method, headers: {} };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(base + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        log(method, base + path, body, res.status, json);
        setTimeout(function () { window.dispatchEvent(new Event('pg:request')); }, 0);
        if (json && json.error) toast(res.status < 500 ? 'warn' : 'bad', json.error.message || 'Refused', json.error.code);
        else if (res.status < 300 && !(json && json.created === false)) toast('ok', (button && button.dataset.label ? button.textContent.trim() : method + ' ' + path), res.status + ' ok');
        return { status: res.status, json: json };
      });
    }, function (e) {
      toast('bad', 'The API did not answer', String(e && e.message || e));
      return { status: 0, json: {} };
    }).finally(function () { busy(button, false); });
  }

  var logCount = 0;
  function log(method, path, body, status, json) {
    var box = $('log');
    if (box.querySelector('.empty')) box.innerHTML = '';
    box.querySelectorAll('details[open]').forEach(function (d) { d.open = false; });
    var cls = status < 300 ? 'ok' : status < 500 ? 'warn' : 'bad';
    var e = document.createElement('details'); e.open = true;
    e.className = 'group rounded-lg border border-slate-200 dark:border-slate-800';
    var label = json && json.error ? json.error.code : 'ok';
    e.innerHTML = '<summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs">' +
      '<span class="pill">' + esc(method) + '</span><span class="mono min-w-0 flex-1 truncate">' + esc(path) + '</span>' +
      '<span class="pill ' + cls + '">' + status + ' ' + esc(label) + '</span><span class="text-slate-400">' + new Date().toLocaleTimeString() + '</span></summary>';
    var pre = document.createElement('pre');
    pre.className = 'mx-3 mb-3 max-h-72 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs whitespace-pre-wrap break-all dark:bg-slate-950';
    pre.textContent = (body !== undefined ? 'sent ' + JSON.stringify(body) + '\n\n' : '') + JSON.stringify(shorten(json), null, 2);
    e.appendChild(pre);
    box.insertBefore(e, box.firstChild);
    $('log-count').textContent = String(++logCount);
  }
  function shorten(json) {
    if (json && typeof json.imageUrl === 'string') return Object.assign({}, json, { imageUrl: '(picture shown in the form)' });
    return json;
  }
  $('clear').addEventListener('click', function () { $('log').innerHTML = EMPTY_LOG; logCount = 0; $('log-count').textContent = '0'; });

  // Device card
  function lookUp() {
    refreshStored();
    if (!mac()) { show(null); return Promise.resolve(); }
    return fetch('/dev/devices/' + encodeURIComponent(mac())).then(function (r) { return r.json(); }).then(function (json) {
      show(json && json.device ? json : null);
    }, function () { unreachable('device'); });
  }
  function chip(text, cls) { var c = $('device-chip'); c.className = 'pill mb-1.5 ' + (cls || ''); c.textContent = text; }
  function show(found) {
    state.device = found;
    var box = $('device');
    if (!found) {
      chip('no device');
      $('device-collection').textContent = '';
      box.innerHTML = '<div class="empty"><p>No device on this MAC yet.</p>' +
        (mac() ? '<button class="btn btn-primary mt-3" id="quick-register">Register it as an old app</button>' : '') + '</div>';
      if ($('quick-register')) $('quick-register').addEventListener('click', function () { openTab('register'); $('register').click(); });
      return;
    }
    var d = found.device;
    var trialRunning = !found.paid && new Date(d.trialEndsAt) > new Date();
    var status = found.paid ? '<span class="pill ok">paid</span>'
      : trialRunning ? '<span class="pill ok">trial</span>' : '<span class="pill bad">trial ended</span>';
    chip(found.paid ? 'paid' : trialRunning ? 'trial' : 'trial ended', found.paid || trialRunning ? 'ok' : 'bad');
    $('device-collection').textContent = found.paid ? 'in devices' : 'in trialDevices';
    var rows = [
      ['Status', status],
      ['Id', copyable(d.id)],
      ['MAC', copyable(d.macAddress)],
      ['Platform', esc(d.platform) + ' <span class="hint">· API ' + esc(d.apiVersion) + ' · app ' + esc(d.appVersion || '-') + '</span>'],
      ['Device key', copyable(d.deviceKey)],
      ['Parental control', d.parentPin === null ? '<span class="pill">off</span>' : '<span class="pill ok">on</span> PIN <code>' + esc(d.parentPin) + '</code>'],
      ['uid', d.uid ? copyable(d.uid) : '<span class="hint">-</span>'],
      ['App device id', d.appDeviceId ? copyable(d.appDeviceId) : '<span class="hint">-</span>']
    ];
    if (!found.paid) {
      rows.push(['Trial ends', esc(when(d.trialEndsAt))]);
      rows.push(['Playlists', String(d.playlistCount)]);
    } else {
      rows.push(['Activated', esc(when(d.activatedAt))]);
      if (d.switch) {
        rows.push(['MAC switch', '<code>' + esc(d.switch.from) + '</code> → <code>' + esc(d.switch.to) + '</code><div class="hint">' +
          esc(when(d.switch.at)) + ' · ' + d.switch.count + ' so far · first MAC <code>' + esc(d.switch.originMac || '-') + '</code></div>']);
      }
      if (d.recovery && (d.recovery.code || d.recovery.recoveredFrom)) {
        rows.push(['Recovery', (d.recovery.code ? copyable(d.recovery.code) + '<div class="hint">until ' + esc(when(d.recovery.expiresAt)) + '</div>' : '') +
          (d.recovery.recoveredFrom ? '<div class="hint">recovered from <code>' + esc(d.recovery.recoveredFrom) + '</code> · ' + esc(when(d.recovery.recoveredAt)) + '</div>' : '')]);
      }
    }
    rows.push(['Last seen', esc(new Date(d.lastSeenAt).toLocaleString())]);
    box.innerHTML = '<div class="kv">' + rows.map(function (r) { return '<div>' + r[0] + '</div><div>' + r[1] + '</div>'; }).join('') + '</div>';
  }
  function unreachable(id) {
    $(id).innerHTML = '<p class="empty">The API is not reachable (restarting?). Press Look up to try again.</p>';
  }
  function deviceId() {
    if (!state.device) { warn('Register a device for this MAC first.'); return null; }
    return state.device.device.id;
  }
  function reveal() { return $('reveal').checked; }
  function showCaptcha(boxId, url, answer) {
    var img = document.createElement('img'); img.src = url; img.alt = 'captcha';
    img.className = 'h-16 rounded-md border border-slate-200 bg-black dark:border-slate-700';
    $(boxId).innerHTML = ''; $(boxId).appendChild(img);
    if (answer) { var a = document.createElement('span'); a.className = 'pill ok'; a.textContent = 'answer: ' + answer; $(boxId).appendChild(a); }
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
      refreshPlaylists();
      refreshLicense();
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
    }, '/dev/licenses').then(function (r) {
      // The same source id activates once: a second call answers with the license it made the
      // first time (even revoked, even if another type was asked) and changes nothing.
      if (r.json && r.json.created === false) {
        toast('warn', 'Nothing activated: this source id was already used',
          'It returned the license it made before (' + r.json.license.type + (r.json.license.revoked ? ', revoked' : '') + '). Press New for a new payment.');
      }
      if (r.json && r.json.created === true) newSourceId();
      both();
    });
  });
  $('l-revoke').addEventListener('click', function () {
    if (!confirm('Revoke the current license of ' + mac() + '?')) return;
    call('POST', macPath() + '/revoke', undefined, '/dev/licenses').then(both);
  });

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
      if (st && st.error) { box.innerHTML = '<p class="empty">No device on this MAC yet.</p>'; return; }
      var html = '<div class="mb-3 flex items-center gap-3 rounded-lg p-3 ' + (st.active ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-rose-50 dark:bg-rose-950/40') + '">' +
        '<span class="pill ' + STATE_PILL[st.state] + ' text-sm">' + esc(st.state) + '</span>' +
        '<div class="text-sm"><div class="font-medium">' + (st.active ? 'Can play' : 'Cannot play') + '</div>' +
        '<div class="hint">' + (st.endsAt ? 'ends ' + esc(when(st.endsAt)) : 'never ends') + '</div></div></div>';
      if (st.license) html += '<div class="kv"><div>Current license</div><div>' + copyable(st.license.id) + '</div></div>';
      if (Array.isArray(hist) && hist.length) {
        html += '<h3 class="step-title mt-4">History, oldest first</h3><ol class="space-y-2">' + hist.map(function (e) {
          var l = e.license;
          return '<li class="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"><div class="flex flex-wrap items-center gap-1.5">' +
            '<span class="font-semibold capitalize">' + esc(l.type) + '</span>' +
            '<span class="pill ' + STATE_PILL[e.state] + '">' + esc(e.state) + '</span>' +
            (e.current ? '<span class="pill">current</span>' : '') +
            (l.multiActivate ? '<span class="pill warn">multi-device</span>' : '') + '</div>' +
            '<div class="hint mt-1">by ' + esc(l.activatedBy.source) + (l.activatedBy.actorId ? ' (' + esc(l.activatedBy.actorId) + ')' : '') +
            ' · ' + esc(when(l.createdAt)) + ' · ' + l.creditCost + ' credit' + (l.creditCost > 1 ? 's' : '') + '</div>' +
            '<div class="hint">ends ' + esc(when(l.expiresAt)) + (l.sourceId ? ' · source <span class="mono">' + esc(l.sourceId) + '</span>' : '') + '</div>' +
            (l.revoked ? '<div class="hint text-rose-600 dark:text-rose-400">revoked ' + esc(when(l.revokedAt)) + '</div>' : '') + '</li>';
        }).join('') + '</ol>';
      }
      box.innerHTML = html;
    }, function () { unreachable('license'); });
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

  function select(p) {
    pl.selected = p ? p.id : null;
    $('p-selected').textContent = p ? p.name : 'none: click one on the right';
    $('p-selected').className = 'pill normal-case tracking-normal' + (p ? ' ok' : '');
  }
  function selected() {
    if (!pl.selected) { warn('Click a playlist in the list on the right first.'); return null; }
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
    plCall('POST', macPath() + '/' + id + '/delete', acting()).then(function () { select(null); both(); });
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
    try { body = JSON.parse($('p-sync').value); } catch (e) { toast('bad', 'The sync is not valid JSON', e.message); return; }
    plCall('POST', macPath() + '/sync', body).then(both);
  });
  $('p-delete-mac').addEventListener('click', function () {
    if (!confirm('Delete every unprotected playlist of ' + mac() + '?')) return;
    plCall('POST', macPath() + '/by-mac/delete').then(both);
  });
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
        box.innerHTML = '<p class="empty">' + esc(json.error.code === 'devices.not_found' ? 'No device on this MAC yet.' : json.error.message) + '</p>';
        return;
      }
      var items = Array.isArray(json) ? json : json.playlists;
      pl.items = items;
      if (pl.selected && !items.some(function (p) { return p.id === pl.selected; })) select(null);
      if (!items.length) { box.innerHTML = '<p class="empty">No playlists. Add one in the Playlists tab.</p>'; return; }
      box.innerHTML = '';
      if (!Array.isArray(json)) {
        var own = document.createElement('p'); own.className = 'hint';
        own.innerHTML = 'hasOwnPlaylist: <b>' + json.hasOwnPlaylist + '</b>';
        box.appendChild(own);
      }
      items.forEach(function (p) { box.appendChild(card(p)); });
    }, function () { unreachable('playlists'); });
  }
  function card(p) {
    var el = document.createElement('div');
    el.className = 'pl-card' + (p.id && p.id === pl.selected ? ' selected' : '');
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
    el.innerHTML = '<div class="flex flex-wrap items-center gap-1.5"><span class="font-semibold">' + esc(p.name) + '</span>' + pills + '</div>' +
      lines.map(function (l) { return '<div class="pl-line">' + esc(l) + '</div>'; }).join('');
    if (p.id) {
      el.addEventListener('click', function () {
        select(p);
        $('p-newname').value = p.name;
        if (p.url) $('p-newurl').value = p.url;
        if (p.backup) { $('p-hosts').value = p.backup.hosts.join(', '); $('p-backup-on').checked = p.backup.enabled; }
        document.querySelectorAll('#playlists .pl-card').forEach(function (c) { c.classList.remove('selected'); });
        el.classList.add('selected');
        openTab('playlists');
      });
    }
    return el;
  }
  $('mac').addEventListener('change', function () { select(null); refreshPlaylists(); refreshLicense(); });
  ['randomMac', 'fallbackMac', 'refresh'].forEach(function (id) { $(id).addEventListener('click', function () { select(null); refreshPlaylists(); refreshLicense(); }); });

  // Database: counts per collection and the rows stored for the MAC in the header
  var HOLDS = {
    trialDevices: 'devices that never paid, trial running or ended',
    devices: 'paid at least once; never deleted',
    licenses: 'one row per license, kept as history',
    playlists: 'every kind in one collection, by deviceId',
    captchas: 'V4 and uid recovery; solved ones are kept',
    domainMigrations: 'provider host moves, for every brand'
  };
  function countTable(rows) {
    return '<table class="w-full text-sm"><thead><tr class="text-left text-xs text-slate-500 dark:text-slate-400"><th class="py-1 font-medium">Collection</th><th class="py-1 pl-3 text-right font-medium">Rows</th><th class="py-1 pl-3 text-right font-medium" title="from npm run seed">Seed</th><th class="py-1 pl-3 text-right font-medium" title="written by the playground and the tests">Added</th></tr></thead><tbody>' +
      rows.map(function (c) {
        return '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-1.5"><code class="mono">' + esc(c.name) + '</code><div class="hint">' + esc(HOLDS[c.name] || '') + '</div>' +
          (c.byStatus ? '<div class="mt-1 flex flex-wrap gap-1">' + Object.keys(c.byStatus).map(function (k) { return '<span class="pill">' + esc(k) + ' ' + c.byStatus[k] + '</span>'; }).join('') + '</div>' : '') +
          '</td><td class="py-1.5 pl-3 text-right font-semibold tabular-nums">' + c.rows + '</td><td class="py-1.5 pl-3 text-right tabular-nums text-slate-500">' + c.examples + '</td><td class="py-1.5 pl-3 text-right tabular-nums text-slate-500">' + (c.rows - c.examples) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function docsFor(json) {
    var names = ['trialDevices', 'devices', 'licenses', 'playlists', 'captchas'];
    var total = names.reduce(function (n, k) { return n + (json[k] || []).length; }, 0);
    if (!total) return '<p class="empty">Nothing stored for this MAC in this brand yet.</p>';
    return names.map(function (k) {
      var list = json[k] || [];
      if (!list.length) return '';
      return '<details class="rounded-lg border border-slate-200 dark:border-slate-800"' + (list.length < 4 ? ' open' : '') + '><summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm"><code class="mono font-semibold">' + esc(k) + '</code><span class="pill">' + list.length + ' row' + (list.length > 1 ? 's' : '') + '</span><span class="hint">' + esc(HOLDS[k]) + '</span></summary>' +
        list.map(function (d) { return '<pre class="detail mx-3 mb-3">' + esc(JSON.stringify(d, null, 2)) + '</pre>'; }).join('') + '</details>';
    }).join('');
  }
  function refreshStored() {
    var box = $('stored');
    if (!mac()) { box.innerHTML = '<p class="empty">Type a MAC first.</p>'; return; }
    fetch('/dev/db/mac/' + encodeURIComponent(mac())).then(function (r) { return r.json(); }).then(function (json) {
      if (json.error || json.statusCode) { box.innerHTML = '<p class="empty">Not a MAC address.</p>'; return; }
      var names = ['trialDevices', 'devices', 'licenses', 'playlists', 'captchas'];
      box.innerHTML = '<div class="flex flex-wrap gap-1.5">' + names.map(function (k) {
        var n = (json[k] || []).length;
        return '<span class="pill' + (n ? ' ok' : '') + '"><span class="mono">' + k + '</span> ' + n + '</span>';
      }).join('') + '</div><p class="hint mt-2">Rows in database <b>' + esc($('brand').value || '') + '</b> for this MAC.</p>';
      if ($('tab-db').classList.contains('active')) { $('db-mac').textContent = mac(); $('db-docs').innerHTML = docsFor(json); }
    }, function () { unreachable('stored'); });
  }
  function refreshDb() {
    fetch('/dev/db/summary').then(function (r) { return r.json(); }).then(function (s) {
      $('db-name').textContent = s.database;
      $('db-central-name').textContent = s.central.database;
      $('db-brand').innerHTML = countTable(s.collections);
      $('db-central').innerHTML = countTable(s.central.collections);
    }, function () { unreachable('db-brand'); });
    $('db-mac').textContent = mac() || '-';
    if (!mac()) $('db-docs').innerHTML = '<p class="empty">Type a MAC first.</p>';
    refreshStored();
  }
  $('db-refresh').addEventListener('click', refreshDb);
  window.addEventListener('pg:request', function () {
    if ($('tab-db').classList.contains('active') && $('db-auto').checked) refreshDb();
  });

  // The API status in the header
  function ping() {
    fetch('/health').then(function (r) { return r.ok; }, function () { return false; }).then(function (up) {
      $('api-dot').className = 'nav-dot ' + (up ? 'ok' : 'bad');
      $('api-status').textContent = up ? 'API up · ' + location.host : 'API not reachable';
    });
  }
  ping();
  setInterval(ping, 15000);

  // What the scenario and test runner uses from this page
  window.PGUI = {
    toast: toast,
    focusMac: function (next, brand) {
      if (brand && brand !== $('brand').value) return;
      $('mac').value = next; remember(); select(null);
      lookUp(); refreshPlaylists(); refreshLicense();
    },
    refreshInspector: function () { lookUp(); refreshPlaylists(); refreshLicense(); },
    mounted: function () { fillViewSelect(); openView(stored('view') || 'home'); }
  };
  // Without the runner (an older API), the tools still work.
  window.addEventListener('load', function () { if (!window.PG) window.PGUI.mounted(); });

  lookUp();
  refreshPlaylists();
  refreshLicense();
})();
</script>
<script src="/dev/playground/runner.js"></script>
<script src="/dev/playground/tests.js"></script>
<script src="/dev/playground/scenarios.js"></script>
</body>
</html>
`;
