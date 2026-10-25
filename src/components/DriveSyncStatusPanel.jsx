import { useEffect, useState } from 'react';
import {
  DEFAULT_DRIVE_SYNC_ROOT,
  driveSyncCounts,
  formatDriveSyncTimestamp,
  isDriveSyncActive,
} from '../utils/driveSyncStatus';
import s from './Settings.module.css';

export default function DriveSyncStatusPanel({ state, status, error, onRetry, now }) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (now != null) return undefined;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, [now]);

  const active = isDriveSyncActive(state, now ?? currentTime);
  const counts = driveSyncCounts(state);

  return (
    <section className={`${s.section} ${s.driveSyncSection}`} aria-labelledby="drive-sync-title">
      <div className={s.driveSyncHeading}>
        <div>
          <h3 id="drive-sync-title" className={s.sectionTitle}>Synchronizacja z Google Drive (PC)</h3>
          <p className={s.sectionDesc}>Dwustronna synchronizacja folderów projektów i plików.</p>
        </div>
        <span className={active ? s.driveSyncOnline : s.driveSyncOffline} role="status">
          <span className={s.driveSyncDot} aria-hidden="true" />
          {active ? 'Aktywna' : 'Offline'}
        </span>
      </div>

      {status === 'loading' && !state && (
        <div className={s.driveSyncMessage}>Ładowanie statusu synchronizacji…</div>
      )}
      {status === 'error' && (
        <div className={s.driveSyncError} role="alert">
          <span>{error?.message || 'Nie udało się pobrać statusu synchronizacji.'}</span>
          <button type="button" onClick={onRetry}>Spróbuj ponownie</button>
        </div>
      )}

      <dl className={s.driveSyncDetails}>
        <div>
          <dt>Aktywny komputer</dt>
          <dd>{state?.locked_by_host || 'Brak'}</dd>
        </div>
        <div>
          <dt>Ostatnia synchronizacja</dt>
          <dd>{formatDriveSyncTimestamp(state?.last_sync_at)}</dd>
        </div>
        <div className={s.driveSyncPath}>
          <dt>Folder</dt>
          <dd>{state?.sync_root_path || DEFAULT_DRIVE_SYNC_ROOT}</dd>
        </div>
      </dl>

      <div className={s.driveSyncCounters} aria-label="Podsumowanie synchronizacji">
        <span><strong>{counts.projects}</strong> projektów</span>
        <span><strong>{counts.files}</strong> plików</span>
      </div>

      {state?.last_error && (
        <div className={s.driveSyncLastError} role="alert">
          Ostatni błąd: {state.last_error}
        </div>
      )}
    </section>
  );
}
