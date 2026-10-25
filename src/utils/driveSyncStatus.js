export const DRIVE_SYNC_HEARTBEAT_FRESH_MS = 90 * 1000;
export const DEFAULT_DRIVE_SYNC_ROOT = String.raw`G:\Mój dysk\_Jarvis\Projekty`;

export const isDriveSyncActive = (
  state,
  now = Date.now(),
  freshnessMs = DRIVE_SYNC_HEARTBEAT_FRESH_MS,
) => {
  const heartbeatAt = Date.parse(state?.last_heartbeat_at || '');
  const leaseUntil = Date.parse(state?.lease_until || '');
  return Number.isFinite(heartbeatAt)
    && Number.isFinite(leaseUntil)
    && heartbeatAt >= now - freshnessMs
    && leaseUntil > now;
};

export const formatDriveSyncTimestamp = (value) => {
  if (!value) return 'Brak danych';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Brak danych';
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

export const driveSyncCounts = (state) => {
  const summary = state?.last_sync_summary;
  return {
    projects: Number.isFinite(Number(summary?.projects)) ? Number(summary.projects) : 0,
    files: Number.isFinite(Number(summary?.files)) ? Number(summary.files) : 0,
  };
};
