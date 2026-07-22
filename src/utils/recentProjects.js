// Локальный (per-browser) порядок "недавно открытых" проектов для панели навигации.
// Хранится только в localStorage — в БД ничего не добавляется и не читается.

const STORAGE_KEY = 'jarvis.recentProjectIds';
const MAX_ITEMS = 30;

export function getRecentProjectIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function markProjectOpened(id) {
  if (id === undefined || id === null) return;
  try {
    const next = [id, ...getRecentProjectIds().filter((x) => x !== id)].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — молча игнорируем, это не критично
  }
}
