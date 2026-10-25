// Read-only scan of an old Express backend for unused code. Usage: node analyze-unused.cjs <repoDir> <outJson>
const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2]);
const out = process.argv[3];
const SKIP = new Set(['node_modules', 'public', '.git', 'iboplayer', 'postman']);

function walk(dir, exts, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, acc);
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
}
const rel = (p) => path.relative(repo, p).replace(/\\/g, '/');
const read = (p) => fs.readFileSync(p, 'utf8');

// Remove comments (rough but good enough: // to end of line when not inside a string-ish URL, and /* */ blocks).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const jsFiles = walk(repo, ['.js']);
const ejsFiles = walk(repo, ['.ejs']);
const code = new Map(jsFiles.map((f) => [f, stripComments(read(f))]));
const raw = new Map(jsFiles.map((f) => [f, read(f)]));
const allCode = [...code.values()].join('\n');
const allEjs = ejsFiles.map(read).join('\n');

// 1. Controller exports, duplicates
const controllerDir = path.join(repo, 'controllers');
const controllers = {};
for (const f of walk(controllerDir, ['.js'])) {
  const src = code.get(f);
  const names = [...src.matchAll(/(?:module\.)?exports\.(\w+)\s*=/g)].map((m) => m[1]);
  const counts = names.reduce((a, n) => ((a[n] = (a[n] || 0) + 1), a), {});
  controllers[path.basename(f, '.js')] = { file: rel(f), names: [...new Set(names)], dupes: Object.keys(counts).filter((n) => counts[n] > 1) };
}

// 2. References to controller functions (outside comments), and broken references
const refCount = {}; // "Ctrl.name" -> count
const broken = [];
for (const [f, src] of code) {
  const aliases = {};
  for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"`](?:\.\.?\/)+controllers\/(\w+)(?:\.js)?['"`]\s*\)/g)) aliases[m[1]] = m[2];
  for (const [alias, ctrl] of Object.entries(aliases)) {
    for (const m of src.matchAll(new RegExp(`\\b${alias}\\.(\\w+)`, 'g'))) {
      const key = `${ctrl}.${m[1]}`;
      refCount[key] = (refCount[key] || 0) + 1;
      if (controllers[ctrl] && !controllers[ctrl].names.includes(m[1])) {
        const line = src.slice(0, m.index).split('\n').length;
        broken.push({ file: rel(f), line, ref: key });
      }
    }
  }
}
for (const [, src] of code) {
  for (const m of src.matchAll(/require\(\s*['"`](?:\.\.?\/)+controllers\/(\w+)(?:\.js)?['"`]\s*\)\s*\.(\w+)/g)) {
    refCount[`${m[1]}.${m[2]}`] = (refCount[`${m[1]}.${m[2]}`] || 0) + 1;
  }
}
// Calls inside the same controller: exports.foo(...) or module.exports.foo or this.foo
for (const [ctrl, info] of Object.entries(controllers)) {
  const src = code.get(path.join(repo, info.file));
  for (const n of info.names) {
    const internal = [...src.matchAll(new RegExp(`(?:exports|this)\\.${n}\\b(?!\\s*=[^=])`, 'g'))].length;
    if (internal) refCount[`${ctrl}.${n}`] = (refCount[`${ctrl}.${n}`] || 0) + internal;
  }
}
const unusedHandlers = {};
for (const [ctrl, info] of Object.entries(controllers)) {
  unusedHandlers[ctrl] = info.names.filter((n) => !refCount[`${ctrl}.${n}`]);
}

// 3. Commented-out routes
const commentedRoutes = [];
for (const f of walk(path.join(repo, 'routes'), ['.js'])) {
  raw.get(f).split('\n').forEach((line, i) => {
    if (/^\s*\/\/\s*router\.(get|post|put|patch|delete|all|use)\(/.test(line)) commentedRoutes.push({ file: rel(f), line: i + 1, text: line.trim().slice(0, 140) });
  });
}
// Routes registered after module.exports in a routes file
const lateRoutes = [];
for (const f of walk(path.join(repo, 'routes'), ['.js'])) {
  const src = code.get(f);
  const idx = src.indexOf('module.exports');
  if (idx >= 0) for (const m of src.slice(idx).matchAll(/router\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)/g)) lateRoutes.push({ file: rel(f), route: `${m[1].toUpperCase()} ${m[2]}` });
}

// 4. Models, utils not required anywhere; views not rendered/included
function unusedModules(dir) {
  if (!fs.existsSync(dir)) return [];
  return walk(dir, ['.js']).filter((f) => {
    const name = path.basename(f, '.js');
    const others = [...code.entries()].filter(([p]) => p !== f).map(([, s]) => s).join('\n');
    const required = new RegExp(`require\\([^)]*\\b${name}(?:\\.js)?['"\`]`).test(others);
    const byModelName = new RegExp(`model\\(\\s*['"\`]${name}['"\`]`).test(others) || new RegExp(`models\\.${name}\\b|models\\[['"\`]${name}['"\`]\\]`).test(others);
    return !required && !byModelName;
  }).map(rel);
}
const unusedModels = unusedModules(path.join(repo, 'models'));
const unusedUtils = unusedModules(path.join(repo, 'utils'));

const viewsDir = path.join(repo, 'views');
const rendered = new Set();
for (const m of (allCode + '\n' + allEjs).matchAll(/(?:render\(|include\(|layout:)\s*['"`]([^'"`$]+)['"`]/g)) rendered.add(m[1].replace(/^\.?\//, '').replace(/\.ejs$/, ''));
const unusedViews = ejsFiles
  .filter((f) => f.startsWith(viewsDir))
  .filter((f) => {
    const v = path.relative(viewsDir, f).replace(/\\/g, '/').replace(/\.ejs$/, '');
    const base = path.basename(v);
    return ![...rendered].some((r) => r === v || r.endsWith('/' + v) || v.endsWith('/' + r) || r.split('/').pop() === base);
  })
  .map(rel);

// 5. npm dependencies never required
const pkg = JSON.parse(read(path.join(repo, 'package.json')));
const scripts = Object.values(pkg.scripts || {}).join(' ');
const unusedDeps = Object.keys(pkg.dependencies || {}).filter((d) => !scripts.includes(d) && !new RegExp(`['"\`]${d}['"\`]`).test(allCode.replace(/require\([^)]*\)/g, '')) && !new RegExp(`require\\(\\s*['"\`]${d.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?:/[^'"\`]*)?['"\`]`).test(allCode) && !new RegExp(`from\\s+['"\`]${d}['"\`]`).test(allCode));

// 6. Root scripts (not server.js / config) — likely one-off tools
const rootScripts = fs.readdirSync(repo).filter((n) => n.endsWith('.js') && !['server.js', 'passport-config.js'].includes(n));

const report = {
  repo: path.basename(repo),
  controllers: Object.fromEntries(Object.entries(controllers).map(([c, i]) => [c, { exported: i.names.length, unused: unusedHandlers[c], definedTwice: i.dupes }])),
  brokenRefs: broken,
  commentedRoutes,
  lateRoutes,
  unusedModels,
  unusedUtils,
  unusedViews,
  unusedDeps,
  rootScripts,
};
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(report.repo, '| unused handlers:', Object.values(unusedHandlers).flat().length, '| broken refs:', broken.length, '| commented routes:', commentedRoutes.length, '| late routes:', lateRoutes.length, '| models:', unusedModels.length, '| utils:', unusedUtils.length, '| views:', unusedViews.length, '| deps:', unusedDeps.length);
