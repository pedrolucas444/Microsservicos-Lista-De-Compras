const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'registry.json');

function _read() {
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({}), 'utf8');
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function _write(obj) {
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), 'utf8');
}

function register(serviceName, host, port) {
  const all = _read();
  all[serviceName] = { host, port, lastSeen: Date.now() };
  _write(all);
  console.log(`[Registry] ${serviceName} registrado em ${host}:${port}`);
}

function unregister(serviceName) {
  const all = _read();
  if (all[serviceName]) {
    delete all[serviceName];
    _write(all);
    console.log(`[Registry] ${serviceName} removido`);
  }
}

function get(serviceName) {
  const all = _read();
  return all[serviceName];
}

function getAll() {
  return _read();
}

module.exports = { register, unregister, get, getAll };