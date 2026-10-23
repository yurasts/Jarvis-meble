import { useCallback, useEffect, useRef, useState } from 'react';

const useProjectItemsAutosave = ({ projectId, onPersist, debounceMs = 600 }) => {
  const [status, setStatus] = useState(null);
  const pendingRef = useRef({});
  const timerRef = useRef(null);
  const inFlightRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flush = useCallback(async function flushPending() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (inFlightRef.current) {
      const result = await inFlightRef.current;
      if (result?.error) return result;
      return Object.keys(pendingRef.current).length ? flushPending() : result;
    }

    const fields = pendingRef.current;
    if (!Object.keys(fields).length) return { error: null };
    pendingRef.current = {};
    if (mountedRef.current) setStatus('saving');

    const request = Promise.resolve()
      .then(() => onPersist(projectId, fields))
      .then(() => ({ error: null }), error => ({ error }));
    inFlightRef.current = request;
    const result = await request;
    if (inFlightRef.current === request) inFlightRef.current = null;

    if (result.error) {
      pendingRef.current = { ...fields, ...pendingRef.current };
      if (mountedRef.current) setStatus('error');
      return result;
    }

    if (mountedRef.current) {
      setStatus(Object.keys(pendingRef.current).length ? 'saving' : 'saved');
    }
    return result;
  }, [onPersist, projectId]);

  const schedule = useCallback((field, items, { immediate = false } = {}) => {
    pendingRef.current = { ...pendingRef.current, [field]: items };
    if (mountedRef.current) setStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    if (immediate) return flush();
    timerRef.current = setTimeout(() => { void flush(); }, debounceMs);
    return Promise.resolve({ error: null });
  }, [debounceMs, flush]);

  return { status, schedule, flush };
};

export default useProjectItemsAutosave;
