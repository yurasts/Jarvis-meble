import { forwardRef } from 'react';
import { List, FolderKanban, Package, Settings } from 'lucide-react';
import s from './MobileBottomNav.module.css';

// Четыре главных мобильных раздела доступны напрямую, без промежуточного меню "Więcej".
const ITEMS = [
  { key: 'projekty',  label: 'Projekty',          Icon: List },
  { key: 'board',     label: 'Tablica projektów', Icon: FolderKanban },
  { key: 'materials', label: 'Materiały',         Icon: Package },
  { key: 'settings',  label: 'Ustawienia',        Icon: Settings },
];

const MobileBottomNav = forwardRef(function MobileBottomNav(
  { active, onProjekty, onTablica, onMaterialy, onUstawienia },
  ref
) {
  const handlers = {
    projekty: onProjekty,
    board: onTablica,
    materials: onMaterialy,
    settings: onUstawienia,
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
