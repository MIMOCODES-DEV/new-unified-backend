/**
 * The device playground: one page, served by the backend in development only
 * (`http://<brand>.localhost:3000/dev/playground`). Three parts: tools that call the /dev/devices,
 * /dev/playlists, /dev/licenses and /dev/domain-moves routes on the same host (the brand is the one
 * in the address bar); guided scenarios (playground-scenarios.ts); and the e2e test cases run from
 * the browser (playground-tests.ts), both driven by playground-runner.ts. Styled with Tailwind's
 * browser build from a CDN (dev only, so the page needs internet for its styles). The page uses no
 * backticks or template placeholders, because it lives inside this string.
 */
export const PLAYGROUND_HTML = String.raw`<!doctype html>
<html lang="en">
<script>try { if (localStorage.getItem('playground.theme') === 'dark') document.documentElement.classList.add('dark'); } catch (e) {}</script>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Device Playground</title>
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.11"></script>
<style type="text/tailwindcss">
  @custom-variant dark (&:where(.dark, .dark *));
  @layer components {
    .mode-tabs { @apply flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800; }
    .mode-tab { @apply inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white; }
    .mode-tab[aria-current="true"] { @apply bg-white text-indigo-700 shadow-sm dark:bg-slate-950 dark:text-indigo-300; }
    .mode-count { @apply rounded-full bg-black/5 px-1.5 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400; }
    .nav-title { @apply px-2 pb-2 text-sm font-semibold text-slate-900 dark:text-white; }
    .schema-box { @apply rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100; }
    .schema-arrow { @apply text-xs text-slate-500 dark:text-slate-400; }
    .schema-card { @apply overflow-hidden rounded-xl border-2 border-teal-400/70 bg-white shadow-sm dark:border-teal-500/60 dark:bg-slate-900; }
    .schema-card.central { @apply border-sky-400/70 dark:border-sky-500/60; }
    .schema-head { @apply flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800; }
    .schema-where { @apply rounded-full border border-teal-500 px-2.5 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300; }
    .schema-where.central { @apply border-sky-500 text-sky-700 dark:text-sky-300; }
    .schema-table { @apply w-full border-collapse text-sm; }
    .schema-table th { @apply border-b border-slate-200 bg-slate-50 px-4 py-2 text-left text-[11px] font-semibold tracking-wider whitespace-nowrap text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400; }
    .schema-table td { @apply border-b border-slate-100 px-4 py-2 align-top dark:border-slate-800; }
    .schema-table tr:last-child td { @apply border-b-0; }
    .schema-table tbody tr:hover td { @apply bg-slate-50/70 dark:bg-slate-800/40; }
    .f-name { @apply font-mono font-bold whitespace-nowrap text-slate-900 dark:text-slate-100; }
    .f-opt { @apply ml-1 rounded bg-slate-100 px-1 font-sans text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400; }
    .f-type { @apply font-mono text-xs whitespace-nowrap; }
    .f-rule { @apply min-w-[14rem] text-slate-700 dark:text-slate-300; }
    .f-example { @apply max-w-[16rem] truncate font-mono text-xs text-indigo-700 dark:text-indigo-300; }
    .f-from { @apply min-w-[10rem] font-mono text-xs text-orange-600 dark:text-orange-400; }
    .t-string { @apply text-emerald-600 dark:text-emerald-400; } .t-date { @apply text-violet-600 dark:text-violet-400; }
    .t-number { @apply text-blue-600 dark:text-blue-400; } .t-boolean { @apply text-pink-600 dark:text-pink-400; }
    .t-object { @apply text-amber-600 dark:text-amber-400; } .t-array { @apply text-cyan-600 dark:text-cyan-400; }
    .t-null { @apply text-slate-400 dark:text-slate-500; }
    .schema-foot { @apply flex flex-wrap items-center gap-1.5 border-t border-slate-200 bg-slate-50/60 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/30; }
    .nav-phase { @apply mb-1 rounded-xl; }
    .nav-phase > summary { @apply flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase select-none hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100; }
    .nav-phase > summary::-webkit-details-marker { display: none; }
    .nav-phase > summary::after { content: '▾'; @apply ml-auto text-slate-400 transition; }
    .nav-phase:not([open]) > summary::after { transform: rotate(-90deg); }
    .phase-num { @apply inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white shadow-sm; }
    .phase-num.p1 { @apply bg-sky-500; } .phase-num.p2 { @apply bg-teal-500; } .phase-num.p3 { @apply bg-indigo-500; }
    .phase-num.p4 { @apply bg-amber-500; } .phase-num.p5 { @apply bg-rose-500; } .phase-num.p6 { @apply bg-violet-500; } .phase-num.p7 { @apply bg-teal-600; }
    .nav-sub:empty { @apply hidden; }
    .nav-label { @apply px-2 pt-2 pb-0.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500; }
    .nav-ico { @apply inline-flex size-4 items-center justify-center text-[11px] text-indigo-500; }
    .phase-card { @apply relative flex flex-col gap-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900; }
    .phase-card .bar { @apply absolute inset-x-0 top-0 h-1; }
    .stat { @apply rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900; }
    .stat-num { @apply text-3xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-white; }
    .stat-label { @apply text-xs font-medium text-slate-500 dark:text-slate-400; }
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
    <button class="flex items-center gap-3 text-left" data-view="home">
      <span class="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-sm">DP</span>
      <span>
        <span class="block text-base font-semibold leading-tight">Device Playground</span>
        <span class="hint flex items-center gap-1.5"><span id="api-dot" class="nav-dot"></span><span id="api-status">checking the API…</span></span>
      </span>
    </button>
    <nav class="mode-tabs mr-auto" aria-label="Sections">
      <button class="mode-tab" data-mode="overview">Overview</button>
      <button class="mode-tab" data-mode="tools">Tools</button>
      <button class="mode-tab" data-mode="scenarios">Scenarios <span class="mode-count" id="mode-count-scenarios"></span></button>
      <button class="mode-tab" data-mode="tests">Test cases <span class="mode-count" id="mode-count-tests"></span></button>
      <button class="mode-tab" data-mode="database">Database</button>
      <button class="mode-tab" data-mode="schema">Schema</button>
    </nav>
    <div class="flex items-end gap-2">
      <label class="field min-w-[8rem]">Brand<select id="brand" class="input" aria-label="Brand"></select></label>
      <button class="btn mb-0.5" id="theme" title="Light or dark" aria-label="Light or dark">◐</button>
    </div>
  </div>
</header>

<div class="mx-auto flex max-w-[1680px] gap-5 px-4 py-5 sm:px-6">
  <aside class="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-60 shrink-0 self-start overflow-y-auto pr-1 lg:block" aria-label="Sections">
    <nav>
      <div data-mode-nav="tools">
        <div class="nav-title">Tools</div>
      <details class="nav-phase" open>
        <summary><span class="phase-num p1">1</span>Foundation</summary>
        <button class="nav-item" data-view="brand">Brand and routing<span class="code">F-4 · F-5</span></button>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p3">3</span>Core features</summary>
        <button class="nav-item" data-view="register">Old app<span class="code">DEV-1/2/3/6</span></button>
        <button class="nav-item" data-view="v4">V4 login<span class="code">DEV-4</span></button>
        <button class="nav-item" data-view="tv">Old TV code<span class="code">DEV-4</span></button>
        <button class="nav-item" data-view="owner">Key and PIN<span class="code">DEV-5</span></button>
        <button class="nav-item" data-view="playlists">Playlists<span class="code">PL-1–8</span></button>
        <button class="nav-item" data-view="license">License<span class="code">LIC-1–3</span></button>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p4">4</span>Moves and cleanup</summary>
        <button class="nav-item" data-view="license" data-scroll="sec-switch">Switch, recovery, cleanup<span class="code">DEV-7 · REC</span></button>
        <button class="nav-item" data-view="moves">Provider moves<span class="code">DOM</span></button>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p5">5</span>Accounts and staff</summary>
        <button class="nav-item" data-view="customer">Customer<span class="code">CUS-1–4</span></button>
        <button class="nav-item" data-view="staff">Staff and roles<span class="code">STF · PRM</span></button>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p6">6</span>Website API</summary>
        <button class="nav-item" data-view="site">Website (device)<span class="code">SITE</span></button>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p7">7</span>Store</summary>
        <button class="nav-item" data-view="store">Store routes<span class="code">STORE</span></button>
      </details>
      </div>
      <div data-mode-nav="scenarios">
        <div class="nav-title">Scenarios</div>
      <details class="nav-phase" open>
        <summary><span class="phase-num p1">1</span>Foundation</summary>
        <div data-phase-scenarios="1"></div>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p2">2</span>Database</summary>
        <div data-phase-scenarios="2"></div>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p3">3</span>Core features</summary>
        <div data-phase-scenarios="3"></div>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p4">4</span>Moves and cleanup</summary>
        <div data-phase-scenarios="4"></div>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p5">5</span>Accounts and staff</summary>
        <div data-phase-scenarios="5"></div>
      </details>
      </div>
      <div data-mode-nav="tests">
        <div class="nav-title">Test cases</div>
        <button class="nav-item" data-view="tests"><span class="nav-ico">✓</span>All test cases<span class="code" id="nav-tests-count"></span></button>
      <details class="nav-phase" open>
        <summary><span class="phase-num p1">1</span>Foundation</summary>
        <div data-phase-tests="1"></div>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p2">2</span>Database</summary>
        <div data-phase-tests="2"></div>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p3">3</span>Core features</summary>
        <div data-phase-tests="3"></div>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p4">4</span>Moves and cleanup</summary>
        <div data-phase-tests="4"></div>
      </details>
      <details class="nav-phase" open>
        <summary><span class="phase-num p5">5</span>Accounts and staff</summary>
        <div data-phase-tests="5"></div>
      </details>
      </div>
      <div data-mode-nav="database">
        <div class="nav-title">Database</div>
        <button class="nav-item" data-view="db">What is stored<span class="code">rows</span></button>
        <button class="nav-item" data-view="schema">Schema<span class="code">fields</span></button>
      </div>
      <div data-mode-nav="schema">
        <div class="nav-title">Schema</div>
        <button class="nav-item" data-view="schema" data-scroll="schema-map">How they connect</button>
        <div id="schema-nav"></div>
      </div>
    </nav>
  </aside>

  <main id="layout" class="grid min-w-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
  <section class="card self-start xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
    <div class="border-b border-slate-100 p-2 lg:hidden dark:border-slate-800">
      <select id="view-select" class="input" aria-label="Section"></select>
    </div>
    <div class="card-body">

      <div class="tab" id="tab-home">
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-lg sm:p-8">
          <div class="absolute -top-16 -right-16 size-64 rounded-full bg-white/10 blur-2xl"></div>
          <p class="text-xs font-semibold tracking-wider text-indigo-100 uppercase">New unified backend · Phases 1 to 5</p>
          <h2 class="mt-2 text-3xl font-semibold tracking-tight">One backend for every brand, tried live</h2>
          <p class="mt-3 max-w-2xl text-sm leading-relaxed text-indigo-50">Brands from the host, the device core collections, devices, playlists and licenses, the TV app routes, MAC switch, recovery, provider moves, customers and staff: every rule on the real database, through dev-only routes. This page answers 404 in production.</p>
          <div class="mt-5 flex flex-wrap gap-2">
            <button class="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow hover:bg-indigo-50" id="home-run-all">Run all test cases</button>
            <button class="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/25" data-view="scenario:F1">Start the demo: scenario F1</button>
          </div>
          <div class="mt-5 flex flex-wrap gap-2 text-xs"><span class="rounded-full bg-white/15 px-2.5 py-1">brand <b id="home-brand">…</b></span><span class="rounded-full bg-white/15 px-2.5 py-1" id="home-origin"></span></div>
        </div>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="stat"><div class="stat-num" id="home-checks">…</div><div class="stat-label">test cases, in <span id="home-suites">…</span> suites</div></div>
          <div class="stat"><div class="stat-num" id="home-scenarios">…</div><div class="stat-label">guided scenarios</div></div>
          <div class="stat"><div class="stat-num">5</div><div class="stat-label">phases built, each on its own branch</div></div>
          <div class="stat"><div class="stat-num" id="home-last">–</div><div class="stat-label" id="home-last-label">last run: not yet</div></div>
        </div>
        <div>
          <h3 class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">What each phase adds</h3>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <button class="phase-card" data-view="brand"><span class="bar bg-sky-500"></span><span class="flex items-center gap-2"><span class="phase-num p1">1</span><span class="font-semibold">Foundation</span></span><span class="hint">Brands from the host, a database per brand, settings, secrets, request ids.</span><span class="mt-auto text-xs font-medium text-slate-500" data-phase-count="1"></span></button>
            <button class="phase-card" data-view="db"><span class="bar bg-teal-500"></span><span class="flex items-center gap-2"><span class="phase-num p2">2</span><span class="font-semibold">Database</span></span><span class="hint">Six device core collections, the Redis lock, one MAC one device.</span><span class="mt-auto text-xs font-medium text-slate-500" data-phase-count="2"></span></button>
            <button class="phase-card" data-view="register"><span class="bar bg-indigo-500"></span><span class="flex items-center gap-2"><span class="phase-num p3">3</span><span class="font-semibold">Core features</span></span><span class="hint">Devices, playlists, licenses and the routes the TV apps call.</span><span class="mt-auto text-xs font-medium text-slate-500" data-phase-count="3"></span></button>
            <button class="phase-card" data-view="license" data-scroll="sec-switch"><span class="bar bg-amber-500"></span><span class="flex items-center gap-2"><span class="phase-num p4">4</span><span class="font-semibold">Moves and cleanup</span></span><span class="hint">MAC switch, recovery on a new TV, provider moves, cleanup.</span><span class="mt-auto text-xs font-medium text-slate-500" data-phase-count="4"></span></button>
            <button class="phase-card" data-view="customer"><span class="bar bg-rose-500"></span><span class="flex items-center gap-2"><span class="phase-num p5">5</span><span class="font-semibold">Accounts and staff</span></span><span class="hint">Customers per brand, one staff login, roles, permissions, 2FA.</span><span class="mt-auto text-xs font-medium text-slate-500" data-phase-count="5"></span></button>
          </div>
        </div>
        <details class="step">
          <summary class="step-title cursor-pointer list-none">How to run it yourself ▾</summary>
          <ol class="mt-2 space-y-2 text-sm">
            <li class="flex flex-wrap items-center gap-2"><span class="pill">1</span> MongoDB and Redis <code class="kbd">docker compose up -d</code></li>
            <li class="flex flex-wrap items-center gap-2"><span class="pill">2</span> Brands and example devices <code class="kbd">npm run seed</code></li>
            <li class="flex flex-wrap items-center gap-2"><span class="pill">3</span> The API <code class="kbd">pnpm dev:api</code></li>
            <li class="flex flex-wrap items-center gap-2"><span class="pill">4</span> Open <code class="kbd">http://ibo.localhost:3000/dev/playground</code></li>
          </ol>
          <p class="hint mt-3">Scenarios and test cases write new rows into the <b>ibo</b> brand (and <b>bob</b> to prove isolation). The device tests also read the seed’s example devices.</p>
        </details>
      </div>

      <div class="tab" id="tab-brand">
        <div class="view-head"><div><h2 class="view-title">Brand and routing</h2><p class="hint mt-1 max-w-2xl">Every request is served for the brand of its host, and reads only that brand’s database. Settings live on the brand, secrets are encrypted per brand, config has defaults.</p></div><span class="pill">F-4 · F-5 · F-8</span></div>
        <div class="step" data-submit="b-resolve">
          <div class="step-title">Which brand is a host?</div>
          <div class="row">
            <label class="field">Host<input id="b-host" class="input font-mono" value="bob.localhost" spellcheck="false"></label>
            <button class="btn btn-primary" id="b-resolve">Resolve</button>
            <button class="btn" id="b-unknown">Try an unknown host</button>
          </div>
          <div class="mt-3" id="b-result"></div>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <div class="step"><div class="step-title">This brand <span class="pill mono normal-case tracking-normal" id="b-slug">…</span></div><div id="b-brand"></div></div>
          <div class="step"><div class="step-title">Health <span class="font-normal normal-case tracking-normal">no brand needed</span></div><div id="b-health"></div></div>
        </div>
        <div class="step"><div class="step-title">Brand config, with its defaults</div><pre class="detail max-h-80" id="b-config"></pre></div>
      </div>

      <div class="tab" id="tab-scenario"><div id="scenario-view"></div></div>

      <div class="tab" id="tab-schema">
        <div class="view-head">
          <div>
            <h2 class="view-title">Database schema</h2>
            <p class="hint mt-1 max-w-2xl">Read live from MongoDB: every collection the migrations created, its fields with their types (from the collection’s validator), and its indexes. One central database for all brands, and one database per brand.</p>
          </div>
          <button class="btn" id="schema-refresh">Refresh</button>
        </div>
        <div class="step" id="schema-map">
          <div class="step-title">How the collections connect</div>
          <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div class="rounded-xl border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-900 dark:bg-teal-950/20">
              <div class="mb-3 text-xs font-semibold tracking-wider text-teal-700 uppercase dark:text-teal-300">Each brand’s database</div>
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <span class="schema-box">trialDevices</span><span class="schema-arrow">pays, same id →</span><span class="schema-box">devices</span><span class="schema-arrow">currentLicenseId →</span><span class="schema-box">licenses</span>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span class="schema-box">playlists</span><span class="schema-arrow">deviceId → either device</span>
                <span class="schema-box">captchas</span><span class="schema-arrow">by MAC</span>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span class="schema-box">customers</span><span class="schema-arrow">← devices.customerId</span><span class="schema-box">customerTokens</span><span class="schema-arrow">one-time links</span><span class="schema-box">tenantConfig</span>
              </div>
            </div>
            <div class="rounded-xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900 dark:bg-sky-950/20">
              <div class="mb-3 text-xs font-semibold tracking-wider text-sky-700 uppercase dark:text-sky-300">Central database</div>
              <div class="flex flex-wrap items-center gap-2 text-sm"><span class="schema-box">tenants</span><span class="schema-arrow">→</span><span class="schema-box">tenantSecrets</span></div>
              <div class="mt-3 flex flex-wrap items-center gap-2 text-sm"><span class="schema-box">staffUsers</span><span class="schema-arrow">roleId →</span><span class="schema-box">roles</span><span class="schema-arrow">→</span><span class="schema-box">permissions</span></div>
              <div class="mt-3 flex flex-wrap items-center gap-2 text-sm"><span class="schema-box">domainMigrations</span><span class="schema-arrow">provider moves</span></div>
            </div>
          </div>
          <p class="hint mt-3">A MAC is in trialDevices or devices, never both. Paying moves the row with the same id, so playlists keep pointing at it. Licenses are one row per license, kept as history.</p>
        </div>
        <div id="schema-list" class="space-y-6"></div>
      </div>

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
            <p class="hint mt-1 max-w-2xl">One suite per area, Phase 1 to Phase 5: brands and requests, the device core collections, and the checks of every <code class="mono">pnpm e2e:*</code> script, run from this page against the running API on the real database. Click a suite to run only that one.</p>
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
        <div class="view-head"><h2 class="view-title">License, MAC switch, recovery and cleanup</h2><span class="pill">LIC-1–4 · DEV-7 · REC-1–3</span></div>
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

        <div class="step" data-submit="s-switch" id="sec-switch">
          <div class="step-title">MAC switch <span class="font-normal normal-case tracking-normal">DEV-7</span></div>
          <ol class="hint mb-3 list-decimal space-y-0.5 pl-4">
            <li>The device above must be paid, with a running lifetime license (or yearly with <b>Allow yearly</b>), not from a multi-device order.</li>
            <li>The new MAC must be registered: the app installed on the new TV. <b>Make it a new TV</b> does that, with one playlist.</li>
            <li>Its trial device is absorbed (playlists move over); a paid device there refuses the switch. The old MAC keeps an ended trial.</li>
            <li>Switches per device: brand config <code class="mono">macSwitch.maxPerDevice</code>, 1 by default.</li>
          </ol>
          <div class="row">
            <label class="field">New MAC
              <span class="flex gap-1.5"><input id="s-mac" class="input font-mono" placeholder="aa:bb:cc:dd:ee:ff" spellcheck="false"><button class="btn" id="s-random">Random</button></span>
            </label>
            <button class="btn" id="s-trial" title="Register a trial device on the new MAC, with one playlist, like a new TV would">Make it a new TV</button>
            <label class="check mb-1.5"><input type="checkbox" id="s-yearly"> Allow yearly</label>
          </div>
          <div class="row mt-3">
            <button class="btn btn-primary" id="s-switch">Switch MAC</button>
            <button class="btn" id="s-follow" title="Show the device on its new MAC">Look up new MAC</button>
          </div>
        </div>

        <div class="step" data-submit="r-recover">
          <div class="step-title">Recovery on a new TV <span class="font-normal normal-case tracking-normal">REC-1, REC-2, REC-3</span></div>
          <ol class="hint mb-3 list-decimal space-y-0.5 pl-4">
            <li>The website makes a code for the paid device above (running license only). It lasts 30 minutes; a new code replaces the old one.</li>
            <li>The new TV, with the app installed, sends the code. The device takes its MAC and keeps its id, license and playlists.</li>
            <li>The new TV's own trial device is removed with its playlists. The old MAC keeps an ended trial. A code works once.</li>
          </ol>
          <div class="row">
            <button class="btn" id="r-code">Make recovery code</button>
            <label class="field">Code<input id="r-code-value" class="input font-mono uppercase" placeholder="8 characters" spellcheck="false"></label>
          </div>
          <div class="row mt-2">
            <label class="field">New TV MAC
              <span class="flex gap-1.5"><input id="r-mac" class="input font-mono" placeholder="aa:bb:cc:dd:ee:ff" spellcheck="false"><button class="btn" id="r-random">Random</button></span>
            </label>
            <button class="btn" id="r-trial" title="Register a trial device on the new MAC, with one playlist, like a new TV would">Make it a new TV</button>
          </div>
          <div class="row mt-3">
            <button class="btn btn-primary" id="r-recover">Recover on the new TV</button>
          </div>
        </div>

        <div class="step" data-submit="c-report">
          <div class="step-title">Cleanup report <span class="font-normal normal-case tracking-normal">LIC-4, dry run</span></div>
          <p class="hint mb-2">Trial devices whose trial ended, with no playlist, not seen for the days given. Only a report here; the real run is <code class="mono">pnpm cli devices:cleanup --apply</code>.</p>
          <div class="row">
            <label class="field max-w-[8rem]">Not seen for (days)<input id="c-days" class="input" value="180"></label>
            <button class="btn" id="c-report">Report</button>
          </div>
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

      <div class="tab" id="tab-moves">
        <div class="view-head"><h2 class="view-title">Provider moves</h2><span class="pill">DOM-1 · DOM-2</span></div>
        <div class="step" data-submit="m-report">
          <div class="step-title">Devices report a move <span class="font-normal normal-case tracking-normal">DOM-1</span></div>
          <p class="hint mb-2">A paid device that changes its own playlist's link, when only the host changed, reports the move. Once per IP and per device; trial devices do not count. This makes new paid devices that each add the old link and change it to the new one, each from its own IP.</p>
          <div class="row">
            <label class="field">Old link<input id="m-old" class="input font-mono" spellcheck="false"></label>
            <label class="field">New link<input id="m-new" class="input font-mono" spellcheck="false"></label>
          </div>
          <div class="row mt-2">
            <label class="field max-w-[7rem]">Devices<input id="m-count" class="input" value="3"></label>
            <button class="btn" id="m-hosts" title="New random hosts for both links">New hosts</button>
            <button class="btn btn-primary" id="m-report">Report from the devices</button>
            <button class="btn" id="m-watch" title="Add the old link to the device above, to see what its reply gets">Add old link to this MAC</button>
          </div>
        </div>

        <div class="step">
          <div class="step-title">Approve or block <span class="font-normal normal-case tracking-normal">DOM-2</span></div>
          <p class="hint mb-2">After 3 IPs a move waits for staff. Only approved moves are served: the link goes out on the new host, the old host first in its backups; the stored playlist never changes. A blocked move is never served.</p>
          <div class="row">
            <label class="field">Show<select id="m-filter" class="input"><option value="awaiting">Awaiting approval</option><option>pending</option><option>approved</option><option>blocked</option></select></label>
            <button class="btn" id="m-refresh">Refresh</button>
          </div>
          <div id="m-list" class="mt-3"></div>
        </div>
      </div>

      <div class="tab" id="tab-customer">
        <div class="step" data-submit="cu-signup">
          <div class="step-title">Sign up and verify <span class="font-normal normal-case tracking-normal">CUS-1</span></div>
          <p class="hint mb-2">An account in this brand only: the same email on another brand is a separate account. With no SMTP set up, the email goes to the dev outbox; "Open the emailed link" uses it.</p>
          <div class="row">
            <label class="field">Email<input id="cu-email" class="input" autocomplete="off" spellcheck="false"></label>
            <label class="field">Password<input id="cu-password" class="input" value="customer-pass"></label>
            <label class="field">First name<input id="cu-first" class="input" value="Ana"></label>
          </div>
          <div class="row mt-2">
            <button class="btn" id="cu-random" title="A new random email">New email</button>
            <button class="btn btn-primary" id="cu-signup">Sign up</button>
            <button class="btn" id="cu-verify">Open the emailed link</button>
          </div>
        </div>

        <div class="step" data-submit="cu-login">
          <div class="step-title">Log in <span class="font-normal normal-case tracking-normal">CUS-2</span> <span id="cu-session" class="pill">logged out</span></div>
          <p class="hint mb-2">Uses the email and password above. A wrong password and an unknown email get the same answer; no login before the email is verified. 10 tries per 15 minutes per IP and per email.</p>
          <div class="row">
            <button class="btn btn-primary" id="cu-login">Log in</button>
            <button class="btn" id="cu-me">Me</button>
            <button class="btn" id="cu-logout">Log out</button>
          </div>
        </div>

        <div class="step" data-submit="cu-reset-confirm">
          <div class="step-title">Password reset <span class="font-normal normal-case tracking-normal">CUS-2</span></div>
          <p class="hint mb-2">The same answer whether the email has an account or not. The link works once for 1 hour, also verifies the email, and logs out every session.</p>
          <div class="row">
            <button class="btn" id="cu-reset">Email a reset link</button>
            <label class="field">New password<input id="cu-newpass" class="input" value="customer-pass-2"></label>
            <button class="btn btn-primary" id="cu-reset-confirm">Use the emailed link</button>
          </div>
        </div>

        <div class="step" data-submit="cu-update">
          <div class="step-title">Profile <span class="font-normal normal-case tracking-normal">CUS-4</span></div>
          <p class="hint mb-2">Leave a field empty to keep it. A new email is not verified until its own link is opened; a new email or password needs the current password; a new password logs out every session.</p>
          <div class="row">
            <label class="field">First name<input id="cu-p-first" class="input"></label>
            <label class="field">New email<input id="cu-p-email" class="input" spellcheck="false"></label>
          </div>
          <div class="row mt-2">
            <label class="field">New password<input id="cu-p-pass" class="input"></label>
            <label class="field">Current password<input id="cu-p-current" class="input"></label>
            <button class="btn btn-primary" id="cu-update">Save</button>
          </div>
        </div>

        <div class="step" data-submit="cu-link">
          <div class="step-title">TVs on the account <span class="font-normal normal-case tracking-normal">CUS-3</span></div>
          <p class="hint mb-2">Links the MAC at the top with its device key (filled in from the Device card). Paid devices only; a TV belongs to one account; 10 tries an hour per account and per IP.</p>
          <div class="row">
            <label class="field max-w-[9rem]">Device key<input id="cu-key" class="input font-mono" placeholder="from the device"></label>
            <button class="btn btn-primary" id="cu-link">Link the MAC above</button>
            <button class="btn" id="cu-devices-refresh">Refresh</button>
          </div>
          <div id="cu-devices" class="mt-3 space-y-2"></div>
        </div>
      </div>

      <div class="tab" id="tab-staff">
        <div class="step" data-submit="st-root">
          <div class="step-title">First super admin <span class="font-normal normal-case tracking-normal">dev only</span></div>
          <p class="hint mb-2">Role super_admin on every brand. In production this is <code class="mono">pnpm cli staff:create</code>.</p>
          <div class="row">
            <label class="field">Email<input id="st-root-email" class="input" spellcheck="false"></label>
            <label class="field">Password<input id="st-root-pass" class="input" value="root-pass-1"></label>
            <button class="btn btn-primary" id="st-root">Create super admin</button>
          </div>
        </div>

        <div class="step" data-submit="st-login">
          <div class="step-title">Log in <span class="font-normal normal-case tracking-normal">STF-1</span> <span id="st-session" class="pill">logged out</span></div>
          <p class="hint mb-2">One account for every brand. With two-factor login on, the password gives a 5-minute challenge, finished with the app's code.</p>
          <div class="row">
            <label class="field">Email<input id="st-email" class="input" spellcheck="false"></label>
            <label class="field">Password<input id="st-pass" class="input"></label>
            <button class="btn btn-primary" id="st-login">Log in</button>
          </div>
          <div class="row mt-2" id="st-2fa-row" hidden data-submit="st-2fa-send">
            <label class="field max-w-[9rem]">Code<input id="st-2fa-code" class="input font-mono" autocomplete="off"></label>
            <button class="btn btn-primary" id="st-2fa-send">Send code</button>
          </div>
          <div class="row mt-2">
            <button class="btn" id="st-me">Me</button>
            <button class="btn" id="st-logout">Log out</button>
          </div>
        </div>

        <div class="step" data-submit="st-2fa-on">
          <div class="step-title">Two-factor login</div>
          <p class="hint mb-2">Set up gives a secret for an authenticator app (or the otpauth link as a QR code). It is required at login only once turned on with a first code. Turning it off needs a code and logs out the other sessions.</p>
          <div class="row">
            <button class="btn" id="st-2fa-setup">Set up</button>
            <label class="field max-w-[9rem]">Code<input id="st-2fa-own" class="input font-mono" autocomplete="off"></label>
            <button class="btn btn-primary" id="st-2fa-on">Turn on</button>
            <button class="btn" id="st-2fa-off">Turn off</button>
          </div>
          <div id="st-2fa-secret" class="mt-2"></div>
        </div>

        <div class="step" data-submit="st-activate">
          <div class="step-title">This brand's devices <span class="font-normal normal-case tracking-normal">STF-3</span></div>
          <p class="hint mb-2">Acts on the MAC at the top, on the brand at the top right. Switch brand to see a member outside their brands refused (403 brand_not_allowed); a role without the key gets 403 missing_permission.</p>
          <div class="row">
            <button class="btn" id="st-view">View (devices.view)</button>
            <label class="field max-w-[9rem]">Type<select id="st-type" class="input"><option>yearly</option><option>lifetime</option></select></label>
            <button class="btn btn-primary" id="st-activate">Activate (devices.activate)</button>
          </div>
        </div>

        <div class="step" data-submit="st-create">
          <div class="step-title">Staff <span class="font-normal normal-case tracking-normal">STF-2 · staff.manage</span></div>
          <p class="hint mb-2">Disabling, a new password or a 2FA reset logs the member out on every server at once. Nobody disables themselves or changes their own role.</p>
          <div class="row">
            <label class="field">Email<input id="st-n-email" class="input" spellcheck="false"></label>
            <label class="field">Name<input id="st-n-name" class="input" value="Sam"></label>
            <label class="field">Password<input id="st-n-pass" class="input" value="staff-pass-1"></label>
          </div>
          <div class="row mt-2">
            <label class="field">Role<select id="st-n-role" class="input"></select></label>
            <label class="field">Brands<input id="st-n-brands" class="input" placeholder="ibo,bob or *"></label>
            <button class="btn btn-primary" id="st-create">Add</button>
            <button class="btn" id="st-refresh">Refresh</button>
          </div>
          <div id="st-list" class="mt-3 space-y-2"></div>
        </div>

        <div class="step" data-submit="st-role-create">
          <div class="step-title">Roles <span class="font-normal normal-case tracking-normal">PRM-2 · roles.manage</span></div>
          <p class="hint mb-2">A role lists active keys only. super_admin is fixed and passes everything; a role still given to someone cannot be deleted. A key taken off a role is refused on the next request.</p>
          <div class="row">
            <label class="field">New role name<input id="st-role-name" class="input"></label>
            <button class="btn btn-primary" id="st-role-create">Create with the ticked keys</button>
          </div>
          <div id="st-role-keys" class="row mt-2"></div>
          <div id="st-roles" class="mt-3 space-y-2"></div>
        </div>

        <div class="step">
          <div class="step-title">Permissions <span class="font-normal normal-case tracking-normal">PRM-1</span></div>
          <p class="hint mb-2">The keys come from the code (<code class="mono">@Staff(key)</code>), synced on every API start. A key no longer in the code is inactive and removed from every role. Labels are editable here and kept by the sync.</p>
          <div id="st-perms" class="space-y-2"></div>
        </div>
      </div>

      <div class="tab" id="tab-store">
        <div class="step" data-submit="st-key-set">
          <div class="step-title">Store key <span class="font-normal normal-case tracking-normal">this brand</span> <span id="st-key-pill" class="pill">not set</span></div>
          <p class="hint mb-2">The store sends the brand's key in a <code class="mono">token</code> header; a brand with no key refuses every call. This sets the brand's <code class="mono">store.key</code> (dev only; on a server: <code class="mono">pnpm cli tenant:set-secret &lt;brand&gt; store.key …</code>). The calls below use the MAC at the top.</p>
          <div class="row">
            <label class="field">Key<input id="st-key" class="input font-mono" placeholder="empty = a new random key"></label>
            <button class="btn btn-primary" id="st-key-set">Set key</button>
            <button class="btn" id="st-validate">Validate MAC</button>
          </div>
        </div>

        <div class="step" data-submit="st-activate">
          <div class="step-title">Sell or cancel <span class="font-normal normal-case tracking-normal">save-device-activation</span></div>
          <p class="hint mb-2">The store sets the end itself: a date is a license until that day, lifetime is <code class="mono">is_trial 2</code>, and a cancel (<code class="mono">is_trial 0</code>, a past date) ends the license, keeping its history.</p>
          <div class="row">
            <label class="field max-w-[11rem]">Until<input id="st-until" class="input font-mono" type="date"></label>
            <label class="field max-w-[10rem]">Reseller id<input id="st-reseller" class="input font-mono" placeholder="optional"></label>
            <button class="btn btn-primary" id="st-activate">Activate until</button>
            <button class="btn" id="st-lifetime">Lifetime</button>
            <button class="btn" id="st-cancel">Cancel</button>
          </div>
        </div>

        <div class="step" data-submit="st-pl-add">
          <div class="step-title">Playlists <span class="font-normal normal-case tracking-normal">save-play-list · reset-playlist</span></div>
          <div class="row">
            <label class="field">Name<input id="st-pl-name" class="input" value="From the store"></label>
            <label class="field">Link or Xtream server<input id="st-pl-url" class="input font-mono" value="http://old.example.com:8080/list.m3u"></label>
          </div>
          <div class="row mt-2">
            <label class="field max-w-[8rem]">Username<input id="st-pl-user" class="input"></label>
            <label class="field max-w-[8rem]">Password<input id="st-pl-pass" class="input"></label>
            <label class="field max-w-[10rem]">Logo<input id="st-pl-logo" class="input" placeholder="optional"></label>
            <button class="btn btn-primary" id="st-pl-add">Add</button>
            <label class="field max-w-[8rem]">Device key<input id="st-devkey" class="input font-mono" placeholder="for delete all"></label>
            <button class="btn" id="st-reset">Delete all</button>
          </div>
        </div>

        <div class="step" data-submit="st-domain-count">
          <div class="step-title">Provider host <span class="font-normal normal-case tracking-normal">count-domain-updates · update-domain</span></div>
          <p class="hint mb-2">Whole brand (<code class="mono">is_admin: true</code>), or only the MAC at the top (<code class="mono">is_admin: false</code> + <code class="mono">activated_macs</code>).</p>
          <div class="row">
            <label class="field">Old host<input id="st-from" class="input font-mono" value="old.example.com"></label>
            <label class="field">New host<input id="st-to" class="input font-mono" value="new.example.com"></label>
            <label class="field max-w-[8rem]">Scope<select id="st-scope" class="input"><option value="brand">Brand</option><option value="mac">This MAC</option></select></label>
            <button class="btn" id="st-domain-count">Count</button>
            <button class="btn btn-primary" id="st-domain-move">Move</button>
          </div>
        </div>

        <div class="step" data-submit="st-switch">
          <div class="step-title">Switch MAC <span class="font-normal normal-case tracking-normal">switch-mac-address</span></div>
          <p class="hint mb-2">Moves the license of the MAC at the top to a TV that opened the app once. Refusals come back as HTTP 302 with the old message.</p>
          <div class="row">
            <label class="field max-w-[12rem]">New TV MAC<input id="st-newmac" class="input font-mono"></label>
            <label class="row items-center gap-1 text-sm"><input id="st-allow-year" type="checkbox"> allow a yearly license</label>
            <button class="btn btn-primary" id="st-switch">Switch</button>
          </div>
        </div>
      </div>

      <div class="tab" id="tab-site">
        <div class="step" data-submit="dv-login">
          <div class="step-title">Device login on the site <span class="font-normal normal-case tracking-normal">MAC + key</span> <span id="dv-session" class="pill">logged out</span></div>
          <p class="hint mb-2">Uses the MAC at the top and its device key (filled from the Device card). Every try needs a new captcha; 10 tries per 15 minutes per IP and per MAC. A wrong key and an unknown MAC get the same answer.</p>
          <div class="row">
            <button class="btn" id="dv-captcha">New captcha</button>
            <span id="dv-captcha-img" class="inline-block h-12 rounded bg-slate-900 px-1 [&_svg]:h-12 [&_svg]:w-auto"></span>
            <label class="field max-w-[8rem]">Answer<input id="dv-answer" class="input font-mono" autocomplete="off"></label>
          </div>
          <div class="row mt-2">
            <label class="field max-w-[9rem]">Device key<input id="dv-key" class="input font-mono" placeholder="from the device"></label>
            <button class="btn btn-primary" id="dv-login">Log in</button>
            <button class="btn" id="dv-me">Dashboard</button>
            <button class="btn" id="dv-logout">Log out</button>
          </div>
        </div>

        <div class="step" data-submit="dv-pl-add">
          <div class="step-title">Playlists from the site</div>
          <p class="hint mb-2">A link, or an Xtream login. With a PIN it is saved protected: the list then shows only its name until unlocked with the PIN.</p>
          <div class="row">
            <label class="field">Name<input id="dv-pl-name" class="input" value="From the site"></label>
            <label class="field">Link or Xtream server<input id="dv-pl-url" class="input font-mono" value="http://line.example.com:8080/list.m3u"></label>
          </div>
          <div class="row mt-2">
            <label class="field max-w-[8rem]">Username<input id="dv-pl-user" class="input"></label>
            <label class="field max-w-[8rem]">Password<input id="dv-pl-pass" class="input"></label>
            <label class="field max-w-[6rem]">PIN<input id="dv-pl-pin" class="input font-mono" placeholder="none"></label>
            <button class="btn btn-primary" id="dv-pl-add">Add</button>
          </div>
          <div id="dv-playlists" class="mt-3 space-y-2"></div>
        </div>

        <div class="step" data-submit="dv-uid">
          <div class="step-title">Device settings from the site</div>
          <div class="row">
            <label class="field max-w-[9rem]">New key<input id="dv-newkey" class="input font-mono" placeholder="empty = random"></label>
            <button class="btn" id="dv-setkey">Set key</button>
            <label class="field max-w-[7rem]">Parental PIN<input id="dv-ppin" class="input font-mono" placeholder="empty = off"></label>
            <button class="btn" id="dv-setppin">Set PIN</button>
          </div>
          <div class="row mt-2">
            <label class="field max-w-[9rem]">UID<input id="dv-uid-in" class="input font-mono" placeholder="6 letters or digits"></label>
            <button class="btn" id="dv-uid">Set UID</button>
            <button class="btn" id="dv-recovery">Recovery code</button>
            <label class="field max-w-[12rem]">New TV MAC<input id="dv-newmac" class="input font-mono"></label>
            <button class="btn" id="dv-switch">Switch MAC</button>
          </div>
        </div>

        <div class="step" data-submit="dv-status">
          <div class="step-title">Public tools <span class="font-normal normal-case tracking-normal">no login</span></div>
          <p class="hint mb-2">Device status needs the captcha above. Check playlist asks the provider about an Xtream account (local and private addresses are refused). The contact form is read by staff with <code class="mono">contact.view</code>.</p>
          <div class="row">
            <button class="btn" id="dv-status">Device status (MAC above)</button>
            <button class="btn" id="dv-check">Check the playlist above</button>
          </div>
          <div class="row mt-2">
            <label class="field">Your email<input id="dv-c-email" class="input" value="visitor@example.test"></label>
            <label class="field">Message<input id="dv-c-msg" class="input" value="My TV does not load."></label>
            <button class="btn" id="dv-contact">Send message</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="min-w-0 space-y-5" id="inspector">
    <div class="card">
      <div class="card-head"><h2 class="card-title">Device under test</h2><span id="device-chip" class="pill">no device</span></div>
      <div class="card-body space-y-3" data-submit="refresh">
        <label class="field">MAC address
          <input id="mac" class="input font-mono" placeholder="aa:bb:cc:dd:ee:ff" autocomplete="off" spellcheck="false">
        </label>
        <div class="row">
          <button class="btn" id="randomMac" title="A new random MAC">Random</button>
          <button class="btn" id="fallbackMac" title="52:54:00:12:34:57, a shared placeholder MAC: treated as no MAC">Placeholder</button>
          <button class="btn btn-primary" id="refresh">Look up</button>
          <label class="check ml-auto" title="The dev routes send the captcha answer back, so you can log in without reading it"><input type="checkbox" id="reveal"> Show captcha answers</label>
        </div>
      </div>
    </div>
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
  var WIDE = { home: true, tests: true, brand: true, schema: true };
  // The six tabs in the header; each view belongs to one, and the sidebar shows that tab's list.
  var MODE_OF = { home: 'overview', scenario: 'scenarios', tests: 'tests', db: 'database', schema: 'schema' };
  var MODE_START = { overview: 'home', tools: 'register', scenarios: 'scenario:F1', tests: 'tests', database: 'db', schema: 'schema' };
  var lastInMode = {};
  function modeOf(name) { return MODE_OF[name] || 'tools'; }
  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { openView(lastInMode[b.dataset.mode] || MODE_START[b.dataset.mode]); });
  });
  function openView(view) {
    var name = view.split(':')[0], arg = view.split(':')[1];
    if (!$('tab-' + name)) { view = 'home'; name = 'home'; arg = undefined; }
    var mode = modeOf(name);
    lastInMode[mode] = view;
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-current', b.dataset.mode === mode ? 'true' : 'false'); });
    document.querySelectorAll('[data-mode-nav]').forEach(function (n) { n.hidden = n.dataset.modeNav !== mode; });
    document.querySelector('aside').classList.toggle('lg:block', mode !== 'overview');
    if (name === 'schema') refreshSchema();
    document.querySelectorAll('.nav-item[data-view]').forEach(function (b) { b.setAttribute('aria-current', b.dataset.view === view ? 'true' : 'false'); });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.id === 'tab-' + name); });
    $('layout').classList.toggle('wide', !!WIDE[name]);
    if ($('view-select').querySelector('option[value="' + view + '"]')) $('view-select').value = view;
    if (name === 'scenario' && window.PG) window.PG.showScenario(arg);
    if (name === 'tests' && window.PG) window.PG.showTests(arg);
    if (name === 'db') refreshDb();
    if (name === 'brand') refreshBrand();
    if (store.view !== view) window.scrollTo({ top: 0 });
    store.view = view;
    store('view', view);
  }
  function openTab(name) { openView(name); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-view]');
    if (!b || b.matches('option')) return;
    openView(b.dataset.view);
    if (b.dataset.scroll && $(b.dataset.scroll)) setTimeout(function () { $(b.dataset.scroll).scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
  });

  // Light or dark, remembered; light by default (projectors).
  $('theme').addEventListener('click', function () {
    var dark = document.documentElement.classList.toggle('dark');
    store('theme', dark ? 'dark' : 'light');
  });
  $('home-origin').textContent = location.host;
  $('home-run-all').addEventListener('click', function () { openView('tests'); if (window.PG) window.PG.runTests(); });

  // Phase 1: the brand of this host, any host's brand, health
  function refreshBrand() {
    fetch('/dev/brand').then(function (r) { return r.json(); }).then(function (b) {
      $('b-slug').textContent = b.slug;
      $('b-brand').innerHTML = '<div class="kv">' +
        '<div>Name</div><div>' + esc(b.name) + ' <span class="pill ' + (b.status === 'active' ? 'ok' : 'bad') + '">' + esc(b.status) + '</span></div>' +
        '<div>Database</div><div><code>' + esc(b.dbName) + '</code></div>' +
        '<div>Hosts</div><div class="flex flex-wrap gap-1">' + b.hosts.map(function (h) { return '<span class="pill mono">' + esc(h) + '</span>'; }).join('') + '</div>' +
        '<div>Playlist profile</div><div><code>' + esc(b.settings.playlistProfile) + '</code></div>' +
        '<div>Secrets</div><div>' + (b.secrets.length ? b.secrets.map(function (n) { return '<span class="pill mono">' + esc(n) + '</span>'; }).join(' ') + '<div class="hint">names only; values never leave the server</div>' : '<span class="hint">none</span>') + '</div>' +
        '</div>';
      $('b-config').textContent = JSON.stringify(b.config, null, 2);
    }, function () { unreachable('b-brand'); });
    Promise.all([fetch('/health').then(function (r) { return r.json(); }), fetch('/ready').then(function (r) { return r.json(); })]).then(function (x) {
      var c = x[1].checks || {};
      $('b-health').innerHTML = '<div class="kv"><div>/health</div><div><span class="pill ' + (x[0].status === 'ok' ? 'ok' : 'bad') + '">' + esc(x[0].status) + '</span></div>' +
        Object.keys(c).map(function (k) { return '<div>' + esc(k) + '</div><div><span class="pill ' + (c[k] === 'up' ? 'ok' : 'bad') + '">' + esc(c[k]) + '</span></div>'; }).join('') + '</div>';
    }, function () { unreachable('b-health'); });
  }
  function resolveHost(host) {
    fetch('/dev/brands/resolve?host=' + encodeURIComponent(host)).then(function (r) { return r.json(); }).then(function (x) {
      $('b-result').innerHTML = x.found
        ? '<div class="rounded-lg bg-emerald-50 p-3 text-sm dark:bg-emerald-950/40"><span class="pill ok">200</span> <code class="mono">' + esc(x.host) + '</code> is served as <b>' + esc(x.name) + '</b> (<code>' + esc(x.slug) + '</code>)</div>'
        : '<div class="rounded-lg bg-rose-50 p-3 text-sm dark:bg-rose-950/40"><span class="pill bad">' + x.status + '</span> <code class="mono">' + esc(x.host) + '</code>: ' + esc(x.message) + ' <code class="mono">' + esc(x.code) + '</code></div>';
    });
  }
  $('b-resolve').addEventListener('click', function () { resolveHost($('b-host').value.trim()); });
  $('b-unknown').addEventListener('click', function () { $('b-host').value = 'not-a-brand.example.com'; resolveHost($('b-host').value); });
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
  function call(method, path, body, base, token, headers) {
    base = base || '/dev/devices';
    var button = pressed; pressed = null;
    busy(button, true);
    var opts = { method: method, headers: Object.assign({}, headers || {}) };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if (token) opts.headers.Authorization = 'Bearer ' + token;
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

  // MAC switch (DEV-7)
  function followMac(next) { $('mac').value = next; remember(); pl.selected = null; both(); }
  $('s-random').addEventListener('click', function () { $('s-mac').value = randomMac(); });
  $('s-trial').addEventListener('click', function () {
    var tv = orNull($('s-mac').value);
    if (!tv) { warn('Type or pick the new MAC first.'); return; }
    call('POST', '/register', { mac: tv, platform: $('r-platform').value, appVersion: '1.0.0', apiVersion: 'legacy', appDeviceId: null, uid: null })
      .then(function () {
        return plCall('POST', '/' + encodeURIComponent(tv) + '/add', {
          name: 'Added on the new TV', source: { kind: 'link', url: 'http://newtv.example/list-' + Math.random().toString(36).slice(2, 6) + '.m3u' }, via: 'app'
        });
      });
  });
  $('s-switch').addEventListener('click', function () {
    var next = orNull($('s-mac').value);
    if (!next) { warn('Type or pick the new MAC first.'); return; }
    call('POST', macPath() + '/switch', { newMac: next, allowYearly: $('s-yearly').checked }, '/dev/licenses')
      .then(function (r) { if (r.status < 300 && r.json.to) followMac(r.json.to); else both(); });
  });
  $('s-follow').addEventListener('click', function () { var next = orNull($('s-mac').value); if (next) followMac(next); });

  // Recovery (REC-1 to REC-3)
  $('r-random').addEventListener('click', function () { $('r-mac').value = randomMac(); });
  $('r-trial').addEventListener('click', function () {
    var tv = orNull($('r-mac').value);
    if (!tv) { warn('Type or pick the new TV MAC first.'); return; }
    call('POST', '/register', { mac: tv, platform: $('r-platform').value, appVersion: '1.0.0', apiVersion: 'legacy', appDeviceId: null, uid: null })
      .then(function () {
        return plCall('POST', '/' + encodeURIComponent(tv) + '/add', {
          name: 'Added on the new TV', source: { kind: 'link', url: 'http://newtv.example/list-' + Math.random().toString(36).slice(2, 6) + '.m3u' }, via: 'app'
        });
      });
  });
  $('r-code').addEventListener('click', function () {
    if (!mac()) { warn('Type the MAC of the paid device first.'); return; }
    call('POST', macPath() + '/recovery-code', undefined, '/dev/licenses')
      .then(function (r) { if (r.status < 300 && r.json.code) $('r-code-value').value = r.json.code; lookUp(); });
  });
  $('r-recover').addEventListener('click', function () {
    var code = orNull($('r-code-value').value), tv = orNull($('r-mac').value);
    if (!code || !tv) { warn('Make a code and pick the new TV MAC first.'); return; }
    call('POST', '/recover', { code: code, newMac: tv }, '/dev/licenses')
      .then(function (r) { if (r.status < 300 && r.json.to) followMac(r.json.to); else both(); });
  });
  $('c-report').addEventListener('click', function () {
    call('GET', '/cleanup?days=' + encodeURIComponent($('c-days').value.trim()), undefined, '/dev/licenses');
  });

  // Provider moves (DOM-1, DOM-2)
  function moveLink(host) { return 'http://' + host + '/get.php?username=demo&password=demo&type=m3u_plus'; }
  function newMoveHosts() {
    var tag = Math.random().toString(36).slice(2, 6);
    $('m-old').value = moveLink('line-' + tag + '.example.com:8080');
    $('m-new').value = moveLink('line-' + tag + '-new.example.com:8080');
  }
  newMoveHosts();
  $('m-hosts').addEventListener('click', newMoveHosts);
  $('m-report').addEventListener('click', function () {
    var count = Math.max(1, Math.min(10, parseInt($('m-count').value, 10) || 3));
    var oldLink = $('m-old').value.trim(), newLink = $('m-new').value.trim();
    // This button spins for the whole run, not for each request in it.
    var button = pressed; pressed = null;
    var base = Math.floor(Math.random() * 200);
    busy(button, true);
    var chain = Promise.resolve();
    for (var i = 1; i <= count; i++) {
      (function (n) {
        chain = chain.then(function () {
          var tv = randomMac();
          return call('POST', '/register', { mac: tv, platform: 'samsung', appVersion: '1.0.0', apiVersion: 'legacy', appDeviceId: null, uid: null })
            .then(function () { return call('POST', '/' + encodeURIComponent(tv) + '/activate', { type: 'lifetime', source: 'admin', sourceId: 'move-' + Math.random().toString(36).slice(2, 10) }, '/dev/licenses'); })
            .then(function () { return plCall('POST', '/' + encodeURIComponent(tv) + '/add', { name: 'Provider', source: { kind: 'link', url: oldLink }, via: 'app' }); })
            .then(function (r) {
              if (!r.json || !r.json.id) return null;
              return plCall('POST', '/' + encodeURIComponent(tv) + '/' + r.json.id + '/edit', { source: { kind: 'link', url: newLink }, ip: '198.51.100.' + (base + n) });
            });
        });
      })(i);
    }
    chain.finally(function () { busy(button, false); refreshMoves(); });
  });
  $('m-watch').addEventListener('click', function () {
    if (!mac()) { warn('Type a MAC first.'); return; }
    plCall('POST', macPath() + '/add', { name: 'Provider ' + Math.random().toString(36).slice(2, 5), source: { kind: 'link', url: $('m-old').value.trim() }, via: 'app' }).then(both);
  });
  function refreshMoves() {
    fetch('/dev/domain-moves?filter=' + $('m-filter').value).then(function (res) { return res.json(); }).then(function (moves) {
      var box = $('m-list');
      if (!moves.length) { box.innerHTML = '<p class="empty">No moves here.</p>'; return; }
      box.innerHTML = moves.map(function (m) {
        return '<div class="kv mb-3"><div>Move</div><div><code>' + esc(m.fromHost) + '</code> → <code>' + esc(m.toHost) + '</code>' + (m.toScheme ? ' <span class="hint">(' + esc(m.toScheme) + ')</span>' : '') + '</div>' +
          '<div>Status</div><div><span class="pill' + (m.status === 'approved' ? ' ok' : m.status === 'blocked' ? ' bad' : '') + '">' + esc(m.status) + '</span> ' +
          m.confirmations + ' IP(s) · ' + m.brands + ' brand(s)' + (m.decidedBy ? ' <span class="hint">· by ' + esc(m.decidedBy) + '</span>' : '') + '</div>' +
          '<div></div><div class="flex gap-1.5"><button class="btn btn-primary" data-move="approve" data-id="' + esc(m.id) + '">Approve</button>' +
          '<button class="btn btn-danger" data-move="block" data-id="' + esc(m.id) + '">Block</button></div></div>';
      }).join('');
    }, function () { $('m-list').innerHTML = '<p class="empty">The API is not reachable.</p>'; });
  }
  $('m-refresh').addEventListener('click', refreshMoves);
  $('m-filter').addEventListener('change', refreshMoves);
  $('m-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-move]');
    if (!b) return;
    call('POST', '/' + encodeURIComponent(b.dataset.id) + '/' + b.dataset.move, { by: 'playground' }, '/dev/domain-moves')
      .then(function () { refreshMoves(); refreshPlaylists(); });
  });
  refreshMoves();

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

  // Schema: what each collection is for, and which phase made it.
  var COLLECTIONS = {
    tenants: [1, 'brands: slug, exact hosts, status, settings, which database'],
    tenantSecrets: [1, 'brand secrets, envelope-encrypted; values never leave the server'],
    trialDevices: [2, 'devices that never paid, trial running or ended'],
    devices: [2, 'paid at least once; never deleted'],
    licenses: [2, 'one row per license, kept as history'],
    playlists: [2, 'every kind in one collection, by deviceId'],
    captchas: [2, 'V4 sign-up and uid recovery; solved ones are kept'],
    domainMigrations: [2, 'provider host moves, learned from devices, approved by staff'],
    customers: [5, 'customer accounts; email unique within the brand'],
    customerTokens: [5, 'one-time email links (verify, reset), stored as hashes'],
    staffUsers: [5, 'one staff account per person for every brand'],
    roles: [5, 'named sets of permission keys; super_admin is fixed'],
    permissions: [5, 'the keys the code checks, synced on startup'],
    tenantConfig: [1, 'one document per brand: trial days, currency, contact, app, payments'],
    _migrations: [1, 'the migrations applied to this database']
  };
  var PHASE_NAME = ['', 'Foundation', 'Database', 'Core features', 'Moves and cleanup', 'Accounts and staff'];
  // "string or null" → String | null, coloured by kind, like the schema docs.
  var TYPE_NAME = { string: 'String', date: 'Date', int: 'Number', long: 'Number', double: 'Number', number: 'Number', decimal: 'Number',
    bool: 'Boolean', boolean: 'Boolean', object: 'Object', array: 'Array', objectId: 'ObjectId', enum: 'Enum', any: 'Any' };
  function typeHtml(type) {
    return type.split(' or ').map(function (t) {
      if (t === 'null') return '<span class="t-null">null</span>';
      var name = TYPE_NAME[t] || t;
      return '<span class="t-' + name.toLowerCase() + '">' + esc(name) + '</span>';
    }).join(' <span class="t-null">|</span> ');
  }
  function schemaCard(c, where, central) {
    var info = COLLECTIONS[c.name];
    var doc = (window.PG_SCHEMA_DOCS || {})[c.name] || { about: '', fields: {} };
    var about = doc.about || (info ? info[1] : 'Left over in this local database from an older branch; no migration of the current code creates it.');
    var head = '<div class="schema-head"><div class="min-w-0">' +
      '<div class="flex flex-wrap items-center gap-2">' + (info ? '<span class="phase-num p' + info[0] + '" title="Phase ' + info[0] + ' · ' + PHASE_NAME[info[0]] + '">' + info[0] + '</span>' : '<span class="pill warn">not in the current design</span>') +
      '<h3 class="font-mono text-base font-bold">' + esc(c.name) + '</h3></div>' +
      '<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">' + esc(about) + '</p></div>' +
      '<div class="flex shrink-0 items-center gap-2"><span class="schema-where ' + (central ? 'central' : '') + '">' + (central ? 'Central' : 'Per brand') + '</span>' +
      '<span class="font-mono text-xs text-slate-500">' + c.fields.length + ' fields · ' + c.rows + ' rows</span></div></div>';
    var rows = c.fields.map(function (fd) {
      var d = doc.fields[fd.name] || {};
      var rule = d.rule || '';
      if (fd.values && !rule) rule = 'one of: ' + fd.values.filter(function (v) { return v !== null; }).join(', ');
      if (fd.keys && !d.rule) rule = '{ ' + fd.keys.join(', ') + ' }';
      return '<tr><td class="f-name">' + esc(fd.name) + (fd.required ? '' : ' <span class="f-opt">optional</span>') + '</td>' +
        '<td class="f-type">' + typeHtml(fd.type) + '</td>' +
        '<td class="f-rule">' + (rule ? esc(rule) : '<span class="text-slate-400">—</span>') + '</td>' +
        '<td class="f-example" title="' + esc(fd.example === undefined ? '' : fd.example) + '">' + esc(fd.example === undefined ? '—' : fd.example) + '</td>' +
        '<td class="f-from">' + (d.from ? esc(d.from) : '<span class="text-slate-400">—</span>') + '</td></tr>';
    }).join('');
    var table = c.fields.length
      ? '<div class="overflow-x-auto"><table class="schema-table"><thead><tr><th>Field</th><th>Type</th><th>Rule</th><th>Example value</th><th>Comes from (old field)</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<p class="empty m-4">no rows yet</p>';
    var indexes = c.indexes.filter(function (ix) { return ix.name !== '_id_'; }).map(function (ix) {
      return '<span class="pill ' + (ix.unique ? 'ok' : '') + '" title="' + esc(JSON.stringify(ix.keys)) + '"><span class="mono">' + esc(ix.name) + '</span>' +
        (ix.unique ? ' · unique' : '') + (ix.partial ? ' · partial' : '') + (ix.ttlSeconds !== undefined ? ' · TTL' : '') + '</span>';
    }).join(' ');
    return '<div class="schema-card ' + (central ? 'central' : '') + '" id="schema-' + esc(c.name) + '">' + head + table +
      '<div class="schema-foot"><span class="mr-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Indexes</span>' + (indexes || '<span class="hint">only _id</span>') +
      (c.source === 'sample' ? '<span class="hint ml-auto">types read from a stored row: this collection has no validator</span>' : '') + '</div></div>';
  }
  function refreshSchema() {
    fetch('/dev/db/schema').then(function (r) { return r.json(); }).then(function (s) {
      var order = Object.keys(COLLECTIONS);
      var sort = function (list) { return list.slice().sort(function (a, b) {
        var x = order.indexOf(a.name), y = order.indexOf(b.name);
        return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
      }); };
      var brand = sort(s.brand.collections), central = sort(s.central.collections);
      var section = function (title, list, where) {
        return '<section><h3 class="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">' + esc(title) +
          ' <span class="pill mono">' + esc(where) + '</span><span class="hint">' + list.length + ' collections</span></h3><div class="space-y-3">' +
          list.map(function (c) { return schemaCard(c, where, where === s.central.database); }).join('') + '</div></section>';
      };
      $('schema-list').innerHTML = section('Each brand’s database', brand, s.brand.database) + section('Central database', central, s.central.database);
      $('schema-nav').innerHTML = '<div class="nav-label">Each brand</div>' + brand.map(function (c) {
        return '<button class="nav-item" data-view="schema" data-scroll="schema-' + esc(c.name) + '"><span class="mono truncate text-xs">' + esc(c.name) + '</span><span class="code">' + c.fields.length + '</span></button>';
      }).join('') + '<div class="nav-label">Central</div>' + central.map(function (c) {
        return '<button class="nav-item" data-view="schema" data-scroll="schema-' + esc(c.name) + '"><span class="mono truncate text-xs">' + esc(c.name) + '</span><span class="code">' + c.fields.length + '</span></button>';
      }).join('');
    }, function () { unreachable('schema-list'); });
  }
  $('schema-refresh').addEventListener('click', refreshSchema);
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


  // Accounts: customers (this brand) and staff (every brand). Sessions are bearer tokens kept here.
  var tokens = { customer: stored('customerToken'), staff: stored('staffToken') };
  function setToken(kind, value) {
    tokens[kind] = value;
    store(kind + 'Token', value || '');
    sessionPills();
  }
  function sessionPills() {
    $('cu-session').className = 'pill ' + (tokens.customer ? 'ok' : '');
    $('cu-session').textContent = tokens.customer ? 'logged in' : 'logged out';
    $('st-session').className = 'pill ' + (tokens.staff ? 'ok' : '');
    $('st-session').textContent = tokens.staff ? 'logged in' : 'logged out';
  }
  function as(kind, method, base, path, body) {
    return call(method, path, body, base, tokens[kind]).then(function (r) {
      // An ended session: forget it, so the pill says so.
      if (r.status === 401 && tokens[kind]) setToken(kind, null);
      return r;
    });
  }
  function randomEmail(who) { return who + '-' + Math.random().toString(36).slice(2, 7) + '@example.test'; }
  function val(id) { return $(id).value.trim(); }
  function outboxToken(email) {
    return fetch('/dev/outbox?to=' + encodeURIComponent(email)).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { if (!m) warn('No email for ' + email + ' in the dev outbox'); return m && m.token; });
  }

  // Customer
  if (!$('cu-email').value) $('cu-email').value = stored('customerEmail') || randomEmail('ana');
  $('cu-email').addEventListener('change', function () { store('customerEmail', val('cu-email')); });
  $('cu-random').addEventListener('click', function () { $('cu-email').value = randomEmail('ana'); store('customerEmail', val('cu-email')); });
  $('cu-signup').addEventListener('click', function () {
    store('customerEmail', val('cu-email'));
    call('POST', '/sign-up', { email: val('cu-email'), password: $('cu-password').value, firstName: val('cu-first') || null }, '/customer');
  });
  $('cu-verify').addEventListener('click', function () {
    outboxToken(val('cu-email')).then(function (token) { if (token) call('POST', '/verify-email', { token: token }, '/customer'); });
  });
  $('cu-login').addEventListener('click', function () {
    call('POST', '/login', { email: val('cu-email'), password: $('cu-password').value }, '/customer').then(function (r) {
      if (r.json.token) { setToken('customer', r.json.token); refreshCustomerDevices(); }
    });
  });
  $('cu-me').addEventListener('click', function () { as('customer', 'GET', '/customer', '/me'); });
  $('cu-logout').addEventListener('click', function () {
    as('customer', 'POST', '/customer', '/logout').then(function () { setToken('customer', null); refreshCustomerDevices(); });
  });
  $('cu-reset').addEventListener('click', function () { call('POST', '/password-reset', { email: val('cu-email') }, '/customer'); });
  $('cu-reset-confirm').addEventListener('click', function () {
    outboxToken(val('cu-email')).then(function (token) {
      if (!token) return;
      call('POST', '/password-reset/confirm', { token: token, password: $('cu-newpass').value }, '/customer').then(function (r) {
        if (r.status === 200) { $('cu-password').value = $('cu-newpass').value; setToken('customer', null); }
      });
    });
  });
  $('cu-update').addEventListener('click', function () {
    var body = {};
    if (val('cu-p-first')) body.firstName = val('cu-p-first');
    if (val('cu-p-email')) body.email = val('cu-p-email');
    if ($('cu-p-pass').value) body.newPassword = $('cu-p-pass').value;
    if ($('cu-p-current').value) body.currentPassword = $('cu-p-current').value;
    as('customer', 'PATCH', '/customer', '/me', body).then(function (r) {
      if (r.status !== 200) return;
      if (body.email) { $('cu-email').value = body.email; store('customerEmail', body.email); }
      if (body.newPassword) { $('cu-password').value = body.newPassword; setToken('customer', null); }
    });
  });
  $('cu-link').addEventListener('click', function () {
    if (!mac()) return warn('Pick a MAC at the top first');
    var key = val('cu-key') || (state.device && state.device.device.deviceKey) || '';
    as('customer', 'POST', '/customer', '/devices/link', { mac: mac(), deviceKey: key }).then(refreshCustomerDevices);
  });
  $('cu-devices-refresh').addEventListener('click', refreshCustomerDevices);
  function refreshCustomerDevices() {
    var box = $('cu-devices');
    if (!tokens.customer) { box.innerHTML = '<div class="empty">Log in to see the TVs on the account</div>'; return; }
    fetch('/customer/devices', { headers: { Authorization: 'Bearer ' + tokens.customer } }).then(function (r) { return r.json(); }).then(function (json) {
      if (!json.devices) { box.innerHTML = '<div class="empty">' + esc(json.error ? json.error.code : 'not loaded') + '</div>'; return; }
      if (!json.devices.length) { box.innerHTML = '<div class="empty">No TVs on this account</div>'; return; }
      box.innerHTML = '';
      json.devices.forEach(function (d) {
        var row = document.createElement('div');
        row.className = 'flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800';
        row.innerHTML = '<span class="mono flex-1">' + esc(d.macAddress) + '</span><span class="pill">' + esc(d.platform) + '</span>';
        var b = document.createElement('button'); b.className = 'btn btn-sm'; b.textContent = 'Remove';
        b.addEventListener('click', function () { as('customer', 'DELETE', '/customer', '/devices/' + d.id).then(refreshCustomerDevices); });
        row.appendChild(b); box.appendChild(row);
      });
    });
  }

  // Staff
  if (!$('st-root-email').value) $('st-root-email').value = stored('rootEmail') || randomEmail('root');
  if (!$('st-email').value) $('st-email').value = stored('staffEmail') || $('st-root-email').value;
  if (!$('st-pass').value) $('st-pass').value = stored('staffPass') || $('st-root-pass').value;
  if (!$('st-n-email').value) $('st-n-email').value = randomEmail('sam');
  if (!$('st-n-brands').value) $('st-n-brands').value = (stored('brand') || location.hostname.split('.')[0]);
  var challenge = null;
  $('st-root').addEventListener('click', function () {
    store('rootEmail', val('st-root-email'));
    call('POST', '/super-admin', { email: val('st-root-email'), name: 'Root', password: $('st-root-pass').value }, '/dev/staff').then(function (r) {
      if (r.status < 300) { $('st-email').value = val('st-root-email'); $('st-pass').value = $('st-root-pass').value; }
    });
  });
  $('st-login').addEventListener('click', function () {
    store('staffEmail', val('st-email')); store('staffPass', $('st-pass').value);
    call('POST', '/login', { email: val('st-email'), password: $('st-pass').value }, '/admin').then(function (r) {
      if (r.json.twoFactorRequired) { challenge = r.json.challenge; $('st-2fa-row').hidden = false; $('st-2fa-code').focus(); return; }
      if (r.json.token) { setToken('staff', r.json.token); refreshStaff(); }
    });
  });
  $('st-2fa-send').addEventListener('click', function () {
    call('POST', '/login/two-factor', { challenge: challenge || '', code: val('st-2fa-code') }, '/admin').then(function (r) {
      if (r.json.token) { setToken('staff', r.json.token); $('st-2fa-row').hidden = true; $('st-2fa-code').value = ''; refreshStaff(); }
    });
  });
  $('st-me').addEventListener('click', function () { as('staff', 'GET', '/admin', '/me'); });
  $('st-logout').addEventListener('click', function () { as('staff', 'POST', '/admin', '/logout').then(function () { setToken('staff', null); }); });
  $('st-2fa-setup').addEventListener('click', function () {
    as('staff', 'POST', '/admin', '/me/two-factor/setup').then(function (r) {
      if (!r.json.secret) return;
      $('st-2fa-secret').innerHTML = '<div class="kv"><div>Secret</div><div><code>' + esc(r.json.secret) + '</code>' + copyable(r.json.secret) +
        '</div><div>App link</div><div><code>' + esc(r.json.uri) + '</code>' + copyable(r.json.uri) + '</div></div>';
    });
  });
  $('st-2fa-on').addEventListener('click', function () { as('staff', 'POST', '/admin', '/me/two-factor/enable', { code: val('st-2fa-own') }); });
  $('st-2fa-off').addEventListener('click', function () { as('staff', 'POST', '/admin', '/me/two-factor/disable', { code: val('st-2fa-own') }); });
  $('st-view').addEventListener('click', function () {
    if (!mac()) return warn('Pick a MAC at the top first');
    as('staff', 'GET', '/admin/devices', '/' + encodeURIComponent(mac()));
  });
  $('st-activate').addEventListener('click', function () {
    if (!mac()) return warn('Pick a MAC at the top first');
    as('staff', 'POST', '/admin/devices', '/' + encodeURIComponent(mac()) + '/activate', { type: $('st-type').value })
      .then(function () { lookUp(); refreshLicense(); });
  });
  $('st-create').addEventListener('click', function () {
    var brands = val('st-n-brands').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    as('staff', 'POST', '/admin', '/staff', { email: val('st-n-email'), name: val('st-n-name'), password: $('st-n-pass').value, roleId: $('st-n-role').value, tenantAccess: brands })
      .then(function (r) { if (r.status < 300) { $('st-email').value = val('st-n-email'); $('st-pass').value = $('st-n-pass').value; $('st-n-email').value = randomEmail('sam'); refreshStaff(); } });
  });
  $('st-refresh').addEventListener('click', refreshStaff);
  $('st-role-create').addEventListener('click', function () {
    as('staff', 'POST', '/admin', '/roles', { name: val('st-role-name'), permissions: ticked($('st-role-keys')) }).then(refreshStaff);
  });
  function ticked(box) { return Array.prototype.map.call(box.querySelectorAll('input:checked'), function (i) { return i.value; }); }
  function keyBoxes(keys, chosen) {
    return keys.map(function (k) {
      return '<label class="check"><input type="checkbox" value="' + esc(k) + '"' + (chosen.indexOf(k) >= 0 ? ' checked' : '') + '> <span class="mono">' + esc(k) + '</span></label>';
    }).join('');
  }
  function getJson(path) {
    return fetch(path, { headers: { Authorization: 'Bearer ' + (tokens.staff || '') } }).then(function (r) { return r.json(); });
  }
  function refreshStaff() {
    if (!tokens.staff) {
      ['st-list', 'st-roles', 'st-perms'].forEach(function (id) { $(id).innerHTML = '<div class="empty">Log in as staff to see this</div>'; });
      return;
    }
    Promise.all([getJson('/admin/staff'), getJson('/admin/roles'), getJson('/admin/permissions')]).then(function (all) {
      renderStaff(all[0], all[1]); renderRoles(all[1], all[2]); renderPermissions(all[2]);
    });
  }
  function refused(box, json) { box.innerHTML = '<div class="empty">' + esc(json.error ? json.error.code : 'not loaded') + '</div>'; }
  function renderStaff(json, roles) {
    var box = $('st-list');
    if (roles.roles) {
      var current = $('st-n-role').value;
      $('st-n-role').innerHTML = roles.roles.map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>'; }).join('');
      $('st-n-role').value = current || 'billing';
    }
    if (!json.staff) return refused(box, json);
    box.innerHTML = '';
    json.staff.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800';
      row.innerHTML = '<span class="mono min-w-0 flex-1 truncate">' + esc(s.email) + '</span><span class="pill">' + esc(s.roleId) + '</span>' +
        '<span class="pill">' + esc(s.tenantAccess.join(', ') || 'no brands') + '</span>' +
        '<span class="pill ' + (s.status === 'active' ? 'ok' : 'bad') + '">' + esc(s.status) + '</span>' + (s.twoFactorEnabled ? '<span class="pill ok">2FA</span>' : '');
      var toggle = document.createElement('button'); toggle.className = 'btn btn-sm';
      toggle.textContent = s.status === 'active' ? 'Disable' : 'Enable';
      toggle.addEventListener('click', function () {
        as('staff', 'PATCH', '/admin', '/staff/' + s.id, { status: s.status === 'active' ? 'disabled' : 'active' }).then(refreshStaff);
      });
      row.appendChild(toggle);
      if (s.twoFactorEnabled) {
        var reset = document.createElement('button'); reset.className = 'btn btn-sm'; reset.textContent = 'Reset 2FA';
        reset.addEventListener('click', function () { as('staff', 'PATCH', '/admin', '/staff/' + s.id, { resetTwoFactor: true }).then(refreshStaff); });
        row.appendChild(reset);
      }
      box.appendChild(row);
    });
  }
  function renderRoles(json, perms) {
    var box = $('st-roles');
    var active = (perms.permissions || []).filter(function (p) { return p.active; }).map(function (p) { return p.key; });
    $('st-role-keys').innerHTML = keyBoxes(active, []);
    if (!json.roles) return refused(box, json);
    box.innerHTML = '';
    json.roles.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800';
      row.innerHTML = '<div class="flex items-center gap-2"><span class="flex-1 font-semibold">' + esc(r.name) + '</span>' +
        (r.system ? '<span class="pill ok">system: every key</span>' : '') + '</div>';
      if (!r.system) {
        var keys = document.createElement('div'); keys.className = 'row mt-2'; keys.innerHTML = keyBoxes(active, r.permissions);
        var save = document.createElement('button'); save.className = 'btn btn-sm'; save.textContent = 'Save keys';
        save.addEventListener('click', function () { as('staff', 'PATCH', '/admin', '/roles/' + r.id, { permissions: ticked(keys) }).then(refreshStaff); });
        var del = document.createElement('button'); del.className = 'btn btn-sm'; del.textContent = 'Delete';
        del.addEventListener('click', function () { as('staff', 'DELETE', '/admin', '/roles/' + r.id).then(refreshStaff); });
        keys.appendChild(save); keys.appendChild(del); row.appendChild(keys);
      }
      box.appendChild(row);
    });
  }
  function renderPermissions(json) {
    var box = $('st-perms');
    if (!json.permissions) return refused(box, json);
    box.innerHTML = '';
    json.permissions.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'row rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800';
      row.innerHTML = '<span class="mono min-w-[9rem]">' + esc(p.key) + '</span><span class="pill ' + (p.active ? 'ok' : 'bad') + '">' + (p.active ? 'active' : 'inactive') + '</span>';
      var label = document.createElement('input'); label.className = 'input max-w-[14rem]'; label.value = p.label.en;
      var save = document.createElement('button'); save.className = 'btn btn-sm'; save.textContent = 'Save label';
      save.addEventListener('click', function () { as('staff', 'PATCH', '/admin', '/permissions/' + encodeURIComponent(p.key), { label: { en: label.value, ar: p.label.ar } }); });
      row.appendChild(label); row.appendChild(save); box.appendChild(row);
    });
  }
  sessionPills();
  refreshCustomerDevices();
  refreshStaff();

  // Website (device): a TV logged in on the brand site with its MAC and device key.
  tokens.device = stored('deviceToken');
  var siteCaptchaToken = null;
  function devicePill() {
    $('dv-session').className = 'pill ' + (tokens.device ? 'ok' : '');
    $('dv-session').textContent = tokens.device ? 'logged in' : 'logged out';
  }
  function setDeviceToken(value) { tokens.device = value; store('deviceToken', value || ''); devicePill(); }
  function asDevice(method, path, body) {
    return call(method, path, body, '/device', tokens.device).then(function (r) {
      if (r.status === 401 && tokens.device) setDeviceToken(null);
      return r;
    });
  }
  // With "Show captcha answers" on, the dev route makes the same kind of captcha and fills the answer.
  function siteCaptcha() {
    if ($('reveal').checked) {
      return fetch('/dev/devices/captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'web', length: 5, revealAnswer: true })
      }).then(function (r) { return r.json(); }).then(function (c) {
        siteCaptchaToken = c.token;
        $('dv-captcha-img').innerHTML = '<img class="h-12" alt="captcha" src="' + esc(c.imageUrl) + '">';
        $('dv-answer').value = c.answer || '';
      });
    }
    return fetch('/site/captcha').then(function (r) { return r.json(); }).then(function (c) {
      siteCaptchaToken = c.token;
      $('dv-captcha-img').innerHTML = c.svg || '';
      $('dv-answer').value = '';
    });
  }
  function captchaBody() {
    var body = { token: siteCaptchaToken || '', answer: val('dv-answer') };
    siteCaptchaToken = null;
    siteCaptcha();
    return body;
  }
  $('dv-captcha').addEventListener('click', siteCaptcha);
  $('dv-login').addEventListener('click', function () {
    if (!mac()) return warn('Pick a MAC at the top first');
    var key = val('dv-key') || (state.device && state.device.device.deviceKey) || '';
    call('POST', '/login', { mac: mac(), deviceKey: key, captcha: captchaBody() }, '/device').then(function (r) {
      if (r.json.token) { setDeviceToken(r.json.token); refreshSitePlaylists(); }
    });
  });
  $('dv-me').addEventListener('click', function () { asDevice('GET', '', undefined).then(refreshSitePlaylists); });
  $('dv-logout').addEventListener('click', function () {
    asDevice('POST', '/logout').then(function () { setDeviceToken(null); refreshSitePlaylists(); });
  });
  $('dv-pl-add').addEventListener('click', function () {
    var url = val('dv-pl-url');
    var source = val('dv-pl-user')
      ? { kind: 'xtream', server: url, username: val('dv-pl-user'), password: $('dv-pl-pass').value }
      : { kind: 'link', url: url };
    asDevice('POST', '/playlists', { name: val('dv-pl-name'), source: source, pin: val('dv-pl-pin') || null }).then(refreshSitePlaylists);
  });
  $('dv-setkey').addEventListener('click', function () { asDevice('PATCH', '/key', { key: val('dv-newkey') || null }).then(lookUp); });
  $('dv-setppin').addEventListener('click', function () { asDevice('PATCH', '/parent-pin', { pin: val('dv-ppin') || null }).then(lookUp); });
  $('dv-uid').addEventListener('click', function () { asDevice('PATCH', '/uid', { uid: val('dv-uid-in') }).then(lookUp); });
  $('dv-recovery').addEventListener('click', function () { asDevice('POST', '/recovery-code'); });
  $('dv-switch').addEventListener('click', function () {
    asDevice('POST', '/switch-mac', { newMac: val('dv-newmac') }).then(function () { lookUp(); refreshLicense(); });
  });
  // Phase 7: the store's routes, called as the store does (the brand's key in a token header).
  var storeKey = stored('storeKey') || '';
  function showStoreKey() { $('st-key-pill').textContent = storeKey ? 'key set' : 'not set'; }
  showStoreKey();
  function storeCall(path, body) {
    if (!storeKey) return warn('Set the store key first');
    return call('POST', '/' + path, body, '/api', null, { token: storeKey });
  }
  function needMac() { if (!mac()) { warn('Pick a MAC at the top first'); return false; } return true; }
  function isoDay(offsetDays) { return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10); }
  $('st-until').value = isoDay(365);
  $('st-key-set').addEventListener('click', function () {
    call('POST', '/key', { key: val('st-key') }, '/dev/store').then(function (r) {
      if (r.json && r.json.key) { storeKey = r.json.key; store('storeKey', storeKey); $('st-key').value = storeKey; showStoreKey(); }
    });
  });
  $('st-validate').addEventListener('click', function () {
    if (needMac()) storeCall('validate-mac-address', { macAddress: mac() });
  });
  function activation(isTrial, until) {
    if (!needMac()) return;
    var body = { mac_address: mac(), expire_date: until, is_trial: isTrial };
    if (val('st-reseller')) body.reseller_id = val('st-reseller');
    storeCall('save-device-activation', body);
  }
  $('st-activate').addEventListener('click', function () { activation(3, val('st-until')); });
  $('st-lifetime').addEventListener('click', function () { activation(2, isoDay(0)); });
  $('st-cancel').addEventListener('click', function () { activation(0, isoDay(-1)); });
  $('st-pl-add').addEventListener('click', function () {
    if (!needMac()) return;
    var xc = !!val('st-pl-user');
    var body = { mac_address: mac(), current_playlist_url_id: -1, playlist_name: val('st-pl-name'), playlist_url: val('st-pl-url'), playlist_type: xc ? 'xc' : 'general' };
    if (xc) { body.username = val('st-pl-user'); body.password = $('st-pl-pass').value; }
    if (val('st-pl-logo')) body.logo = val('st-pl-logo');
    storeCall('save-play-list', body);
  });
  $('st-reset').addEventListener('click', function () {
    if (!needMac()) return;
    if (!val('st-devkey')) return warn('Needs the device key (on the Device card)');
    storeCall('reset-playlist', { mac_address: mac(), device_key: val('st-devkey') });
  });
  function domainScope() {
    return val('st-scope') === 'mac' ? { is_admin: false, activated_macs: [mac()] } : { is_admin: true };
  }
  $('st-domain-count').addEventListener('click', function () {
    storeCall('count-domain-updates', Object.assign({ current_domain: val('st-from') }, domainScope()));
  });
  $('st-domain-move').addEventListener('click', function () {
    storeCall('update-domain', Object.assign({ current_domain: val('st-from'), new_domain: val('st-to') }, domainScope()));
  });
  $('st-switch').addEventListener('click', function () {
    if (!needMac()) return;
    storeCall('switch-mac-address', { current_mac_address: mac(), mac_address: val('st-newmac'), allow_one_year: $('st-allow-year').checked });
  });

  $('dv-status').addEventListener('click', function () {
    if (!mac()) return warn('Pick a MAC at the top first');
    call('POST', '/device-status', { mac: mac(), captcha: captchaBody() }, '/site');
  });
  $('dv-check').addEventListener('click', function () {
    var url = val('dv-pl-url');
    var body = val('dv-pl-user') ? { server: url, username: val('dv-pl-user'), password: $('dv-pl-pass').value } : { url: url };
    call('POST', '/check-playlist', body, '/site');
  });
  $('dv-contact').addEventListener('click', function () {
    call('POST', '/contact', { email: val('dv-c-email'), message: val('dv-c-msg') }, '/site');
  });
  function refreshSitePlaylists() {
    var box = $('dv-playlists');
    if (!tokens.device) { box.innerHTML = '<div class="empty">Log in to see the playlists</div>'; return; }
    fetch('/device/playlists', { headers: { Authorization: 'Bearer ' + tokens.device } }).then(function (r) { return r.json(); }).then(function (json) {
      if (!json.playlists) { box.innerHTML = '<div class="empty">' + esc(json.error ? json.error.code : 'not loaded') + '</div>'; return; }
      if (!json.playlists.length) { box.innerHTML = '<div class="empty">No playlists</div>'; return; }
      box.innerHTML = '';
      json.playlists.forEach(function (p) {
        var row = document.createElement('div');
        row.className = 'flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800';
        row.innerHTML = '<span class="font-semibold">' + esc(p.name) + '</span><span class="pill">' + esc(p.type) + '</span>' +
          (p.protected ? '<span class="pill warn">protected</span>' : '') +
          '<span class="mono min-w-0 flex-1 truncate">' + esc(p.hidden ? '' : (p.url || (p.stalker && p.stalker.portalUrl) || '')) + '</span>';
        if (p.hidden) {
          var unlock = document.createElement('button'); unlock.className = 'btn btn-sm'; unlock.textContent = 'Unlock with PIN';
          unlock.addEventListener('click', function () { asDevice('POST', '/playlists/' + p.id + '/unlock', { pin: val('dv-pl-pin') }); });
          row.appendChild(unlock);
        }
        var del = document.createElement('button'); del.className = 'btn btn-sm'; del.textContent = 'Delete';
        del.addEventListener('click', function () {
          var pin = p.protected ? val('dv-pl-pin') : '';
          fetch('/device/playlists/' + p.id, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + tokens.device, 'Content-Type': 'application/json' },
            body: JSON.stringify(pin ? { pin: pin } : {})
          }).then(function (r) { return r.json().then(function (j) { log('DELETE', '/device/playlists/' + p.id, pin ? { pin: pin } : {}, r.status, j); }); }).then(refreshSitePlaylists);
        });
        row.appendChild(del);
        box.appendChild(row);
      });
    });
  }
  devicePill();
  refreshSitePlaylists();
  lookUp();
  refreshPlaylists();
  refreshLicense();
})();
</script>
<script src="/dev/playground/runner.js"></script>
<script src="/dev/playground/tests.js"></script>
<script src="/dev/playground/scenarios.js"></script>
<script src="/dev/playground/schema-docs.js"></script>
</body>
</html>
`;
