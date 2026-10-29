import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DesktopProjectItemsTable from './DesktopProjectItemsTable';

const baseProps = {
  kind: 'materials',
  entries: [{ item: { id: 1, name: 'Płyta', price: 10, unit: 'szt', quantity: 2 }, index: 0 }],
  expandedItemKey: null,
  editingPrice: null,
  priceDraft: '',
  quantityDrafts: {},
  rowStripe: () => '#000',
  onToggleExpanded: vi.fn(),
  onStartReplacement: vi.fn(),
  onStartPriceEdit: vi.fn(),
  onPriceDraftChange: vi.fn(),
  onPriceSave: vi.fn(),
  onCancelPriceEdit: vi.fn(),
  onQuantityFocus: vi.fn(),
  onQuantityChange: vi.fn(),
  onQuantityCommit: vi.fn(),
  renderDeleteCell: () => <td key="del" />,
};

describe('DesktopProjectItemsTable supplier column', () => {
  it('renders no supplier column or cell by default', () => {
    render(<table><tbody><DesktopProjectItemsTable {...baseProps} /></tbody></table>);
    expect(screen.queryByText('Dostawca')).not.toBeInTheDocument();
  });

  it('renders the Dostawca header and cell content only when showSupplierColumn is set', () => {
    render(
      <table>
        <tbody>
          <DesktopProjectItemsTable
            {...baseProps}
            showHeader
            showSupplierColumn
            renderSupplierCell={item => <span>Dostawca: {item.name}</span>}
          />
        </tbody>
      </table>,
    );
    expect(screen.getByRole('columnheader', { name: 'Dostawca' })).toBeInTheDocument();
    expect(screen.getByText('Dostawca: Płyta')).toBeInTheDocument();
  });

  it('spans the empty-state row across the widened column count with the supplier column', () => {
    render(
      <table>
        <tbody>
          <DesktopProjectItemsTable {...baseProps} entries={[]} showSupplierColumn renderSupplierCell={() => null} />
        </tbody>
      </table>,
    );
    // materials (showUnit=true) → 6 base columns + 1 supplier column = 7.
    expect(screen.getByText('Brak dodanych materiałów').closest('td')).toHaveAttribute('colspan', '7');
  });

  it('does not add a supplier column for non-material tables even when requested', () => {
    render(
      <table>
        <tbody>
          <DesktopProjectItemsTable
            {...baseProps}
            kind="services"
            entries={[{ item: { id: 1, name: 'Usługa', price: 10, quantity: 1 }, index: 0 }]}
            showHeader
            showSupplierColumn
            renderSupplierCell={() => <span>should not render</span>}
          />
        </tbody>
      </table>,
    );
    expect(screen.queryByText('Dostawca')).not.toBeInTheDocument();
    expect(screen.queryByText('should not render')).not.toBeInTheDocument();
  });
});
