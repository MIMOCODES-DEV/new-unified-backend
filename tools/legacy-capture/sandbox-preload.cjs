// Loaded with `node -r` into every old backend process (and its cluster workers, which inherit execArgv).
// 1. Blocks every outbound TCP connection except to this machine: no Cloudflare (the old code has a real
//    hardcoded key), no production iboplayer.com / bobplayers.com lookups, no payment providers, no email.
// 2. Reports one CPU so the old cluster code forks a single worker instead of up to 24.
const net = require('net');
const os = require('os');

const LOCAL = new Set(['127.0.0.1', 'localhost', '::1', '::ffff:127.0.0.1']);
const original = net.Socket.prototype.connect;

net.Socket.prototype.connect = function connect(...args) {
  let host = 'localhost';
  let port;
  const first = args[0];
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    if (first.path) return original.apply(this, args); // unix socket / named pipe
    host = first.host || 'localhost';
    port = first.port;
  } else {
    port = first;
    if (typeof args[1] === 'string') host = args[1];
  }
  if (!LOCAL.has(String(host).toLowerCase())) {
    const error = Object.assign(new Error(`[sandbox] blocked outbound connection to ${host}:${port}`), { code: 'ECONNREFUSED' });
    process.stderr.write(`${error.message}\n`);
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return original.apply(this, args);
};

const oneCpu = os.cpus().slice(0, 1);
os.cpus = () => oneCpu;

// 3. The old backends use bcrypt 5.x, whose native build has no prebuilt binary for Node 24.
//    bcryptjs is a pure-JS drop-in with the same API and compatible hashes; redirect `require('bcrypt')` to it.
const Module = require('module');
const bcryptjs = require.resolve('bcryptjs');
const resolve = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, ...rest) {
  return request === 'bcrypt' ? bcryptjs : resolve.call(this, request, ...rest);
};
