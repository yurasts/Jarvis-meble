import { useEffect, useState } from 'react';

// Отдельный, более узкий брейкпоинт для мобильного экрана Projekty (ADR-003, UX-фаза Mobile
// Field Mode — первая реализуемая фаза). Специально уже, чем существующий (max-width: 768px)
// в App.module.css/index.css, — на 768px desktop-логика и текущий мобильный топбар/dropdown
// должны остаться буквально без изменений, поэтому новый мобильный экран включается только
// строго до 767px.
const QUERY = '(max-width: 767px)';

export function useIsMobileShell() {
  const [isMobileShell, setIsMobileShell] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handler = (e) => setIsMobileShell(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobileShell;
}
