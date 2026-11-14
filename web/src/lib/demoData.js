// Synthetic data for demo mode and for seed/demo-data.json.
// Every value here is made up. Replace with real data from the device.
import { syntheticAcCode, syntheticNecCode, syntheticShortCode } from './ir.js';

const MIN = 60 * 1000;

function code(name, durations, createdAt) {
  return { name, n: durations.length, timings: durations.join(','), createdAt };
}

/** Room temperature model: cool at night, peaks mid-afternoon (Bangkok-ish). */
export function modelTemp(ts) {
  const d = new Date(ts);
  const h = d.getHours() + d.getMinutes() / 60;
  const daily = Math.sin(((h - 9) / 24) * 2 * Math.PI); // peak ~15:00
  const wobble = Math.sin(ts / (37 * MIN)) * 0.35 + Math.sin(ts / (11 * MIN)) * 0.15;
  return Math.round((28.2 + daily * 2.1 + wobble) * 10) / 10;
}

export function modelHum(ts, temp) {
  const wobble = Math.sin(ts / (23 * MIN)) * 2;
  return Math.max(30, Math.min(90, Math.round(78 - (temp - 26) * 4 + wobble)));
}

export function buildDemoData(now = Date.now()) {
  const t0 = now - 6 * 24 * 60 * MIN;
  const codes = {
    'c-ac-cool': code('AC Cool 25°', syntheticAcCode('AC Cool 25'), t0),
    'c-ac-off': code('AC Off', syntheticAcCode('AC Off'), t0 + MIN),
    'c-ac-fan': code('AC Fan high', syntheticAcCode('AC Fan high'), t0 + 2 * MIN),
    'c-tv-power': code('TV Power', syntheticNecCode('TV Power'), t0 + 3 * MIN),
    'c-desk-lamp': code('Desk lamp', syntheticShortCode('Desk lamp'), t0 + 4 * MIN),
  };

  // 24 h of history, one reading every 5 minutes. Keys are ms timestamps.
  const history = {};
  const step = 5 * MIN;
  const start = Math.floor((now - 24 * 60 * MIN) / step) * step;
  for (let ts = start; ts <= now; ts += step) {
    const temp = modelTemp(ts);
    history[String(ts)] = { temp, hum: modelHum(ts, temp) };
  }
  const lastTemp = modelTemp(now);

  const commands = {
    'k-001': { type: 'LEARN', name: 'Desk lamp', status: 'done', codeId: 'c-desk-lamp', createdAt: now - 190 * MIN, doneAt: now - 190 * MIN + 4200 },
    'k-002': { type: 'SEND', codeId: 'c-tv-power', status: 'error', error: 'ERR,SEND,BUSY', createdAt: now - 107 * MIN, doneAt: now - 107 * MIN + 900 },
    'k-003': { type: 'SEND', codeId: 'c-ac-cool', status: 'done', createdAt: now - 21 * MIN, doneAt: now - 21 * MIN + 640 },
  };

  return {
    codes,
    env: { latest: { temp: lastTemp, hum: modelHum(now, lastTemp), ts: now }, history },
    commands,
    rule: { threshold: 30, enabled: true, codeId: 'c-ac-cool' },
    device: { lastSeen: now },
  };
}
