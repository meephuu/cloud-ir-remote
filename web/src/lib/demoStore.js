// In-browser stand-in for Firebase Realtime Database, plus a fake device.
// Used when no Firebase config is set (see .env.example). Data is kept in
// localStorage so renames and new buttons survive a reload.
import { buildDemoData, modelTemp, modelHum } from './demoData.js';
import { syntheticAcCode } from './ir.js';

const STORAGE_KEY = 'cloud-ir-remote.demo.v1';
const MIN = 60 * 1000;

const split = (path) => path.split('/').filter(Boolean);

function getAt(tree, path) {
  let node = tree;
  for (const part of split(path)) {
    if (node == null || typeof node !== 'object') return null;
    node = node[part];
  }
  return node === undefined ? null : node;
}

function setAt(tree, path, value) {
  const parts = split(path);
  let node = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    if (node[parts[i]] == null || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
    node = node[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === null || value === undefined) delete node[last];
  else node[last] = value;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage blocked: start fresh */
  }
  return null;
}

let pushCounter = 0;
function pushKey() {
  pushCounter = (pushCounter + 1) % 1000;
  return `d-${Date.now().toString(36)}-${pushCounter.toString(36).padStart(2, '0')}`;
}

export function createDemoStore() {
  let tree = load() ?? buildDemoData();
  const listeners = new Set();
  let saveTimer = null;

  // Old saved demo data: refill history so the graph is never empty.
  backfillHistory();

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
      } catch {
        /* ignore */
      }
    }, 300);
  }

  function snapshot(l) {
    let value = getAt(tree, l.path);
    if (value && typeof value === 'object' && (l.opts.startAtKey != null || l.opts.limitLast != null)) {
      let keys = Object.keys(value).sort();
      if (l.opts.startAtKey != null) keys = keys.filter((k) => k >= String(l.opts.startAtKey));
      if (l.opts.limitLast != null) keys = keys.slice(-l.opts.limitLast);
      value = Object.fromEntries(keys.map((k) => [k, value[k]]));
      if (!keys.length) value = null;
    }
    return value == null ? null : structuredClone(value);
  }

  function notify(changedPath) {
    const changed = split(changedPath).join('/');
    for (const l of listeners) {
      const lp = split(l.path).join('/');
      if (changed.startsWith(lp) || lp.startsWith(changed) || lp === '' || changed === '') {
        const value = snapshot(l);
        queueMicrotask(() => listeners.has(l) && l.cb(value));
      }
    }
    save();
  }

  function write(path, value) {
    setAt(tree, path, value == null ? null : structuredClone(value));
    notify(path);
  }

  function backfillHistory() {
    const now = Date.now();
    const step = 5 * MIN;
    tree.env ??= {};
    tree.env.history ??= {};
    const keys = Object.keys(tree.env.history).sort();
    const last = keys.length ? Number(keys[keys.length - 1]) : 0;
    let ts = Math.max(last + step, Math.floor((now - 24 * 60 * MIN) / step) * step);
    for (; ts <= now; ts += step) {
      const temp = modelTemp(ts);
      tree.env.history[String(ts)] = { temp, hum: modelHum(ts, temp) };
    }
    // Keep about 7 days.
    const cutoff = String(now - 7 * 24 * 60 * MIN);
    for (const k of Object.keys(tree.env.history)) if (k < cutoff) delete tree.env.history[k];
  }

  const api = {
    mode: 'demo',
    on(path, cb, opts = {}) {
      const l = { path, cb, opts };
      listeners.add(l);
      const value = snapshot(l);
      queueMicrotask(() => listeners.has(l) && cb(value));
      return () => listeners.delete(l);
    },
    async set(path, value) {
      write(path, value);
    },
    async update(path, partial) {
      for (const [k, v] of Object.entries(partial)) setAt(tree, `${path}/${k}`, v == null ? null : structuredClone(v));
      notify(path);
    },
    async remove(path) {
      write(path, null);
    },
    async push(path, value) {
      const key = pushKey();
      write(`${path}/${key}`, value);
      return key;
    },
    timestamp: () => Date.now(),
    reset() {
      tree = buildDemoData();
      notify('');
    },
  };

  startFakeDevice(api, () => tree);
  return api;
}

// ---------------------------------------------------------------------------
// Fake device: does what the ESP32 + STM32 will do, with realistic delays.

function startFakeDevice(api, getTree) {
  const busy = new Set();

  api.on('commands', (commands) => {
    if (!commands) return;
    for (const [id, cmd] of Object.entries(commands)) {
      if (cmd.status !== 'pending' || busy.has(id)) continue;
      busy.add(id);
      if (cmd.type === 'SEND') {
        const code = getTree().codes?.[cmd.codeId];
        setTimeout(() => {
          busy.delete(id);
          if (!code) api.update(`commands/${id}`, { status: 'error', error: 'Code not found', doneAt: Date.now() });
          else api.update(`commands/${id}`, { status: 'done', doneAt: Date.now() });
        }, 700 + Math.random() * 500);
      } else if (cmd.type === 'LEARN') {
        // Names containing "fail" simulate nobody pressing the remote.
        const fails = /fail/i.test(cmd.name ?? '');
        setTimeout(() => {
          busy.delete(id);
          if (fails) {
            api.update(`commands/${id}`, { status: 'error', error: 'ERR,LEARN,TIMEOUT', doneAt: Date.now() });
            return;
          }
          const durations = syntheticAcCode(`${cmd.name}-${Date.now()}`);
          const codeId = `c-${Date.now().toString(36)}`;
          api.set(`codes/${codeId}`, { name: cmd.name, n: durations.length, timings: durations.join(','), createdAt: Date.now() });
          api.update(`commands/${id}`, { status: 'done', codeId, doneAt: Date.now() });
        }, 3500 + Math.random() * 1500);
      }
    }
  });

  // Sensor + heartbeat: latest every 5 s, history every 5 min.
  const tick = () => {
    const now = Date.now();
    const temp = Math.round((modelTemp(now) + (Math.random() - 0.5) * 0.2) * 10) / 10;
    const hum = modelHum(now, temp);
    api.set('env/latest', { temp, hum, ts: now });
    api.set('device/lastSeen', now);
    const keys = Object.keys(getTree().env?.history ?? {}).sort();
    const last = keys.length ? Number(keys[keys.length - 1]) : 0;
    if (now - last >= 5 * MIN) api.set(`env/history/${now}`, { temp, hum });
  };
  tick();
  setInterval(tick, 5000);
}
