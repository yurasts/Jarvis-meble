import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MaterialsList from './MaterialsList';

vi.mock('../utils/useIsDesktop', () => ({ useIsDesktop: () => true }));
vi.mock('./InvoiceScanner', () => ({ default: () => null }));

const materials = [
  { id: 1, name: 'MERIVOBOX E wysoka szuflada zewnętrzna', category: 'Prowadnice', unit: 'kpl', price: 300 },
  { id: 2, name: 'Prowadnice Merivobox L-500 40kg (kpl L+P)', category: 'Prowadnice', unit: 'kpl', price: 25, is_kit_component: true },
  { id: 3, name: 'PL W960 SM Biały', category: 'Płyta', unit: 'szt', price: 180 },
];
const materialKitItems = [{ kit_material_id: 1, component_material_id: 2, quantity: 1 }];

const renderList = (props = {}) => render(
  <MaterialsList
    materials={materials}
    materialKitItems={materialKitItems}
    servicesList={[]}
    suppliers={[]}
    onAddMaterial={vi.fn()}
    onEditMaterial={vi.fn()}
    onCreateSupplier={vi.fn()}
    onUpdateSupplier={vi.fn()}
    onSetSupplierArchived={vi.fn()}
    onPricesUpdated={vi.fn()}
    onToggleFavorite={vi.fn()}
    {...props}
  />,
);

describe('MaterialsList', () => {
  it('hides is_kit_component rows by default', () => {
    renderList();
    expect(screen.getByText('MERIVOBOX E wysoka szuflada zewnętrzna')).toBeInTheDocument();
    expect(screen.getByText('PL W960 SM Biały')).toBeInTheDocument();
    expect(screen.queryByText('Prowadnice Merivobox L-500 40kg (kpl L+P)')).not.toBeInTheDocument();
  });

  it('reveals kit components via "Pokaż elementy składowe (N)"', () => {
    renderList();
    const toggle = screen.getByLabelText('Pokaż elementy składowe (1)');
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(screen.getByText('Prowadnice Merivobox L-500 40kg (kpl L+P)')).toBeInTheDocument();
  });

  it('does not show the toggle at all when nothing is a kit component', () => {
    renderList({ materials: materials.map(m => ({ ...m, is_kit_component: false })) });
    expect(screen.queryByText(/Pokaż elementy składowe/)).not.toBeInTheDocument();
  });

  it('shows the 🧩 Skład zestawu pill only next to a material that owns kit items', () => {
    renderList();
    expect(screen.getByRole('button', { name: '🧩 Skład zestawu (1 el.)' })).toBeInTheDocument();
  });

  it('expanding the pill lists the component with its quantity, price and value', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: '🧩 Skład zestawu (1 el.)' }));
    const row = screen.getByText('Prowadnice Merivobox L-500 40kg (kpl L+P)').closest('li');
    expect(row).toHaveTextContent('1 kpl');
    expect(row).toHaveTextContent('25.00');
  });
});
