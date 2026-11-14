import { useMemo, useState } from 'react';
import { useWidth } from '../lib/hooks.js';
import { fmtTemp, fmtTime, fmtWhen } from '../lib/format.js';

const M = { top: 14, right: 14, bottom: 26, left: 40 };
const GAP_MS = 20 * 60 * 1000; // break the line where readings are missing

// Temperature bands, bulletin style, in the datasheet palette:
// cool readings sit on blue-grey, warm ones on a red tint.
const COOL = [222, 230, 240];
const MID = [255, 255, 255];
const WARM = [248, 218, 223];
function bandColor(t) {
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const k = Math.max(-1, Math.min(1, (t - 28) / 6));
  const c = k < 0 ? mix(MID, COOL, -k) : mix(MID, WARM, k);
  return `rgb(${c.join(',')})`;
}

export default function HistoryChart({ history, series, rangeMs, threshold, now, height = 260 }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const isTemp = series === 'temp';

  const points = useMemo(() => {
    const from = now - rangeMs;
    return Object.entries(history ?? {})
      .map(([k, v]) => ({ ts: Number(k), v: Number(v?.[series]) }))
      .filter((p) => p.ts >= from && Number.isFinite(p.v))
      .sort((a, b) => a.ts - b.ts);
  }, [history, series, rangeMs, now]);

  const geo = useMemo(() => {
    if (!width || !points.length) return null;
    const w = width - M.left - M.right;
    const h = height - M.top - M.bottom;
    const vals = points.map((p) => p.v);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (isTemp && threshold != null) {
      lo = Math.min(lo, threshold);
      hi = Math.max(hi, threshold);
    }
    const pad = isTemp ? 0.6 : 3;
    lo = Math.floor(lo - pad);
    hi = Math.ceil(hi + pad);
    const step = isTemp ? (hi - lo > 8 ? 2 : 1) : hi - lo > 30 ? 10 : 5;
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const x0 = now - rangeMs;
    const x = (ts) => M.left + ((ts - x0) / rangeMs) * w;
    const y = (v) => M.top + (1 - (v - lo) / (hi - lo)) * h;

    let d = '';
    points.forEach((p, i) => {
      const gap = i > 0 && p.ts - points[i - 1].ts > Math.max(GAP_MS, rangeMs / 60);
      d += `${i === 0 || gap ? 'M' : 'L'}${x(p.ts).toFixed(1)} ${y(p.v).toFixed(1)} `;
    });

    const yTicks = [];
    for (let v = lo; v <= hi + 1e-9; v += step) yTicks.push(v);

    const hour = 3600000;
    const xStep = rangeMs <= 6 * hour ? hour : rangeMs <= 24 * hour ? 4 * hour : 24 * hour;
    const xTicks = [];
    const startDay = new Date(x0);
    startDay.setMinutes(0, 0, 0);
    if (xStep >= 24 * hour) startDay.setHours(0);
    for (let t = startDay.getTime(); t <= now; t += hour) {
      const dt = new Date(t);
      const ok = xStep >= 24 * hour ? dt.getHours() === 0 : dt.getHours() % (xStep / hour) === 0;
      if (ok && t >= x0) xTicks.push(t);
    }

    return { w, h, x, y, d, lo, hi, step, yTicks, xTicks, xStep };
  }, [points, width, height, isTemp, threshold, now, rangeMs]);

  function onMove(e) {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = null;
    for (const p of points) {
      const dx = Math.abs(geo.x(p.ts) - px);
      if (!best || dx < best.dx) best = { ...p, dx };
    }
    setHover(best);
  }

  const unit = isTemp ? '°C' : '%';
  const fmt = (v) => (isTemp ? fmtTemp(v) : Math.round(v));

  return (
    <div ref={ref} className="chart" style={{ height }}>
      {!points.length && width > 0 && <p className="chart-empty">No readings in this range yet.</p>}
      {geo && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${isTemp ? 'Temperature' : 'Humidity'} history. Latest ${fmt(points[points.length - 1].v)} ${unit}.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {isTemp
            ? geo.yTicks.slice(0, -1).map((v) => (
                <rect
                  key={`b${v}`}
                  x={M.left}
                  width={geo.w}
                  y={geo.y(v + geo.step)}
                  height={geo.y(v) - geo.y(v + geo.step)}
                  fill={bandColor(v + geo.step / 2)}
                />
              ))
            : null}
          {geo.yTicks.map((v) => (
            <g key={`y${v}`}>
              <line className="gridline" x1={M.left} x2={M.left + geo.w} y1={geo.y(v)} y2={geo.y(v)} />
              <text className="tick" x={M.left - 8} y={geo.y(v)} dy="0.32em" textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {geo.xTicks.map((t) => (
            <g key={`x${t}`}>
              <line className="gridline" x1={geo.x(t)} x2={geo.x(t)} y1={M.top} y2={M.top + geo.h} />
              <text className="tick" x={geo.x(t)} y={height - 8} textAnchor="middle">
                {geo.xStep >= 86400000 ? new Date(t).toLocaleDateString('en-GB', { weekday: 'short' }) : fmtTime(t)}
              </text>
            </g>
          ))}
          <line className="axis" x1={M.left} x2={M.left} y1={M.top} y2={M.top + geo.h} />
          <line className="axis" x1={M.left} x2={M.left + geo.w} y1={M.top + geo.h} y2={M.top + geo.h} />
          {isTemp && threshold != null && (
            <g className="thr">
              <line x1={M.left} x2={M.left + geo.w} y1={geo.y(threshold)} y2={geo.y(threshold)} />
              <text x={M.left + 6} y={geo.y(threshold) - 6} textAnchor="start">
                Rule {fmtTemp(threshold)} °C
              </text>
            </g>
          )}
          <path d={geo.d} className={`series series-${series}`} />
          {hover && (
            <g className="hover">
              <line x1={geo.x(hover.ts)} x2={geo.x(hover.ts)} y1={M.top} y2={M.top + geo.h} />
              <circle cx={geo.x(hover.ts)} cy={geo.y(hover.v)} r="4" />
            </g>
          )}
        </svg>
      )}
      {geo && hover && (
        <div
          className="chart-tip"
          style={{
            left: Math.min(Math.max(geo.x(hover.ts), 70), width - 70),
            top: Math.max(geo.y(hover.v) - 52, 0),
          }}
        >
          <strong>
            {fmt(hover.v)} {unit}
          </strong>
          <span>{fmtWhen(hover.ts, now)}</span>
        </div>
      )}
    </div>
  );
}
