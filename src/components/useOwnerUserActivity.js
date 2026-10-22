import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import userActivityRepository from '../data/userActivityRepository';

export const OWNER_ACTIVITY_REFRESH_MS = 60 * 1000;

export default function useOwnerUserActivity({
  enabled,
  repository = userActivityRepository,
  refreshMs = OWNER_ACTIVITY_REFRESH_MS,
} = {}) {
  const [presence, setPresence] = useState([]);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle');
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setError(null);
    try {
      const [nextPresence, nextLogs] = await Promise.all([
        repository.listPresence(),
        repository.listLogs(),
      ]);
      if (requestId !== requestIdRef.current) return;
      setPresence(nextPresence);
      setLogs(nextLogs);
      setStatus('ready');
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
      setError(cause);
      setStatus('error');
    }
  }, [enabled, repository]);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      return undefined;
    }

    const initialLoad = window.setTimeout(() => void reload(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, refreshMs);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [enabled, refreshMs, reload]);

  const presenceByUserId = useMemo(() => Object.fromEntries(
    (enabled ? presence : []).map(row => [row.user_id, row]),
  ), [enabled, presence]);

  return {
    presence: enabled ? presence : [],
    presenceByUserId,
    logs: enabled ? logs : [],
    status: enabled ? status : 'idle',
    error: enabled ? error : null,
    reload,
  };
}
