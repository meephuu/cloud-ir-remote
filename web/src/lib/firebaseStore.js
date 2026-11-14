import { initializeApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  push,
  remove,
  query,
  orderByKey,
  startAt,
  limitToLast,
  serverTimestamp,
} from 'firebase/database';

const env = import.meta.env;

export function firebaseConfigured() {
  return Boolean(env.VITE_FIREBASE_DATABASE_URL && env.VITE_FIREBASE_API_KEY);
}

export function createFirebaseStore() {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const db = getDatabase(app);

  return {
    mode: 'firebase',
    on(path, cb, opts = {}, onError) {
      const constraints = [];
      if (opts.startAtKey != null || opts.limitLast != null) constraints.push(orderByKey());
      if (opts.startAtKey != null) constraints.push(startAt(String(opts.startAtKey)));
      if (opts.limitLast != null) constraints.push(limitToLast(opts.limitLast));
      const target = constraints.length ? query(ref(db, path), ...constraints) : ref(db, path);
      return onValue(target, (snap) => cb(snap.val()), (err) => onError?.(err));
    },
    set: (path, value) => set(ref(db, path), value),
    update: (path, value) => update(ref(db, path), value),
    remove: (path) => remove(ref(db, path)),
    async push(path, value) {
      const r = push(ref(db, path));
      await set(r, value);
      return r.key;
    },
    timestamp: () => serverTimestamp(),
  };
}
