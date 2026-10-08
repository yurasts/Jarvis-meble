import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MobileProjectItemRow from './MobileProjectItemRow';

const baseProps = (overrides = {}) => ({
  field: 'calc_materials',
  item: { id: 'mat-1', name: 'Fronty', price: 12.5, quantity: 2 },
  isExpanded: false,
  isConfirmingDelete: false,
  isReplacingMaterial: false,
  priceDraft: '12.5',
  quantityDraft: undefined,
  accent: { text: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
  colors: {
    bgHeader: '#e2e8f0',
    bgInput: '#fff',
    border: '#cbd5e1',
    text: '#111827',
    textLight: '#64748b',
    rowStripe: '#2563eb',
    replacementBackground: '#dbeafe',
  },
  onOpen: vi.fn(),
  onFinishEditing: vi.fn(),
  onPriceDraftChange: vi.fn(),
  onPriceSave: vi.fn(),
  onQuantityFocus: vi.fn(),
  onQuantityChange: vi.fn(),
  onQuantityCommit: vi.fn(),
  onRequestDelete: vi.fn(),
  onCancelDelete: vi.fn(),
  onRemove: vi.fn(),
  onStartMaterialReplacement: vi.fn(),
  ...overrides,
});

describe('MobileProjectItemRow', () => {
  it('renders a compact row and opens it by click or keyboard', () => {
    const props = baseProps();
    render(<MobileProjectItemRow {...props} />);

    const row = screen.getByText('Fronty').parentElement;
    expect(screen.getByText(/25[.]00/)).toBeInTheDocument();

    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(props.onOpen).toHaveBeenCalledTimes(2);
  });

  it('keeps editor callbacks explicit in expanded mode', () => {
    const props = baseProps({ isExpanded: true });
    render(<MobileProjectItemRow {...props} />);

    const priceInput = screen.getByRole('spinbutton');
    const quantityInput = screen.getByRole('textbox');
    fireEvent.change(priceInput, { target: { value: '20' } });
    fireEvent.blur(priceInput);
    fireEvent.focus(quantityInput);
    fireEvent.change(quantityInput, { target: { value: '3' } });
    fireEvent.blur(quantityInput);
    fireEvent.click(screen.getByText('Gotowe').closest('button'));

    expect(props.onPriceDraftChange).toHaveBeenCalledWith('20');
    expect(props.onPriceSave).toHaveBeenCalled();
    expect(props.onQuantityFocus).toHaveBeenCalledWith(2);
    expect(props.onQuantityChange).toHaveBeenCalledWith('3');
    expect(props.onQuantityCommit).toHaveBeenCalled();
    expect(props.onFinishEditing).toHaveBeenCalled();
  });

  it('requires an explicit confirmation before removal', () => {
    const props = baseProps({ isConfirmingDelete: true });
    render(<MobileProjectItemRow {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tak' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nie' }));
    expect(props.onRemove).toHaveBeenCalledOnce();
    expect(props.onCancelDelete).toHaveBeenCalledOnce();
  });

  it('starts material replacement without opening the row', () => {
    const props = baseProps();
    render(<MobileProjectItemRow {...props} />);

    fireEvent.click(screen.getByTitle(/Zam/));
    expect(props.onStartMaterialReplacement).toHaveBeenCalledOnce();
    expect(props.onOpen).not.toHaveBeenCalled();
  });
});