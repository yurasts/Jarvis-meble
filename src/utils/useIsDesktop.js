import { useEffect, useState } from 'react';

// Тот же брейкпоинт, что уже используется во всём приложении (App.module.css, index.css):
// @media (max-width: 768px) — мобильный вид. Здесь — обратное условие для выбора
// embedded-рабочей области (desktop) vs модального окна (mobile fallback).
const QUERY = '(min-width: 769px)';

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handler = (e) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}
