import { useMemo, useState } from 'react';
import HistoryChart from './HistoryChart.jsx';
import { fmtTemp, fmtAgo, fmtFull } from '../lib/format.js';
import { useDb } from '../lib/hooks.js';

const HOUR = 3600000;
const RANGES = [
  { id: '6h', label: '6 h', ms: 6 * HOUR },
  { id: '24h', label: '24 h', ms: 24 * HOUR },
  { id: '7d', label: '7 days', ms: 7 * 24 * HOUR },
];
const STALE_MS = 2 * 60 * 1000;

export default function Station({ rule, now }) {
  const latest = useDb('env/latest');
  const [range, setRange] = useState(RANGES[1]);
  const [series, setSeries] = useState('temp');
  // Only download the range on screen. Keys are ms timestamps.
  const history = useDb('env/history', { startAtKey: String(Math.floor((now - range.ms) / 60000) * 60000) });

  const l = latest.value;
  const stale = l?.ts && now - l.ts > STALE_MS;

  const stats = useMemo(() => {
    const day = Object.entries(history.value ?? {})
      .filter(([k]) => Number(k) >= now - 24 * HOUR)
      .map(([k, v]) => ({ ts: Number(k), temp: Number(v.temp) }))
      .filter((p) => Number.isFinite(p.temp));
    if (!day.length) return null;
    const temps = day.map((p) => p.temp);
    const hourAgo = day.reduce((best, p) => (Math.abs(p.ts - (now - HOUR)) < Math.abs(best.ts - (now - HOUR)) ? p : best), day[0]);
    return {
      min: Math.min(...temps),
      max: Math.max(...temps),
      delta: Math.abs(hourAgo.ts - (now - HOUR)) < 20 * 60000 && l ? l.temp - hourAgo.temp : null,
    };
  }, [history.value, now, l]);

  const threshold = rule?.enabled && Number.isFinite(Number(rule.threshold)) ? Number(rule.threshold) : null;
  const over = threshold != null && l && l.temp > threshold;

  return (
    <section className="module m-station" aria-labelledby="station-title">
      <div className="module-head">
        <h2 id="station-title">
          <span className="fig">Table 2.</span> Room conditions
        </h2>
        <span className="head-note">DHT11 · updates every few seconds</span>
      </div>

      <div className="readout">
        <div className={`readout-main${over ? ' is-over' : ''}`}>
          <span className="readout-k">Temperature</span>
          <span className="readout-temp">
            {latest.loading ? '…' : fmtTemp(l?.temp)}
            <span className="readout-unit">°C</span>
          </span>
          <span className="readout-sub">
            {stats?.delta != null
              ? `${stats.delta >= 0 ? '+' : '−'}${Math.abs(stats.delta).toFixed(1)} °C in the last hour`
              : 'Change over the last hour: –'}
          </span>
        </div>
        <dl className="readout-cells">
          <div>
            <dt>Humidity</dt>
            <dd>{l?.hum != null ? `${Math.round(l.hum)} %` : '–'}</dd>
          </div>
          <div>
            <dt>24 h range</dt>
            <dd>{stats ? `${fmtTemp(stats.min)}–${fmtTemp(stats.max)}` : '–'}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd className={stale ? 'st-err' : undefined} title={l?.ts ? fmtFull(l.ts) : undefined}>
              {l?.ts ? (stale ? `Stale · ${fmtAgo(l.ts, now)}` : fmtAgo(l.ts, now)) : 'No data yet'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="figure">
        <div className="figure-bar">
          <div className="seg" role="tablist" aria-label="Series">
            {[
              ['temp', 'Temperature'],
              ['hum', 'Humidity'],
            ].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={series === id} onClick={() => setSeries(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="seg" role="tablist" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r.id} role="tab" aria-selected={range.id === r.id} onClick={() => setRange(r)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <HistoryChart history={history.value} series={series} rangeMs={range.ms} threshold={threshold} now={now} />
        <p className="caption">
          <span className="fig">Figure 1.</span> {series === 'temp' ? 'Room temperature, °C' : 'Relative humidity, %'}, last{' '}
          {range.label}.{series === 'temp' && threshold != null && ' Dashed red line: automation rule threshold.'}
          {series === 'temp' && ' Background bands shade cooler readings blue-grey and warmer ones red.'}
        </p>
      </div>
    </section>
  );
}
