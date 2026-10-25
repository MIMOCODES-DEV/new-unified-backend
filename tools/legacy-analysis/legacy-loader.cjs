// Loads functions from the old code unchanged and runs them in a sandbox (shared by the CAP tools).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const CryptoJS = require('crypto-js');

// Deterministic Math.random (mulberry32).
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Extracts `function name(...) {...}` or `global.name = function (...) {...}` source by brace matching. */
function extract(src, name, file) {
  const patterns = [new RegExp(`^\\s*function ${name}\\s*\\(`, 'm'), new RegExp(`global\\.${name}\\s*=\\s*function`, 'm')];
  for (const p of patterns) {
    const m = p.exec(src);
    if (!m) continue;
    let depth = 0;
    for (let j = src.indexOf('{', m.index); j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) {
        const body = src.slice(m.index, j + 1).trim();
        return body.startsWith('global.') ? `var ${name} = ${body.slice(body.indexOf('function'))}` : body;
      }
    }
  }
  throw new Error(`${name} not found in ${file}`);
}

function sandbox(seed, extra = {}) {
  return vm.createContext({
    Buffer,
    console: { log() {}, error() {} },
    JSON,
    String,
    parseInt,
    isNaN,
    // Like a browser: btoa only accepts Latin-1 and throws on anything else.
    btoa: (s) => {
      if (/[^\u0000-ÿ]/.test(s)) throw new Error('InvalidCharacterError: btoa received a non-Latin-1 character');
      return Buffer.from(s, 'latin1').toString('base64');
    },
    atob: (s) => Buffer.from(s, 'base64').toString('latin1'),
    escape,
    decodeURIComponent,
    Math: Object.assign(Object.create(Math), { random: seededRandom(seed) }),
    CryptoJS,
    AES: CryptoJS.AES,
    ...extra,
  });
}

/** A TV app's own request encoder and response decoder (app_src/js/common.js). */
function loadApp(tvAppsDir, name, seed) {
  const common = fs.readFileSync(path.join(tvAppsDir, name, 'app_src', 'js', 'common.js'), 'utf8');
  const ctx = sandbox(seed);
  const fns = ['getAtob', 'getEncryptKey', 'getEncryptKeyPosition', 'getEncryptPositionChar', 'encryptRequest', 'decryptResponse'];
  vm.runInContext(fns.map((f) => extract(common, f, `${name}/common.js`)).join('\n'), ctx);
  return ctx;
}

module.exports = { seededRandom, extract, sandbox, loadApp };
