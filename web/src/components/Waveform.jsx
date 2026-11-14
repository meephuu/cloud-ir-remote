import { useMemo } from 'react';
import { parseTimings, waveformPath } from '../lib/ir.js';
import { useWidth } from '../lib/hooks.js';

/**
 * Timing diagram of an IR code: high = mark (IR on), low = space.
 * `sending` sweeps a cursor across the signal while a SEND is pending.
 */
export default function Waveform({ timings, sending = false, height = 28, label }) {
  const [ref, width] = useWidth();
  const durations = useMemo(() => parseTimings(timings), [timings]);
  const { d, breaks } = useMemo(
    () => (width > 0 ? waveformPath(durations, width, height) : { d: '', breaks: [] }),
    [durations, width, height],
  );

  return (
    <div ref={ref} className={`wave${sending ? ' is-sending' : ''}`} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
          <path d={d} className="wave-line" />
          {breaks.map((x) => (
            <g key={x} className="wave-break" transform={`translate(${x} 0)`}>
              <line x1="-3" y1={height - 2} x2="1" y2={height - 10} />
              <line x1="0" y1={height - 2} x2="4" y2={height - 10} />
            </g>
          ))}
        </svg>
      )}
      {sending && <span className="wave-cursor" aria-hidden="true" />}
    </div>
  );
}
