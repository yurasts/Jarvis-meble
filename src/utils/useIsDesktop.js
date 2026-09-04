import { useEffect, useState } from 'react';

// Единая граница mobile shell / desktop-tablet (исправлено — раньше isDesktop начинался с 769px,
// а mobile shell заканчивался на 767px, оставляя 768px в неопределённом состоянии без десктопного
// сайдбара и без мобильного экрана Projekty). Теперь ровно те же 768px, что и во всём приложении
// (App.module.css, Dashboard.module.css, ProjectNav.module.css, index.css: @media (max-width: 767px)):
// mobile shell — до 767px включительно, desktop/tablet (в т.ч. iPad portrait, 768px) — с 768px.
const DESKTOP_QUERY = '(min-width: 768px)';
const PHONE_LANDSCAPE_QUERY = '(max-width: 1024px) and (max-height: 500px) and (pointer: coarse)';

const matchesDesktopLayout = () => (
  window.matchMedia(DESKTOP_QUERY).matches &&
  !window.matchMedia(PHONE_LANDSCAPE_QUERY).matches
);

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && matchesDesktopLayout()
  );

  useEffect(() => {
    const desktopMql = window.matchMedia(DESKTOP_QUERY);
    const phoneLandscapeMql = window.matchMedia(PHONE_LANDSCAPE_QUERY);
    const update = () => setIsDesktop(matchesDesktopLayout());

    desktopMql.addEventListener('change', update);
    phoneLandscapeMql.addEventListener('change', update);
    return () => {
      desktopMql.removeEventListener('change', update);
      phoneLandscapeMql.removeEventListener('change', update);
    };
  }, []);

  return isDesktop;
}
