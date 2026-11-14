import { useEffect, useState, useRef } from 'react';
import { store } from './store.js';

/** Live value at a database path. Returns { value, loading, error }. */
export function useDb(path, opts = {}) {
  const [state, setState] = useState({ value: null, loading: true, error: null });
  const optsKey = JSON.stringify(opts);
  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    const unsubscribe = store.on(
      path,
      (value) => setState({ value, loading: false, error: null }),
      JSON.parse(optsKey),
      (error) => setState({ value: null, loading: false, error }),
    );
    return unsubscribe;
  }, [path, optsKey]);
  return state;
}

/** Current time, refreshed every `ms`. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Width of an element, kept up to date. */
export function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
