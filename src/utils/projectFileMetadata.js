const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

const fileSizeValue = (file) => {
  const raw = file?.size_bytes ?? file?.size ?? file?.file_size;
  const size = Number(raw);
  return Number.isFinite(size) && size >= 0 ? size : null;
};

const fileDateValue = (file) => (
  file?.updated_at
  || file?.created_at
  || file?.uploaded_at
  || file?.last_synced_at
  || null
);

export const formatProjectFileSize = (file) => {
  const size = fileSizeValue(file);
  if (size === null) return '';
  if (size === 0) return '0 B';

  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), FILE_SIZE_UNITS.length - 1);
  const value = size / (1024 ** unitIndex);
  const rounded = value >= 10 || unitIndex === 0 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '');
  return `${rounded} ${FILE_SIZE_UNITS[unitIndex]}`;
};

export const formatProjectFileDate = (file, { includeYear = true } = {}) => {
  const raw = fileDateValue(file);
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    ...(includeYear ? { year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Warsaw',
  }).format(date);
};

export const projectFileMetadataLabel = (file, { includeYear = true } = {}) => (
  [formatProjectFileSize(file), formatProjectFileDate(file, { includeYear })]
    .filter(Boolean)
    .join(' · ')
);

export const projectFileDisplayLabel = (file, options = {}) => (
  [file?.file_name, projectFileMetadataLabel(file, options)]
    .filter(Boolean)
    .join(' · ')
);
