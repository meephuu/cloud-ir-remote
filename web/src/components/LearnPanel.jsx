import { useEffect, useRef, useState } from 'react';
import { learnCode, sendCode, isStale } from '../lib/commands.js';
import { describeError } from '../lib/format.js';
import { useDb } from '../lib/hooks.js';
import Waveform from './Waveform.jsx';

const LEARN_WINDOW_S = 10; // the STM32 waits 10 s for a signal

/** Takes over Table 1 while a new button is learned: name, wait, result. */
export default function LearnPanel({ existingNames, onClose, commands, now }) {
  const [name, setName] = useState('');
  const [cmdId, setCmdId] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const inputRef = useRef(null);
  const cmd = cmdId ? commands?.[cmdId] : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = name.trim();
  const duplicate = existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());

  async function start(e) {
    e?.preventDefault();
    if (!trimmed) return;
    setStartedAt(Date.now());
    const id = await learnCode(trimmed);
    setCmdId(id);
  }

  function reset() {
    setCmdId(null);
    setStartedAt(null);
  }

  // Step 1: name
  if (!cmdId) {
    return (
      <form className="learn" onSubmit={start}>
        <label htmlFor="learn-name" className="learn-title learn-label">
          Name the new button
        </label>
        <p className="learn-hint">Use what the button does, like “AC Cool 25°” or “TV Volume up”.</p>
        <input
          id="learn-name"
          ref={inputRef}
          className="learn-input"
          value={name}
          maxLength={40}
          placeholder="AC Cool 25°"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          aria-describedby={duplicate ? 'learn-dup' : undefined}
        />
        {duplicate && (
          <p id="learn-dup" className="learn-warn">
            A button with this name already exists. You can still save it.
          </p>
        )}
        <div className="learn-actions">
          <button className="btn btn-primary" type="submit" disabled={!trimmed}>
            Start learning
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <span className="learn-progress">Step 1 of 2</span>
        </div>
      </form>
    );
  }

  // Step 2: waiting for the device
  if (!cmd || cmd.status === 'pending') {
    const stale = cmd && isStale(cmd, now);
    const elapsed = Math.max(0, Math.floor((now - (startedAt ?? now)) / 1000));
    const left = Math.max(0, LEARN_WINDOW_S - elapsed);
    return (
      <div className="learn" aria-live="polite">
        <p className="learn-title">Point the remote at the receiver and press “{trimmed}” once.</p>
        <div className="learn-scan" aria-hidden="true">
          <span />
        </div>
        {stale ? (
          <p className="learn-warn">The device has not answered. Check that the ESP32 is online, then try again.</p>
        ) : (
          <p className="learn-hint">
            {left > 0 ? `Listening… ${left} s left` : 'Waiting for the device to reply…'}
          </p>
        )}
        <div className="learn-actions">
          {stale && (
            <button className="btn btn-primary" onClick={reset}>
              Try again
            </button>
          )}
          <button className="btn" onClick={onClose}>
            {stale ? 'Close' : 'Stop waiting'}
          </button>
          <span className="learn-progress">Step 2 of 2</span>
        </div>
      </div>
    );
  }

  // Result
  if (cmd.status === 'error') {
    return (
      <div className="learn" role="alert">
        <p className="learn-title st-err">Could not learn “{trimmed}”</p>
        <p className="learn-hint">{describeError(cmd.error)}</p>
        <p className="learn-hint">Hold the remote 5–30 cm from the receiver and press the button once, firmly.</p>
        <div className="learn-actions">
          <button className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return <LearnDone name={trimmed} codeId={cmd.codeId} onClose={onClose} onAnother={() => { setName(''); reset(); }} />;
}

function LearnDone({ name, codeId, onClose, onAnother }) {
  const { value: code } = useDb(`codes/${codeId}`);
  return (
    <div className="learn" aria-live="polite">
      <p className="learn-title">Saved “{code?.name ?? name}”</p>
      <p className="learn-hint">
        <span className="st-ok">Learned</span> · {code?.n ?? '…'} durations, shown below as a timing diagram.
      </p>
      <div className="learn-wave">{code && <Waveform timings={code.timings} height={40} label={`Timing diagram of ${name}`} />}</div>
      <div className="learn-actions">
        <button className="btn btn-primary" onClick={() => sendCode(codeId).then(onClose)}>
          Send it now
        </button>
        <button className="btn" onClick={onAnother}>
          Learn another
        </button>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
