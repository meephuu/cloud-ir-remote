const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fullFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const fmtTime = (ts) => timeFmt.format(ts);
export const fmtFull = (ts) => fullFmt.format(ts);

/** "14:31" today, "Yesterday 22:10", or "Tue 11 Nov 09:00". */
export function fmtWhen(ts, now = Date.now()) {
  const d = new Date(ts);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return timeFmt.format(d);
  const y = new Date(now - 86400000);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${timeFmt.format(d)}`;
  return `${dayFmt.format(d)} ${timeFmt.format(d)}`;
}

/** "4 s ago", "3 min ago", "2 h ago". */
export function fmtAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export const fmtTemp = (t) => (t == null || Number.isNaN(t) ? '–' : Number(t).toFixed(1));

/** Device error codes from docs/uart-protocol.md, in plain words. */
export function describeError(error) {
  switch (error) {
    case 'ERR,LEARN,TIMEOUT':
      return 'No signal reached the receiver within 10 seconds.';
    case 'ERR,LEARN,TOO_LONG':
      return 'That signal has more than 600 durations, so it cannot be stored.';
    case 'ERR,SEND,BUSY':
      return 'The device was still sending the previous code.';
    case 'ERR,SEND,FORMAT':
      return 'The device rejected the code (bad format).';
    case 'ERR,LINE,TOO_LONG':
      return 'The code was too long for the device’s buffer.';
    case 'ERR,UNKNOWN':
      return 'The device did not recognise the command.';
    default:
      return error || 'Something went wrong on the device.';
  }
}
