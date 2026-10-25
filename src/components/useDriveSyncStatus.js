import { useCallback, useEffect, useRef, useState } from 'react';
import driveSyncRepository from '../data/driveSyncRepository';

export const DRIVE_SYNC_STATUS_REFRESH_MS = 30 * 1000;

export default function useDriveSyncStatus({
  enabled,
  repository = driveSyncRepository,
  refreshMs = DRIVE_SYNC_STATUS_REFRESH_MS,
} = {}) {
  const [resource, setResource] = useState({ state: null, status: enabled ? 'loading' : 'idle', error: null });
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    setResource(current => ({ ...current, status: 'loading', error: null }));
    try {
      const state = await repository.getState();
      if (requestId === requestIdRef.current) setResource({ state, status: 'ready', error: null });
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setResource(current => ({ ...current, status: 'error', error }));
      }
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

  return enabled ? { ...resource, reload } : {
    state: null,
    status: 'idle',
    error: null,
    reload,
  };
}
