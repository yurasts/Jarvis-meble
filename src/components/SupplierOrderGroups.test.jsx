import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SupplierOrderGroups from './SupplierOrderGroups';

const biPlast = {
  id: 's-bi-plast',
  name: 'Bi-Plast',
  phone: '600 100 200',
  contact_person: 'Jan Nowak',
  address: 'ul. Fabryczna 1, Poznań',
  google_maps_url: '',
};

const link = (supplier, overrides = {}) => ({
  supplier_id: supplier.id,
  supplier,
  supplier_sku: '',
  is_preferred: true,
  ...overrides,
});

const materialsById = new Map([
  [1, { id: 1, material_suppliers: [link(biPlast, { supplier_sku: 'BP-1' })] }],
  [2, { id: 2, material_suppliers: [link(biPlast)] }],
  [3, { id: 3, material_suppliers: [] }],
]);

const items = [
  { id: 1, name: 'ABS W960 SM', quantity: 24, unit: 'mb' },
  { id: 2, name: 'Zawias puszkowy', quantity: 12, unit: 'szt' },
  { id: 3, name: 'Niestandardowy element', quantity: 1, unit: 'szt' },
];

describe('SupplierOrderGroups', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a Bez dostawcy empty state message when there are no project materials', () => {
    render(<SupplierOrderGroups items={[]} materialsById={materialsById} projectName="Kuchnia" />);
    expect(screen.getByText('Brak materiałów do zamówienia.')).toBeInTheDocument();
  });

  it('groups items by supplier, with Bez dostawcy last and no map/copy actions there', () => {
    render(<SupplierOrderGroups items={items} materialsById={materialsById} projectName="Kuchnia" />);

    expect(screen.getByText('Bi-Plast')).toBeInTheDocument();
    expect(screen.getByText('2 / 2 poz.')).toBeInTheDocument();
    expect(screen.getByText('Jan Nowak · 600 100 200')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mapa/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(biPlast.address),
    );

    const unassigned = screen.getByTestId('supplier-group-none');
    expect(within(unassigned).queryByRole('link', { name: /Mapa/ })).not.toBeInTheDocument();
    expect(within(unassigned).queryByRole('button', { name: /Kopiuj zamówienie/ })).not.toBeInTheDocument();
  });

  it('unchecking an item updates the counter and excludes it from the copied text', async () => {
    render(<SupplierOrderGroups items={items} materialsById={materialsById} projectName="Kuchnia" />);

    fireEvent.click(screen.getByText('ABS W960 SM'));
    expect(screen.getByText('1 / 2 poz.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Kopiuj zamówienie/ }));
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1));

    const text = navigator.clipboard.writeText.mock.calls[0][0];
    expect(text).toContain('Projekt: Kuchnia');
    expect(text).toContain('1. Zawias puszkowy — 12 szt');
    expect(text).not.toContain('ABS W960 SM');
    expect(text).not.toMatch(/\bzł\b/);
  });

  it('flashes ✓ Skopiowano! for 2 seconds after copying, then reverts', async () => {
    render(<SupplierOrderGroups items={items} materialsById={materialsById} projectName="Kuchnia" />);

    fireEvent.click(screen.getByRole('button', { name: /Kopiuj zamówienie/ }));
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: '✓ Skopiowano!' })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Kopiuj zamówienie/ })).toBeInTheDocument());
  });

  it('disables Kopiuj zamówienie once every item in the group is unchecked', () => {
    render(<SupplierOrderGroups items={items} materialsById={materialsById} projectName="Kuchnia" />);

    fireEvent.click(screen.getByText('ABS W960 SM'));
    fireEvent.click(screen.getByText('Zawias puszkowy'));

    expect(screen.getByRole('button', { name: /Kopiuj zamówienie/ })).toBeDisabled();
  });
});
