import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CatalogFavoriteButton from './CatalogFavoriteButton';

describe('CatalogFavoriteButton', () => {
  it('stops the parent click and requests an immediate favorite toggle', () => {
    const onToggle = vi.fn();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <CatalogFavoriteButton
          kind="material"
          item={{ id: 7, name: 'Board', is_favorite: false, usage_count: 3 }}
          onToggle={onToggle}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj Board do ulubionych' }));
    expect(onToggle).toHaveBeenCalledWith('material', expect.objectContaining({ id: 7 }));
    expect(parentClick).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Użyto w 3 projektach')).toHaveTextContent('×3');
  });
});
