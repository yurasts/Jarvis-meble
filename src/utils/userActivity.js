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
