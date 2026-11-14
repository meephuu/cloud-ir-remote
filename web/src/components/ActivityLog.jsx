import { commandList, clearFinished, isStale } from '../lib/commands.js';
import { fmtWhen, describeError } from '../lib/format.js';

const SHOWN = 8;

export default function ActivityLog({ commands, codes, now }) {
  const list = commandList(commands);
  const finished = list.filter((c) => c.status !== 'pending').length;

  return (
    <section className="module m-activitylog" aria-labelledby="log-title">
      <div className="module-head">
        <h2 id="log-title">
          <span className="fig">Table 4.</span> Activity
        </h2>
        {finished > 0 && (
          <button className="btn btn-sm" onClick={() => clearFinished(commands)}>
            Clear finished
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="empty">No commands yet. Sent and learned buttons show up here.</p>
      ) : (
        <table className="log">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Command</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, SHOWN).map((c) => {
              const target = c.type === 'LEARN' ? c.name : codes?.[c.codeId]?.name ?? 'deleted button';
              const stale = isStale(c, now);
              return (
                <tr key={c.id}>
                  <td className="log-time">{typeof c.createdAt === 'number' ? fmtWhen(c.createdAt, now) : '…'}</td>
                  <td>
                    <span className="log-type">{c.type}</span> {target}
                  </td>
                  <td>
                    {c.status === 'pending' && !stale && <span className="st-pend">Pending</span>}
                    {stale && <span className="st-err">No reply</span>}
                    {c.status === 'done' && <span className="st-ok">Done</span>}
                    {c.status === 'error' && (
                      <span className="st-err" title={c.error}>
                        Error: {describeError(c.error)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {list.length > SHOWN && <p className="caption">Showing the latest {SHOWN} of {list.length}.</p>}
    </section>
  );
}
