import { useEffect, useMemo, useState } from 'react';
import { saveRule } from '../lib/commands.js';
import { fmtTemp } from '../lib/format.js';

const MIN_T = 16;
const MAX_T = 40;
const pct = (t) => `${((Math.min(MAX_T, Math.max(MIN_T, t)) - MIN_T) / (MAX_T - MIN_T)) * 100}%`;

export default function RulePanel({ rule, codes, latestTemp, loading }) {
  const saved = useMemo(() => ({ enabled: false, threshold: 30, codeId: '', ...(rule ?? {}) }), [rule]);
  const [draft, setDraft] = useState(saved);
  const [state, setState] = useState('idle'); // idle | saving | saved | error

  useEffect(() => setDraft(saved), [saved]);

  const codeList = Object.entries(codes ?? {}).sort((a, b) => (a[1].createdAt ?? 0) - (b[1].createdAt ?? 0));
  const threshold = Number(draft.threshold);
  const validT = Number.isFinite(threshold) && threshold >= MIN_T && threshold <= MAX_T;
  const dirty =
    draft.enabled !== saved.enabled || Number(draft.threshold) !== Number(saved.threshold) || (draft.codeId || '') !== (saved.codeId || '');
  const canSave = dirty && validT && (!draft.enabled || draft.codeId);
  const codeName = codes?.[draft.codeId]?.name;

  async function onSave(e) {
    e.preventDefault();
    setState('saving');
    try {
      await saveRule({ enabled: draft.enabled, threshold: Math.round(threshold * 10) / 10, codeId: draft.codeId || null });
      setState('saved');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('error');
    }
  }

  let summary;
  if (!draft.enabled) summary = 'The rule is off. Nothing is sent automatically.';
  else if (!draft.codeId) summary = 'Choose which button to send.';
  else if (latestTemp == null) summary = `When the room goes above ${fmtTemp(threshold)} °C, the device sends “${codeName}”.`;
  else if (latestTemp > threshold)
    summary = `The room (${fmtTemp(latestTemp)} °C) is above ${fmtTemp(threshold)} °C, so the device sends “${codeName}”.`;
  else
    summary = `The room is ${fmtTemp(threshold - latestTemp)} °C below the threshold. Above ${fmtTemp(threshold)} °C the device sends “${codeName}”.`;

  return (
    <section className="module m-rulepanel" aria-labelledby="rule-title">
      <div className="module-head">
        <h2 id="rule-title">
          <span className="fig">Table 3.</span> Automation rule
        </h2>
        <span className="head-note">Runs on the STM32, even without Wi-Fi</span>
      </div>
      <form className="rule" onSubmit={onSave}>
        <div className="rule-row">
          <span className="rule-k" id="rule-en-k">
            Enabled
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={draft.enabled}
              aria-labelledby="rule-en-k"
              disabled={loading}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-text">{draft.enabled ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div className="rule-row">
          <label className="rule-k" htmlFor="rule-t">
            If room is above
          </label>
          <span className="rule-input">
            <input
              id="rule-t"
              type="number"
              inputMode="decimal"
              min={MIN_T}
              max={MAX_T}
              step="0.5"
              value={draft.threshold}
              aria-invalid={!validT}
              onChange={(e) => setDraft({ ...draft, threshold: e.target.value })}
            />
            <span>°C</span>
          </span>
        </div>
        <div className="scale" aria-hidden="true">
          <div className="scale-bar" />
          {latestTemp != null && (
            <span className="scale-now" style={{ left: pct(latestTemp) }}>
              <i />
              <b>now {fmtTemp(latestTemp)}</b>
            </span>
          )}
          {validT && (
            <span className="scale-thr" style={{ left: pct(threshold) }}>
              <i />
            </span>
          )}
          <span className="scale-lo">{MIN_T} °C</span>
          <span className="scale-hi">{MAX_T} °C</span>
        </div>
        <div className="rule-row">
          <label className="rule-k" htmlFor="rule-code">
            Send
          </label>
          <select id="rule-code" value={draft.codeId || ''} onChange={(e) => setDraft({ ...draft, codeId: e.target.value })}>
            <option value="">Choose a button…</option>
            {codeList.map(([id, c]) => (
              <option key={id} value={id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {!validT && <p className="st-err rule-msg">Enter a temperature between {MIN_T} and {MAX_T} °C.</p>}
        <p className="rule-summary">{summary}</p>
        <div className="rule-actions">
          <button className="btn btn-primary" type="submit" disabled={!canSave || state === 'saving'}>
            {state === 'saving' ? 'Saving…' : 'Save rule'}
          </button>
          {dirty && (
            <button className="btn" type="button" onClick={() => setDraft(saved)}>
              Discard changes
            </button>
          )}
          <span className="rule-state" role="status">
            {state === 'saved' && <span className="st-ok">Saved</span>}
            {state === 'error' && <span className="st-err">Could not save. Check the connection and try again.</span>}
            {state === 'idle' && dirty && <span className="st-mute">Unsaved changes</span>}
          </span>
        </div>
      </form>
    </section>
  );
}
