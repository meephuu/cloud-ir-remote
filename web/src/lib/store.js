// One small interface over the database, so the UI works the same with real
// Firebase and with the in-browser demo.
//
//   store.on(path, callback, { startAtKey, limitLast }) -> unsubscribe()
//   store.set(path, value) / store.update(path, partial) / store.remove(path)
//   store.push(path, value) -> new key
//   store.timestamp() -> value to write for "now" (server time on Firebase)
//   store.mode -> 'firebase' | 'demo'
import { createFirebaseStore, firebaseConfigured } from './firebaseStore.js';
import { createDemoStore } from './demoStore.js';

export const store = firebaseConfigured() ? createFirebaseStore() : createDemoStore();
