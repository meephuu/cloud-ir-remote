// Writes commands for the ESP32 to pick up. The ESP32 changes `status` from
// "pending" to "done" or "error" when the STM32 answers.
import { store } from './store.js';

/** How long the UI waits before saying the device has not answered. */
export const REPLY_TIMEOUT = { SEND: 15000, LEARN: 25000 };

export function sendCode(codeId) {
  return store.push('commands', { type: 'SEND', codeId, status: 'pending', createdAt: store.timestamp() });
}

export function learnCode(name) {
  return store.push('commands', { type: 'LEARN', name, status: 'pending', createdAt: store.timestamp() });
}

export function renameCode(codeId, name) {
  return store.update(`codes/${codeId}`, { name });
}

export async function deleteCode(codeId, rule) {
  if (rule?.codeId === codeId) await store.update('rule', { enabled: false, codeId: null });
  return store.remove(`codes/${codeId}`);
}

export function saveRule(rule) {
  return store.set('rule', rule);
}

export async function clearFinished(commands) {
  const updates = {};
  for (const [id, c] of Object.entries(commands ?? {})) if (c.status !== 'pending') updates[id] = null;
  if (Object.keys(updates).length) await store.update('commands', updates);
}

/** Pending for longer than the reply timeout. */
export function isStale(cmd, now) {
  return cmd.status === 'pending' && typeof cmd.createdAt === 'number' && now - cmd.createdAt > (REPLY_TIMEOUT[cmd.type] ?? 15000);
}

/** Commands as a list, newest first. */
export function commandList(commands) {
  return Object.entries(commands ?? {})
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}
