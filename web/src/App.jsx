import { store } from './lib/store.js';
import { useDb, useNow } from './lib/hooks.js';
import { fmtAgo, fmtFull } from './lib/format.js';
import CodesTable from './components/CodesTable.jsx';
import Station from './components/Station.jsx';
import RulePanel from './components/RulePanel.jsx';
import ActivityLog from './components/ActivityLog.jsx';

const OFFLINE_AFTER_MS = 60 * 1000;

export default function App() {
  const now = useNow(1000);
  const codes = useDb('codes');
  const commands = useDb('commands');
  const rule = useDb('rule');
  const device = useDb('device/lastSeen');
  const latest = useDb('env/latest');

  const lastSeen = typeof device.value === 'number' ? device.value : null;
  const online = lastSeen != null && now - lastSeen < OFFLINE_AFTER_MS;
  const dbError = codes.error || commands.error || rule.error;

  return (
    <div className="page">
      <header className="top">
        <div className="top-title">
          <h1>Cloud IR Remote</h1>
          <span className="top-rev">{fmtFull(now)}</span>
        </div>
        <div className="top-status">
          <span className={`dev ${online ? 'dev-on' : 'dev-off'}`} role="status">
            <i aria-hidden="true" />
            {device.loading
              ? 'Checking device…'
              : online
                ? 'ESP32 online'
                : lastSeen
                  ? `ESP32 offline · last seen ${fmtAgo(lastSeen, now)}`
                  : 'ESP32 has not connected yet'}
          </span>
          {store.mode === 'demo' && (
            <span className="demo">
              <span className="demo-badge">Demo data</span>
              <button className="link-btn" onClick={() => store.reset()}>
                Reset
              </button>
            </span>
          )}
        </div>
      </header>

      {store.mode === 'demo' && (
        <p className="banner">
          Not connected to Firebase. Everything here is simulated in your browser, including the device. Add your Firebase
          config to <code>web/.env.local</code> to use the real database.
        </p>
      )}
      {dbError && (
        <p className="banner banner-err" role="alert">
          Cannot read the database: {dbError.message}. Check the database rules and the config in <code>web/.env.local</code>.
        </p>
      )}

      <main className="grid">
        <div className="col-left">
          <CodesTable
            codes={codes.value}
            commands={commands.value}
            rule={rule.value}
            deviceOnline={online}
            now={now}
            loading={codes.loading}
          />
          <ActivityLog commands={commands.value} codes={codes.value} now={now} />
        </div>
        <div className="col-right">
          <Station rule={rule.value} now={now} />
          <RulePanel rule={rule.value} codes={codes.value} latestTemp={latest.value?.temp ?? null} loading={rule.loading} />
        </div>
      </main>

      <footer className="foot">
        Cloud IR Remote · 2110366 Embedded System Laboratory, Chulalongkorn University · Website ⇄ Firebase ⇄ ESP32-S3 ⇄
        STM32
      </footer>
    </div>
  );
}
