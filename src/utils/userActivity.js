export const ACTIVITY_EVENT_LABELS = Object.freeze({
  sign_in: 'Logowanie',
  session_start: 'Otwarcie aplikacji',
});

export const ACTIVITY_DEVICE_LABELS = Object.freeze({
  mobile: 'Telefon',
  desktop: 'Komputer',
});

export const ACTIVITY_DEVICE_ICONS = Object.freeze({
  mobile: '📱',
  desktop: '💻',
});

export const ONLINE_WINDOW_MS = 6 * 60 * 1000;

export const detectDeviceType = ({
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  viewportWidth = typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth,
} = {}) => (/Android|iPhone|iPad|iPod|IEMobile|Mobile/i.test(userAgent) || viewportWidth < 768
  ? 'mobile'
  : 'desktop');

export const summarizeUserAgent = (userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) => {
  const source = String(userAgent || '');
  const browser = /Edg\//i.test(source)
    ? 'Edge'
    : /Firefox\//i.test(source)
      ? 'Firefox'
      : /Chrome\//i.test(source)
        ? 'Chrome'
        : /Safari\//i.test(source)
          ? 'Safari'
          : '';
  const system = /iPhone|iPad|iPod/i.test(source)
    ? 'iOS'
    : /Android/i.test(source)
      ? 'Android'
      : /Windows/i.test(source)
        ? 'Windows'
        : /Macintosh|Mac OS X/i.test(source)
          ? 'macOS'
          : /Linux/i.test(source)
            ? 'Linux'
            : '';
  const summary = [browser, system].filter(Boolean).join(' · ');
  return summary || source.slice(0, 255) || null;
};

export const isUserOnline = (lastSeenAt, now = Date.now()) => {
  const timestamp = new Date(lastSeenAt).getTime();
  return Number.isFinite(timestamp) && timestamp >= now - ONLINE_WINDOW_MS;
};

const timeFormatter = (locale) => new Intl.DateTimeFormat(locale, {
  hour: '2-digit',
  minute: '2-digit',
});

export const formatLastSeen = (lastSeenAt, deviceType, {
  now = new Date(),
  locale = 'pl-PL',
} = {}) => {
  if (!lastSeenAt) return 'Brak danych';
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return 'Brak danych';

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const seenDay = new Date(seen.getFullYear(), seen.getMonth(), seen.getDate());
  const sameDay = today.getTime() === seenDay.getTime();
  const datePart = sameDay
    ? 'dziś'
    : new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: seen.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    }).format(seen);
  const icon = ACTIVITY_DEVICE_ICONS[deviceType] || '';
  return `Ostatnio: ${datePart}, ${timeFormatter(locale).format(seen)}${icon ? ` (${icon})` : ''}`;
};

export const formatActivityTimestamp = (createdAt, locale = 'pl-PL') => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

// Supabase may emit SIGNED_IN more than once for one real login (tab refocus,
// several tabs). Entries of one user on one device closer than this are one event.
export const ACTIVITY_DUPLICATE_WINDOW_MS = 5 * 60 * 1000;
export const ACTIVITY_DAYS = 7;

const toTime = (value) => new Date(value).getTime();

/**
 * Collapses rows of the same user and device that follow each other within the
 * duplicate window. The newest row stays as the visible entry; a sign-in inside
 * the cluster wins over a plain app open, because it is the more telling event.
 * Input order does not matter; output is sorted newest first.
 */
export const collapseActivityDuplicates = (logs, windowMs = ACTIVITY_DUPLICATE_WINDOW_MS) => {
  const sorted = (logs || [])
    .filter(log => Number.isFinite(toTime(log.created_at)))
    .sort((a, b) => toTime(b.created_at) - toTime(a.created_at));
  const openClusterByKey = new Map();
  const entries = [];

  for (const log of sorted) {
    const key = `${log.user_id}|${log.device_type}`;
    const cluster = openClusterByKey.get(key);
    const time = toTime(log.created_at);
    if (cluster && cluster.oldestTime - time < windowMs) {
      cluster.oldestTime = time;
      cluster.entry.collapsedCount += 1;
      if (log.event_type === 'sign_in') cluster.entry.event_type = 'sign_in';
      continue;
    }
    const entry = { ...log, collapsedCount: 1 };
    openClusterByKey.set(key, { entry, oldestTime: time });
    entries.push(entry);
  }

  return entries;
};

const pad2 = (value) => String(value).padStart(2, '0');

export const activityDayKey = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const startOfDay = (value) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const shortDate = (date) => `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}`;

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** Last `count` calendar days, oldest first, so a timeline reads left to right. */
export const buildActivityDays = (now = new Date(), count = ACTIVITY_DAYS, locale = 'pl-PL') => {
  const today = startOfDay(now);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - 1 - index));
    return {
      key: activityDayKey(date),
      date,
      weekday: weekday.format(date).replace('.', ''),
      shortDate: shortDate(date),
      isToday: index === count - 1,
    };
  });
};

/** 0 = no activity, 1 = one or two entries, 2 = active work. */
export const activityLevel = (count, activeFrom = 3) => {
  if (!count) return 0;
  return count >= activeFrom ? 2 : 1;
};

const emptyBucket = () => ({ count: 0, devices: [], entries: [] });

const addToBucket = (bucket, entry) => {
  bucket.count += 1;
  bucket.entries.push(entry);
  if (!bucket.devices.includes(entry.device_type)) bucket.devices.push(entry.device_type);
};

/** { [userId]: { [dayKey]: bucket } } for the given days; entries outside them are ignored. */
export const buildDailyActivityMatrix = (entries, days) => {
  const dayKeys = new Set(days.map(day => day.key));
  const matrix = {};
  for (const entry of entries) {
    const dayKey = activityDayKey(entry.created_at);
    if (!dayKeys.has(dayKey)) continue;
    const row = matrix[entry.user_id] || (matrix[entry.user_id] = {});
    addToBucket(row[dayKey] || (row[dayKey] = emptyBucket()), entry);
  }
  return matrix;
};

/** { [dayKey]: bucket[24] } for one user's entries, bucketed by local hour. */
export const buildHourlyActivity = (entries, days) => {
  const byDay = Object.fromEntries(days.map(day => [day.key, Array.from({ length: 24 }, emptyBucket)]));
  for (const entry of entries) {
    const hours = byDay[activityDayKey(entry.created_at)];
    if (hours) addToBucket(hours[new Date(entry.created_at).getHours()], entry);
  }
  return byDay;
};

export const formatActivityTime = (createdAt, locale = 'pl-PL') => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '—';
  return timeFormatter(locale).format(date);
};

/** Compact last-seen label for small cards: "dziś, 14:12" or "24.10, 14:12". */
export const formatShortLastSeen = (lastSeenAt, { now = new Date(), locale = 'pl-PL' } = {}) => {
  if (!lastSeenAt) return 'Brak danych';
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return 'Brak danych';
  const sameDay = activityDayKey(seen) === activityDayKey(now);
  const sameYear = seen.getFullYear() === new Date(now).getFullYear();
  const datePart = sameDay ? 'dziś' : `${shortDate(seen)}${sameYear ? '' : `.${seen.getFullYear()}`}`;
  return `${datePart}, ${timeFormatter(locale).format(seen)}`;
};

/** Day headings for the feed: "Dziś (25.10)", "Wczoraj (24.10)", "Czwartek (22.10)". */
export const formatActivityDayHeading = (value, { now = new Date(), locale = 'pl-PL' } = {}) => {
  const day = startOfDay(value);
  const diffDays = Math.round((startOfDay(now).getTime() - day.getTime()) / (24 * 60 * 60 * 1000));
  const datePart = day.getFullYear() === new Date(now).getFullYear()
    ? shortDate(day)
    : `${shortDate(day)}.${day.getFullYear()}`;
  if (diffDays === 0) return `Dziś (${datePart})`;
  if (diffDays === 1) return `Wczoraj (${datePart})`;
  return `${capitalize(new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(day))} (${datePart})`;
};

/** Splits newest-first entries into consecutive day groups for the feed. */
export const groupActivityByDay = (entries, options) => {
  const groups = [];
  for (const entry of entries) {
    const key = activityDayKey(entry.created_at);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: formatActivityDayHeading(entry.created_at, options), entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
};
