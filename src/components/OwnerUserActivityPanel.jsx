import { useEffect, useMemo, useState } from 'react';
import {
  ACTIVITY_DEVICE_ICONS,
  ACTIVITY_DEVICE_LABELS,
  ACTIVITY_EVENT_LABELS,
  formatActivityTimestamp,
  formatLastSeen,
  isUserOnline,
} from '../utils/userActivity';
import s from './Settings.module.css';

export function UserPresenceBadge({ presence, now }) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (now != null) return undefined;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, [now]);

  if (!presence?.last_seen_at) {
    return <span className={s.presenceUnknown}>Brak danych</span>;
  }

  if (isUserOnline(presence.last_seen_at, now ?? currentTime)) {
    return (
      <span className={s.presenceOnline}>
        <span className={s.presenceDot} aria-hidden="true" />
        Online
        <span aria-label={ACTIVITY_DEVICE_LABELS[presence.last_device_type] || 'Urządzenie'}>
          {ACTIVITY_DEVICE_ICONS[presence.last_device_type] || ''}
        </span>
      </span>
    );
  }

  return (
    <span className={s.presenceLastSeen}>
      {formatLastSeen(presence.last_seen_at, presence.last_device_type)}
    </span>
  );
}

export default function OwnerUserActivityPanel({
  profiles,
  presenceByUserId,
  logs,
  status,
  error,
  onRetry,
}) {
  const [selectedUserId, setSelectedUserId] = useState('all');
  const filteredLogs = useMemo(() => (
    selectedUserId === 'all'
      ? logs
      : logs.filter(log => log.user_id === selectedUserId)
  ), [logs, selectedUserId]);

  return (
    <details className={`${s.section} ${s.activitySection}`} open>
      <summary className={s.activitySummary}>
        <span>Aktywność użytkowników</span>
        <span className={s.activityCount}>{logs.length}</span>
      </summary>

      <div className={s.activityContent}>
        <p className={s.sectionDesc}>
          Ostatnia aktywność i historia otwarć aplikacji. Dane są widoczne wyłącznie dla właściciela.
        </p>

        <div className={s.activityPresenceList} aria-label="Status aktywności pracowników">
          {profiles.map(employee => (
            <div key={employee.id} className={s.activityPresenceRow}>
              <span className={s.activityEmployeeName}>{employee.full_name || 'Bez nazwy'}</span>
              <UserPresenceBadge presence={presenceByUserId[employee.id]} />
            </div>
          ))}
        </div>

        <label className={s.activityFilter}>
          <span>Pracownik</span>
          <select
            value={selectedUserId}
            onChange={event => setSelectedUserId(event.target.value)}
            aria-label="Filtr aktywności według pracownika"
          >
            <option value="all">Wszyscy</option>
            {profiles.map(employee => (
              <option key={employee.id} value={employee.id}>{employee.full_name || 'Bez nazwy'}</option>
            ))}
          </select>
        </label>

        {status === 'loading' && logs.length === 0 && (
          <div className={s.activityState} role="status">Ładowanie aktywności…</div>
        )}
        {status === 'error' && (
          <div className={s.activityError} role="alert">
            <span>{error?.message || 'Nie udało się załadować aktywności.'}</span>
            <button type="button" onClick={onRetry}>Spróbuj ponownie</button>
          </div>
        )}
        {status !== 'loading' && status !== 'error' && filteredLogs.length === 0 && (
          <div className={s.activityState}>Brak zapisanej aktywności.</div>
        )}

        {filteredLogs.length > 0 && (
          <div className={s.activityTable} role="table" aria-label="Historia logowań i sesji">
            <div className={s.activityTableHeader} role="row">
              <span role="columnheader">Data i czas</span>
              <span role="columnheader">Pracownik</span>
              <span role="columnheader">Zdarzenie</span>
              <span role="columnheader">Urządzenie</span>
            </div>
            {filteredLogs.map(log => (
              <div key={log.id} className={s.activityTableRow} role="row">
                <time role="cell" dateTime={log.created_at}>{formatActivityTimestamp(log.created_at)}</time>
                <span role="cell" className={s.activityLogIdentity}>
                  <strong>{log.user_name || log.user_email || 'Nieznany użytkownik'}</strong>
                  {log.user_name && log.user_email && <small>{log.user_email}</small>}
                </span>
                <span role="cell">{ACTIVITY_EVENT_LABELS[log.event_type] || log.event_type}</span>
                <span role="cell">
                  {ACTIVITY_DEVICE_ICONS[log.device_type] || ''}{' '}
                  {ACTIVITY_DEVICE_LABELS[log.device_type] || log.device_type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
