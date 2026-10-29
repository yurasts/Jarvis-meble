import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SuppliersDirectory from './SuppliersDirectory';

const supplier = {
  id: 's1',
  name: 'Alfa Płyty',
  address: 'ul. Długa 12, Gdańsk',
  google_maps_url: '',
  phone: '+48 500 100 200',
  email: 'biuro@alfa.test',
  contact_person: 'Anna',
  notes: 'Odbiór z magazynu',
  is_archived: false,
  material_count: 3,
};

const renderDirectory = (overrides = {}) => {
  const props = {
    suppliers: [supplier],
    onCreate: vi.fn(async fields => ({ id: 's2', ...fields })),
    onUpdate: vi.fn(async () => supplier),
    onSetArchived: vi.fn(async () => supplier),
    ...overrides,
  };
  return { ...render(<SuppliersDirectory {...props} />), props };
};

describe('SuppliersDirectory', () => {
  it('shows contacts, linked material count and a safe Google Maps link', () => {
    renderDirectory();
    expect(screen.getByText('3 mat.')).toBeInTheDocument();
    const mapLinks = screen.getAllByRole('link', { name: /Mapa|Długa/ });
    expect(mapLinks[0]).toHaveAttribute('href', expect.stringContaining('google.com/maps/search'));
    expect(mapLinks[0]).toHaveAttribute('target', '_blank');
    expect(mapLinks[0]).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('filters the directory and archives a supplier', async () => {
    const user = userEvent.setup();
    const { props } = renderDirectory();
    await user.type(screen.getByLabelText('Szukaj dostawcy'), 'brak');
    expect(screen.getByText('Brak dostawców spełniających kryteria.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Szukaj dostawcy'));
    await user.click(screen.getByRole('button', { name: 'Archiwizuj' }));
    expect(props.onSetArchived).toHaveBeenCalledWith('s1', true);
  });

  it('creates a supplier with the complete directory form', async () => {
    const user = userEvent.setup();
    const { props } = renderDirectory({ suppliers: [] });
    await user.click(screen.getByRole('button', { name: '+ Nowy dostawca' }));
    await user.type(screen.getByLabelText('Nazwa'), 'Beta Okucia');
    await user.type(screen.getByLabelText('Adres'), 'Warszawa');
    await user.type(screen.getByLabelText('E-mail'), 'beta@example.test');
    await user.click(screen.getByRole('button', { name: 'Zapisz' }));
    expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Beta Okucia',
      address: 'Warszawa',
      email: 'beta@example.test',
    }));
  });
});
