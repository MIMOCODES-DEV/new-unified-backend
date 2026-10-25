// CAP-06: read-only, privacy-masking profiler for the old backends' MongoDB databases.
//
// READ-ONLY: uses only listCollections, listIndexes, estimatedDocumentCount, find and aggregate
// (no $out / $merge). It never prints values of sensitive fields — only their formats.
//
// Usage: node tools/legacy-analysis/profile-database.cjs <mongoUri> <outDir> <db> [db...]
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const [uri, outDir, ...dbNames] = process.argv.slice(2);
if (!uri || !outDir || dbNames.length === 0) {
  console.error('Usage: node profile-database.cjs <mongoUri> <outDir> <db> [db...]');
  process.exit(1);
}

const SAMPLE_SIZE = 50_000;
const SENSITIVE = /mac|email|pass|user|url|host|^ip|_ip|ip_|token|key|secret|phone|name|pin|code|address|portal|epg|uid|whatsapp|logo|domain|dns|signature|order|card|note|message|subject|answer|question|content|title|description/i;
const ENUM_MAX_DISTINCT = 20;
const ENUM_MAX_LENGTH = 24;
const FALLBACK_MACS = ['52:54:00:12:34:57', '52:54:00:12:34:59'];
const TODAY = new Date().toISOString().slice(0, 10);

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const fmt = (n) => n.toLocaleString('en-US');

function bsonType(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'missing';
  if (Array.isArray(v)) return 'array';
  if (v instanceof ObjectId) return 'objectId';
  if (v instanceof Date) return 'date';
  if (typeof v === 'object' && v._bsontype) return v._bsontype.toLowerCase();
  return typeof v;
}

function stringFormat(s) {
  if (s === '') return 'empty';
  if (/^[0-9a-f]{24}$/i.test(s)) return 'objectId-hex';
  if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(s)) return 'mac aa:bb (lower)';
  if (/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(s)) return 'mac AA:BB (upper)';
  if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(s)) return 'mac mixed case';
  if (/^([0-9a-f]{2}-){5}[0-9a-f]{2}$/i.test(s)) return 'mac aa-bb';
  if (/^[0-9a-f]{12}$/i.test(s)) return 'mac aabbcc (no separators)';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'date YYYY-MM-DD';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return 'date YYYY-M-D (unpadded)';
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return 'datetime ISO';
  if (/^\d{4}-\d{1,2}-\d{1,2} \d/.test(s)) return 'datetime "YYYY-MM-DD HH:mm"';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return 'date D/M/YYYY';
  if (/^-?\d+$/.test(s)) return 'integer-as-string';
  if (/^-?\d+\.\d+$/.test(s)) return 'decimal-as-string';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return 'email';
  if (/^https?:\/\//i.test(s)) return 'url';
  if (/^[{[]/.test(s)) return 'json-like';
  return 'text';
}

/** Field profile: presence, types, string formats and (for safe low-cardinality fields) values. */
function profileFields(docs) {
  const fields = new Map();
  const touch = (p) => {
    if (!fields.has(p)) fields.set(p, { present: 0, types: new Map(), formats: new Map(), values: new Map(), lengths: [] });
    return fields.get(p);
  };
  const visit = (doc, prefix, depth) => {
    for (const [k, v] of Object.entries(doc)) {
      const p = prefix ? `${prefix}.${k}` : k;
      const f = touch(p);
      f.present++;
      const t = bsonType(v);
      f.types.set(t, (f.types.get(t) ?? 0) + 1);
      if (t === 'string') {
        const sf = stringFormat(v);
        f.formats.set(sf, (f.formats.get(sf) ?? 0) + 1);
      }
      if (['string', 'number', 'boolean', 'null'].includes(t) && f.values.size <= ENUM_MAX_DISTINCT + 1) {
        const key = t === 'string' ? JSON.stringify(v) : String(v);
        if (key.length <= ENUM_MAX_LENGTH) f.values.set(key, (f.values.get(key) ?? 0) + 1);
        else f.values.set('__long__', 0);
      }
      if (t === 'array') {
        f.lengths.push(v.length);
        if (depth < 1) for (const el of v.slice(0, 5)) if (el && typeof el === 'object' && !(el instanceof ObjectId) && !(el instanceof Date)) visit(el, `${p}[]`, depth + 1);
      } else if (t === 'object' && depth < 1) {
        visit(v, p, depth + 1);
      }
    }
  };
  for (const d of docs) visit(d, '', 0);
  return fields;
}

function renderFields(fields, total) {
  const rows = [...fields.entries()].sort(([a], [b]) => a.localeCompare(b));
  const out = ['| Field | Present | Types | String formats | Values |', '|---|---|---|---|---|'];
  for (const [p, f] of rows) {
    const types = [...f.types.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${pct(n, f.present)}`).join(', ');
    const formats = [...f.formats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => `${t} ${pct(n, f.present)}`).join(', ');
    const leaf = p.split('.').pop().replace('[]', '');
    const showValues = !SENSITIVE.test(leaf) && !f.values.has('__long__') && f.values.size > 0 && f.values.size <= ENUM_MAX_DISTINCT;
    const values = showValues ? [...f.values.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `\`${v}\` ${fmt(n)}`).join(', ') : (f.values.size > ENUM_MAX_DISTINCT || f.values.has('__long__') ? 'many' : SENSITIVE.test(leaf) ? 'hidden' : '');
    out.push(`| \`${p}\` | ${pct(f.present, total)} | ${types} | ${formats} | ${values} |`);
  }
  return out.join('\n');
}

const normMac = (m) => (typeof m === 'string' ? m.toLowerCase().replace(/[^0-9a-f]/g, '') : null);

async function checks(db, names) {
  const lines = [];
  const has = (n) => names.includes(n);

  if (has('devices')) {
    const devices = db.collection('devices');
    const byMac = new Map();
    const byMacApp = new Map();
    const deviceIds = new Set();
    let fallback = 0, noMac = 0, lifetimePast = 0, lifetimeTotal = 0, missingAppType = 0;
    const appTypeCase = new Map();
    const resellerTypes = new Map();
    const trialExpiry = new Map();
    for await (const d of devices.find({}, { projection: { mac_address: 1, app_type: 1, is_trial: 1, expire_date: 1, reseller_id: 1 } })) {
      deviceIds.add(String(d._id));
      const m = normMac(d.mac_address);
      if (!m) noMac++;
      else {
        byMac.set(m, (byMac.get(m) ?? 0) + 1);
        const ma = `${m}|${String(d.app_type ?? '').toLowerCase()}`;
        byMacApp.set(ma, (byMacApp.get(ma) ?? 0) + 1);
      }
      if (typeof d.mac_address === 'string' && FALLBACK_MACS.includes(d.mac_address.toLowerCase())) fallback++;
      if (d.app_type == null) missingAppType++;
      else if (typeof d.app_type === 'string') {
        const lower = d.app_type.toLowerCase();
        const set = appTypeCase.get(lower) ?? new Set();
        set.add(d.app_type);
        appTypeCase.set(lower, set);
      }
      const rt = d.reseller_id === undefined ? 'missing' : d.reseller_id === null ? 'null' : typeof d.reseller_id === 'string' ? (/^[0-9a-f]{24}$/i.test(d.reseller_id) ? 'objectId-string' : /^\d+$/.test(d.reseller_id) ? 'numeric-string' : 'other-string') : bsonType(d.reseller_id);
      resellerTypes.set(rt, (resellerTypes.get(rt) ?? 0) + 1);
      const exp = d.expire_date instanceof Date ? d.expire_date.toISOString().slice(0, 10) : typeof d.expire_date === 'string' ? d.expire_date.slice(0, 10) : null;
      const past = exp ? exp < TODAY : null;
      const key = `${d.is_trial ?? 'missing'} / ${past === null ? 'no expiry' : past ? 'expired' : 'future'}`;
      trialExpiry.set(key, (trialExpiry.get(key) ?? 0) + 1);
      if (d.is_trial === 2 || d.is_trial === '2') {
        lifetimeTotal++;
        if (past) lifetimePast++;
      }
    }
    const dupGroups = [...byMac.values()].filter((n) => n > 1);
    const dupMacApp = [...byMacApp.values()].filter((n) => n > 1);
    const caseVariants = [...appTypeCase.entries()].filter(([, s]) => s.size > 1).map(([k, s]) => `${k}: ${[...s].map((x) => `\`${x}\``).join(' / ')}`);
    lines.push('### devices');
    lines.push(`- Devices: **${fmt(deviceIds.size)}**`);
    lines.push(`- Same MAC (normalized) in several rows: **${fmt(dupGroups.length)} MACs**, ${fmt(dupGroups.reduce((a, n) => a + n - 1, 0))} extra rows`);
    lines.push(`- Same MAC + app type in several rows: **${fmt(dupMacApp.length)}**`);
    lines.push(`- Rows on a fallback MAC (${FALLBACK_MACS.join(', ')}): **${fmt(fallback)}**`);
    lines.push(`- Rows without a usable MAC: ${fmt(noMac)}`);
    lines.push(`- Missing app_type: ${fmt(missingAppType)}${caseVariants.length ? ` · case variants: ${caseVariants.join('; ')}` : ''}`);
    lines.push(`- "Lifetime" (is_trial 2) with an expiry date in the past: **${fmt(lifetimePast)} of ${fmt(lifetimeTotal)}**`);
    lines.push(`- reseller_id types: ${[...resellerTypes.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${fmt(n)}`).join(', ')}`);
    lines.push('', '| is_trial / expiry | Devices |', '|---|---|', ...[...trialExpiry.entries()].sort().map(([k, n]) => `| ${k} | ${fmt(n)} |`));

    if (has('playlists')) {
      let total = 0, orphans = 0, noDevice = 0;
      const idTypes = new Map();
      for await (const p of db.collection('playlists').find({}, { projection: { device_id: 1 } })) {
        total++;
        const t = p.device_id instanceof ObjectId ? 'objectId' : typeof p.device_id === 'string' ? 'string' : bsonType(p.device_id);
        idTypes.set(t, (idTypes.get(t) ?? 0) + 1);
        if (p.device_id == null) noDevice++;
        else if (!deviceIds.has(String(p.device_id))) orphans++;
      }
      lines.push('', '### playlists');
      lines.push(`- Playlists: **${fmt(total)}**`);
      lines.push(`- Orphans (device_id points at no device): **${fmt(orphans)} (${pct(orphans, total)})**`);
      lines.push(`- Without device_id: ${fmt(noDevice)} · device_id types: ${[...idTypes.entries()].map(([t, n]) => `${t} ${fmt(n)}`).join(', ')}`);
    }
  }

  if (has('settings')) {
    const keys = new Map();
    for await (const s of db.collection('settings').find({}, { projection: { key: 1 } })) keys.set(s.key, (keys.get(s.key) ?? 0) + 1);
    const dups = [...keys.entries()].filter(([, n]) => n > 1);
    lines.push('', '### settings');
    lines.push(`- Keys: ${fmt(keys.size)} · duplicated keys: **${dups.length}**${dups.length ? ` (${dups.map(([k, n]) => `\`${k}\` ×${n}`).join(', ')})` : ''}`);
  }

  if (has('transactions')) {
    const payTime = new Map();
    const deviceRef = new Map();
    let total = 0;
    for await (const t of db.collection('transactions').find({}, { projection: { pay_time: 1, device_id: 1 } })) {
      total++;
      const pf = t.pay_time instanceof Date ? 'date' : typeof t.pay_time === 'string' ? stringFormat(t.pay_time) : bsonType(t.pay_time);
      payTime.set(pf, (payTime.get(pf) ?? 0) + 1);
      const d = t.device_id;
      const rf = d instanceof ObjectId ? 'objectId' : typeof d !== 'string' ? bsonType(d) : /^[0-9a-f]{24}$/i.test(d) ? 'device id (string)' : d.startsWith('{') ? 'JSON {email,count}' : d.startsWith('reseller/') ? 'reseller/<email>/<n>' : d.endsWith('_reseller') ? '<adminId>_reseller' : 'other string';
      deviceRef.set(rf, (deviceRef.get(rf) ?? 0) + 1);
    }
    lines.push('', '### transactions');
    lines.push(`- Transactions: ${fmt(total)}`);
    lines.push(`- pay_time formats: ${[...payTime.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${fmt(n)}`).join(', ')}`);
    lines.push(`- device_id holds: ${[...deviceRef.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${fmt(n)}`).join(', ')}`);
  }
  return lines.join('\n');
}

async function profileDb(client, name) {
  const db = client.db(name);
  const cols = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  const summary = [];
  const sections = [];
  for (const c of cols) {
    const col = db.collection(c);
    const count = await col.estimatedDocumentCount();
    const indexes = (await col.listIndexes().toArray()).map((i) => `${i.name}${i.unique ? ' (unique)' : ''}`);
    summary.push(`| \`${c}\` | ${fmt(count)} | ${indexes.join(', ')} |`);
    if (count === 0) continue;
    const docs = count > SAMPLE_SIZE ? await col.aggregate([{ $sample: { size: SAMPLE_SIZE } }]).toArray() : await col.find({}).toArray();
    sections.push(`## \`${c}\` · ${fmt(count)} documents${count > SAMPLE_SIZE ? ` (field profile from a random sample of ${fmt(SAMPLE_SIZE)})` : ''}\n\n${renderFields(profileFields(docs), docs.length)}`);
  }
  const checkText = await checks(db, cols);
  const md = [
    `# Data profile: \`${name}\``,
    '',
    `> Generated ${new Date().toISOString().slice(0, 10)} by \`tools/legacy-analysis/profile-database.cjs\` — read-only. Sensitive fields (MACs, emails, URLs, credentials, names, IPs…) show formats only, never values.`,
    '',
    '## Collections',
    '',
    '| Collection | Documents | Indexes |',
    '|---|---|---|',
    ...summary,
    '',
    checkText ? `## Checks\n\n${checkText}\n` : '',
    ...sections.map((s) => `${s}\n`),
  ].join('\n');
  fs.writeFileSync(path.join(outDir, `${name}.md`), md);
  return { name, collections: cols.length, docs: summary.length };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 5000, readPreference: 'secondaryPreferred' });
  try {
    for (const name of dbNames) {
      const t = Date.now();
      await profileDb(client, name);
      console.log(`${name} profiled in ${((Date.now() - t) / 1000).toFixed(1)}s`);
    }
  } finally {
    await client.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
