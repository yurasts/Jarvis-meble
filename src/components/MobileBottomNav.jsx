import { forwardRef } from 'react';
import { List, Wrench, Package, Menu } from 'lucide-react';
import s from './MobileBottomNav.module.css';

// Нижняя мобильная навигация (ADR-003, Mobile Field Mode — первая реализуемая фаза).
// Ровно 4 стабильных пункта. "Produkcja"/"Materiały" ведут в уже существующие разделы через
// уже существующую goToTab (см. App.jsx) — новых экранов не создаётся. "Więcej" открывает уже
// существующее выпадающее меню мобильного топбара (Panel/Tablica projektów/Ustawienia/профиль/
// выход) — тоже не новый экран, а переиспользование текущей навигации.
const ITEMS = [
  { key: 'projekty',   label: 'Projekty',  Icon: List },
  { key: 'production', label: 'Produkcja', Icon: Wrench },
  { key: 'materials',  label: 'Materiały', Icon: Package },
  { key: 'wiecej',     label: 'Więcej',    Icon: Menu },
];

const MobileBottomNav = forwardRef(function MobileBottomNav(
  { active, onProjekty, onProdukcja, onMaterialy, onWiecej },
  ref
) {
  const handlers = {
    projekty: onProjekty,
    production: onProdukcja,
    materials: onMaterialy,
    wiecej: onWiecej,
  };

  return (
    <nav className={s.nav} ref={ref} aria-label="Nawigacja mobilna">
      {ITEMS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          className={`${s.navBtn} ${active === key ? s.navBtnActive : ''}`}
          aria-current={active === key ? 'page' : undefined}
          title={label}
          onClick={handlers[key]}
        >
          <Icon size={20} strokeWidth={2} aria-hidden="true" />
          <span className={s.navLabel}>{label}</span>
        </button>
      ))}
    </nav>
  );
});

export default MobileBottomNav;
