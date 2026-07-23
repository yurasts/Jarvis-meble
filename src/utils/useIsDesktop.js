import { useEffect, useState } from 'react';

// Единая граница mobile shell / desktop-tablet (исправлено — раньше isDesktop начинался с 769px,
// а mobile shell заканчивался на 767px, оставляя 768px в неопределённом состоянии без десктопного
// сайдбара и без мобильного экрана Projekty). Теперь ровно те же 768px, что и во всём приложении
// (App.module.css, Dashboard.module.css, ProjectNav.module.css, index.css: @media (max-width: 767px)):
// mobile shell — до 767px включительно, desktop/tablet (в т.ч. iPad portrait, 768px) — с 768px.
const QUERY = '(min-width: 768px)';

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
