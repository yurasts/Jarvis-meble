import s from './CatalogFavoriteButton.module.css';

const CatalogFavoriteButton = ({ item, kind, onToggle, compact = false }) => {
  const favorite = Boolean(item?.is_favorite);
  const activate = (event) => {
    event.preventDefault();
    event.stopPropagation();
    Promise.resolve(onToggle?.(kind, item)).catch(() => undefined);
  };
  return (
    <span className={s.wrap} data-compact={compact || undefined}>
      <button
        type="button"
        className={s.button}
        data-active={favorite || undefined}
        aria-label={favorite ? `Usuń ${item.name} z ulubionych` : `Dodaj ${item.name} do ulubionych`}
        aria-pressed={favorite}
        title={favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
        onClick={activate}
      >
        {favorite ? '★' : '☆'}
      </button>
      {Number(item?.usage_count) > 0 && (
        <span className={s.usage} aria-label={`Użyto w ${item.usage_count} projektach`}>
          ×{item.usage_count}
        </span>
      )}
    </span>
  );
};

export default CatalogFavoriteButton;
