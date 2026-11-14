import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Send, RotateCw } from 'lucide-react';
import Waveform from './Waveform.jsx';
import LearnPanel from './LearnPanel.jsx';
import { MAX_DURATIONS, parseTimings } from '../lib/ir.js';
import { sendCode, renameCode, deleteCode, isStale, commandList } from '../lib/commands.js';
import { fmtWhen, describeError } from '../lib/format.js';

export default function CodesTable({ codes, commands, rule, deviceOnline, now, loading }) {
  const [learning, setLearning] = useState(false);

  const rows = useMemo(
    () =>
      Object.entries(codes ?? {})
        .map(([id, c]) => ({ id, ...c }))
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)),
    [codes],
  );

  // Latest SEND command for each code.
  const lastSend = useMemo(() => {
    const map = {};
    for (const c of commandList(commands)) if (c.type === 'SEND' && c.codeId && !map[c.codeId]) map[c.codeId] = c;
    return map;
  }, [commands]);

  return (
    <section className="module m-codestable" aria-labelledby="codes-title">
      <div className="module-head">
        <h2 id="codes-title">
          <span className="fig">Table 1.</span> Saved IR codes
        </h2>
        {!learning && (
          <button className="btn btn-primary" onClick={() => setLearning(true)}>
            <Plus size={16} aria-hidden="true" /> Learn new button
          </button>
        )}
      </div>

      {learning ? (
        <LearnPanel existingNames={rows.map((r) => r.name)} onClose={() => setLearning(false)} commands={commands} now={now} />
      ) : (
        <table className="codes">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="col-wave">
                Signal <span className="th-note">mark / space</span>
              </th>
              <th scope="col" className="col-n">
                Length
              </th>
              <th scope="col" className="col-act">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="empty">Loading saved codes…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  <strong>No saved buttons yet.</strong> Choose <em>Learn new button</em>, then press a button on your real remote.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <CodeRow key={row.id} row={row} last={lastSend[row.id]} rule={rule} deviceOnline={deviceOnline} now={now} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function CodeRow({ row, last, rule, deviceOnline, now }) {
  const [mode, setMode] = useState('idle'); // idle | rename | confirmDelete
  const [draft, setDraft] = useState(row.name);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const n = row.n ?? parseTimings(row.timings).length;

  useEffect(() => {
    if (mode === 'rename') inputRef.current?.select();
  }, [mode]);

  const pending = last?.status === 'pending';
  const stale = last && isStale(last, now);
  const usedByRule = rule?.codeId === row.id;

  let status = null;
  if (pending && stale) status = { cls: 'st-err', text: 'No reply from the device yet. Is the ESP32 online?' };
  else if (pending) status = { cls: 'st-pend', text: deviceOnline ? 'Sending… waiting for ACK' : 'Queued. The device is offline.' };
  else if (last?.status === 'error') status = { cls: 'st-err', text: 'Last send failed', detail: describeError(last.error) };
  else if (last?.status === 'done') status = { cls: 'st-ok', text: `Sent ${fmtWhen(last.doneAt ?? last.createdAt, now)}` };
  else status = { cls: 'st-mute', text: 'Never sent' };

  async function onSend() {
    setBusy(true);
    try {
      await sendCode(row.id);
    } finally {
      setBusy(false);
    }
  }

  async function onRename(e) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    if (name !== row.name) await renameCode(row.id, name);
    setMode('idle');
  }

  return (
    <tr className={pending ? 'is-pending' : undefined}>
      <td className="col-name">
        {mode === 'rename' ? (
          <form onSubmit={onRename} className="rename">
            <label className="sr-only" htmlFor={`rn-${row.id}`}>
              New name for {row.name}
            </label>
            <input
              id={`rn-${row.id}`}
              ref={inputRef}
              value={draft}
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setMode('idle')}
            />
            <button className="btn btn-primary btn-sm" type="submit" disabled={!draft.trim()}>
              Save
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setMode('idle')}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span className="code-name">
              {row.name}
              {usedByRule && <span className="tag">Rule</span>}
            </span>
            <span className={`code-status ${status.cls}`} role="status" title={status.detail}>
              {status.text}
              {status.detail && <span className="sr-only">: {status.detail}</span>}
            </span>
          </>
        )}
      </td>
      <td className="col-wave">
        <Waveform timings={row.timings} sending={pending && !stale} label={`Timing diagram of ${row.name}, ${n} durations`} />
      </td>
      <td className="col-n">
        <span className="n-val">{n}</span>
        <span className="n-max"> / {MAX_DURATIONS}</span>
        <span className="budget" aria-hidden="true">
          <i style={{ width: `${Math.min(100, (n / MAX_DURATIONS) * 100)}%` }} />
        </span>
      </td>
      <td className="col-act">
        {mode === 'confirmDelete' ? (
          <div className="confirm" role="group" aria-label={`Delete ${row.name}?`}>
            <span className="confirm-q">
              Delete “{row.name}”?{usedByRule && ' The rule uses it and will be turned off.'}
            </span>
            <button className="btn btn-danger btn-sm" onClick={() => deleteCode(row.id, rule)}>
              Delete
            </button>
            <button className="btn btn-sm" onClick={() => setMode('idle')}>
              Keep
            </button>
          </div>
        ) : (
          <div className="acts">
            <button
              className="icon-btn"
              onClick={() => {
                setDraft(row.name);
                setMode('rename');
              }}
              aria-label={`Rename ${row.name}`}
              title="Rename"
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
            <button className="icon-btn" onClick={() => setMode('confirmDelete')} aria-label={`Delete ${row.name}`} title="Delete">
              <Trash2 size={16} aria-hidden="true" />
            </button>
            <button className="btn btn-send" onClick={onSend} disabled={busy || (pending && !stale)}>
              {last?.status === 'error' || stale ? (
                <>
                  <RotateCw size={15} aria-hidden="true" /> Retry
                </>
              ) : pending ? (
                'Sending'
              ) : (
                <>
                  <Send size={15} aria-hidden="true" /> Send
                </>
              )}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
