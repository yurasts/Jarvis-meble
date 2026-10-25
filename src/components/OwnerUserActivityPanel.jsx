import { useEffect, useMemo, useState } from 'react';
import {
  ACTIVITY_DEVICE_ICONS,
  ACTIVITY_DEVICE_LABELS,
  ACTIVITY_EVENT_LABELS,
  activityDayKey,
  activityLevel,
  buildActivityDays,
  buildDailyActivityMatrix,
  buildHourlyActivity,
  collapseActivityDuplicates,
  formatActivityTime,
  formatLastSeen,
  formatShortLastSeen,
  groupActivityByDay,
  isUserOnline,
} from '../utils/userActivity';
import s from './Settings.module.css';

const ALL = 'all';
const LEVEL_CLASS = [s.activityLevel0, s.activityLevel1, s.activityLevel2];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HOUR_SCALE = ['00:00', '06:00', '12:00', '18:00', '24:00'];

const useCurrentTime = (fixedNow) => {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (fixedNow != null) return undefined;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, [fixedNow]);

  return fixedNow ?? currentTime;
};

const employeeName = (employee) => employee?.full_name || 'Bez nazwy';
const entryName = (entry) => entry.user_name || entry.user_email || 'Nieznany użytkownik';
const initial = (name) => (name.trim().charAt(0) || '?').toUpperCase();
const deviceIcon = (deviceType) => ACTIVITY_DEVICE_ICONS[deviceType] || '';
const deviceLabel = (deviceType) => ACTIVITY_DEVICE_LABELS[deviceType] || deviceType || 'Urządzenie';
const entriesLabel = (count) => {
  const lastTwo = count % 100;
  const last = count % 10;
  if (count === 1) return '1 wpis';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} wpisy`;
  return `${count} wpisów`;
};

const bucketTimes = (bucket) => bucket.entries
  .map(entry => `${formatActivityTime(entry.created_at)} ${deviceIcon(entry.device_type)}`.trim())
  .reverse()
  .join(', ');

const dayCellTitle = (name, day, bucket) => (bucket?.count
  ? `${name} · ${day.weekday} ${day.shortDate}: ${bucketTimes(bucket)}`
  : `${name} · ${day.weekday} ${day.shortDate}: brak wejść`);

export function UserPresenceBadge({ presence, now, compact = false }) {
  const currentTime = useCurrentTime(now);

  if (!presence?.last_seen_at) {
    return <span className={s.presenceUnknown}>Brak danych</span>;
  }

  const icon = deviceIcon(presence.last_device_type);

  if (isUserOnline(presence.last_seen_at, currentTime)) {
    return (
      <span className={s.presenceOnline}>
        <span className={s.presenceDot} aria-hidden="true" />
        Online
        <span aria-label={deviceLabel(presence.last_device_type)}>{icon}</span>
      </span>
    );
  }

  if (compact) {
    return (
      <span className={s.presenceLastSeen} title={formatLastSeen(presence.last_seen_at, presence.last_device_type)}>
        {formatShortLastSeen(presence.last_seen_at, { now: new Date(currentTime) })}
        {icon && <span aria-label={deviceLabel(presence.last_device_type)}>{icon}</span>}
      </span>
    );
  }

  return (
    <span className={s.presenceLastSeen}>
      {formatLastSeen(presence.last_seen_at, presence.last_device_type)}
    </span>
  );
}

function ActivitySparkline({ days, row }) {
  return (
    <span className={s.activitySpark} aria-hidden="true">
      {days.map(day => (
        <span key={day.key} className={`${s.activitySparkBar} ${LEVEL_CLASS[activityLevel(row?.[day.key]?.count)]}`} />
      ))}
    </span>
  );
}

function EmployeeFilterChips({ profiles, presenceByUserId, matrix, days, entryCount, selectedUserId, onSelect, now }) {
  return (
    <div className={s.activityChips} role="group" aria-label="Filtr aktywności według pracownika">
      <button
        type="button"
        className={`${s.activityChip} ${s.activityChipAll}`}
        aria-pressed={selectedUserId === ALL}
        onClick={() => onSelect(ALL)}
      >
        <span className={s.activityChipName}>Wszyscy</span>
        <span className={s.activityChipMeta}>{entriesLabel(entryCount)}</span>
      </button>
      {profiles.map(employee => {
        const name = employeeName(employee);
        const activeDays = days.filter(day => matrix[employee.id]?.[day.key]?.count).length;
        return (
          <button
            key={employee.id}
            type="button"
            className={s.activityChip}
            aria-pressed={selectedUserId === employee.id}
            aria-label={`Filtruj aktywność: ${name}`}
            title={`${name} · aktywne dni w ostatnim tygodniu: ${activeDays}/${days.length}`}
            onClick={() => onSelect(selectedUserId === employee.id ? ALL : employee.id)}
          >
            <span className={s.activityChipTop}>
              <span className={s.activityChipName}>{name}</span>
              <ActivitySparkline days={days} row={matrix[employee.id]} />
            </span>
            <span className={s.activityChipMeta}>
              <UserPresenceBadge presence={presenceByUserId[employee.id]} now={now} compact />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DailyHeatmap({ profiles, matrix, days }) {
  return (
    <div className={s.activityHeatmap} role="table" aria-label="Aktywność z ostatnich 7 dni">
      <div className={s.activityHeatmapRow} role="row">
        <span className={s.activityHeatmapCorner} role="columnheader" aria-label="Pracownik" />
        {days.map(day => (
          <span
            key={day.key}
            role="columnheader"
            className={`${s.activityHeatmapDay} ${day.isToday ? s.activityHeatmapToday : ''}`}
          >
            <span>{day.weekday}</span>
            <span>{day.shortDate}</span>
          </span>
        ))}
      </div>
      {profiles.map(employee => {
        const name = employeeName(employee);
        return (
          <div key={employee.id} className={s.activityHeatmapRow} role="row">
            <span className={s.activityHeatmapLabel} role="rowheader" title={name}>{name}</span>
            {days.map(day => {
              const bucket = matrix[employee.id]?.[day.key];
              const title = dayCellTitle(name, day, bucket);
              return (
                <span
                  key={day.key}
                  role="cell"
                  title={title}
                  aria-label={title}
                  className={`${s.activityCell} ${LEVEL_CLASS[activityLevel(bucket?.count)]}`}
                >
                  {bucket?.devices.map(deviceIcon).join('')}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function HourlyTimeline({ name, entries, days }) {
  const hourly = useMemo(() => buildHourlyActivity(entries, days), [days, entries]);
  const newestFirst = useMemo(() => [...days].reverse(), [days]);

  return (
    <div className={s.activityTimeline} role="table" aria-label={`Aktywność godzinowa: ${name}`}>
      {newestFirst.map(day => (
        <div key={day.key} className={s.activityTimelineRow} role="row">
          <span
            className={`${s.activityTimelineLabel} ${day.isToday ? s.activityHeatmapToday : ''}`}
            role="rowheader"
          >
            {day.weekday} {day.shortDate}
          </span>
          <span className={s.activityTimelineHours}>
            {HOURS.map(hour => {
              const bucket = hourly[day.key][hour];
              const hourLabel = `${String(hour).padStart(2, '0')}:00`;
              const title = bucket.count
                ? `${day.weekday} ${day.shortDate}, ${hourLabel}: ${bucketTimes(bucket)}`
                : `${day.weekday} ${day.shortDate}, ${hourLabel}: brak wejść`;
              return (
                <span
                  key={hour}
                  role="cell"
                  title={title}
                  aria-label={title}
                  className={`${s.activityHourCell} ${LEVEL_CLASS[activityLevel(bucket.count, 2)]}`}
                />
              );
            })}
          </span>
        </div>
      ))}
      <div className={s.activityTimelineRow} aria-hidden="true">
        <span />
        <span className={s.activityTimelineScale}>
          {HOUR_SCALE.map(label => <span key={label}>{label}</span>)}
        </span>
      </div>
    </div>
  );
}

function ActivityFeed({ groups }) {
  return (
    <div className={s.activityFeed} role="region" aria-label="Historia logowań i sesji" tabIndex={0}>
      {groups.map(group => (
        <section key={group.key} className={s.activityFeedGroup} aria-label={group.label}>
          <h4 className={s.activityFeedDay}>{group.label}</h4>
          <ul className={s.activityFeedList}>
            {group.entries.map(entry => {
              const name = entryName(entry);
              return (
                <li key={entry.id} className={s.activityFeedRow}>
                  <time className={s.activityFeedTime} dateTime={entry.created_at}>
                    {formatActivityTime(entry.created_at)}
                  </time>
                  <span className={s.activityFeedUser} title={entry.user_email || undefined}>
                    <span className={s.activityAvatar} aria-hidden="true">{initial(name)}</span>
                    <span className={s.activityFeedName}>{name}</span>
                  </span>
                  <span className={s.activityDeviceBadge} title={deviceLabel(entry.device_type)}>
                    <span aria-hidden="true">{deviceIcon(entry.device_type)}</span>
                    <span className={s.activityDeviceLabel}>{deviceLabel(entry.device_type)}</span>
                  </span>
                  <span className={s.activityFeedEvent}>
                    <span className={s.activityFeedEventLabel}>
                      {ACTIVITY_EVENT_LABELS[entry.event_type] || entry.event_type}
                    </span>
                    {entry.collapsedCount > 1 && (
                      <span
                        className={s.activityCollapsed}
                        title={`Scalono ${entriesLabel(entry.collapsedCount)} z odstępem poniżej 5 minut`}
                      >
                        ×{entry.collapsedCount}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function OwnerUserActivityPanel({
  profiles,
  presenceByUserId,
  logs,
  status,
  error,
  onRetry,
  now,
}) {
  const [selectedUserId, setSelectedUserId] = useState(ALL);
  const todayKey = activityDayKey(useCurrentTime(now));
  // Keyed by the calendar day, so the one-minute clock tick does not rebuild the grid.
  const today = useMemo(() => new Date(`${todayKey}T12:00:00`), [todayKey]);
  const days = useMemo(() => buildActivityDays(today), [today]);
  const entries = useMemo(() => collapseActivityDuplicates(logs), [logs]);
  const matrix = useMemo(() => buildDailyActivityMatrix(entries, days), [days, entries]);
  const selectedEmployee = profiles.find(employee => employee.id === selectedUserId) || null;
  const filteredEntries = useMemo(() => (
    selectedEmployee ? entries.filter(entry => entry.user_id === selectedEmployee.id) : entries
  ), [entries, selectedEmployee]);
  const groups = useMemo(() => groupActivityByDay(filteredEntries, { now: today }), [filteredEntries, today]);

  return (
    <details className={`${s.section} ${s.activitySection}`} open>
      <summary className={s.activitySummary}>
        <span>Aktywność użytkowników</span>
        <span className={s.activityHint}>7 dni · widoczne tylko dla właściciela</span>
        <span className={s.activityCount}>{entries.length}</span>
      </summary>

      <div className={s.activityContent}>
        <EmployeeFilterChips
          profiles={profiles}
          presenceByUserId={presenceByUserId}
          matrix={matrix}
          days={days}
          entryCount={entries.length}
          selectedUserId={selectedEmployee ? selectedEmployee.id : ALL}
          onSelect={setSelectedUserId}
          now={now}
        />

        {status === 'error' && (
          <div className={s.activityError} role="alert">
            <span>{error?.message || 'Nie udało się załadować aktywności.'}</span>
            <button type="button" onClick={onRetry}>Spróbuj ponownie</button>
          </div>
        )}

        <div className={s.activityBoard}>
          <div className={s.activityOverview}>
            {selectedEmployee
              ? <HourlyTimeline name={employeeName(selectedEmployee)} entries={filteredEntries} days={days} />
              : <DailyHeatmap profiles={profiles} matrix={matrix} days={days} />}
            <div className={s.activityLegend} aria-hidden="true">
              <span><span className={`${s.activityLegendSwatch} ${s.activityLevel0}`} />brak</span>
              <span>
                <span className={`${s.activityLegendSwatch} ${s.activityLevel1}`} />
                {selectedEmployee ? '1 wejście' : '1–2 wejścia'}
              </span>
              <span><span className={`${s.activityLegendSwatch} ${s.activityLevel2}`} />aktywna praca</span>
            </div>
          </div>

          <div className={s.activityFeedColumn}>
            {status === 'loading' && logs.length === 0 && (
              <div className={s.activityState} role="status">Ładowanie aktywności…</div>
            )}
            {status !== 'loading' && status !== 'error' && filteredEntries.length === 0 && (
              <div className={s.activityState}>Brak zapisanej aktywności.</div>
            )}
            {filteredEntries.length > 0 && <ActivityFeed groups={groups} />}
          </div>
        </div>
      </div>
    </details>
  );
}
