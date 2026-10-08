import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MaterialPicker from './MaterialPicker';

const colors = {
  bgInput: '#fff',
  bgHeader: '#eee',
  border: '#ccc',
  text: '#111',
  textLight: '#666',
  highlightBackground: '#def',
  replacementBackground: '#ffd',
  expandedBackground: '#f8f8f8',
  bgMaterialRow: '#eef',
  blueText: '#06c',
  blueButton: '#06c',
};

const material = {
  id: 'material-1',
  name: 'PL W960 2800x2070x18',
  price: 166.6,
  unit: 'szt',
  category: 'Plyta',
  supplier: 'ABC',
};

const renderPicker = (overrides = {}) => {
  const props = {
    compact: true,
    isMobileVariant: false,
    isOpen: true,
    searchTerm: '',
    highlightedIndex: 0,
    groups: [{
      key: 'board|W960',
      label: 'PL W960',
      offers: [material],
    }],
    categoryFilter: '',
    categoryOptions: ['Plyta', 'Okucia'],
    supplierFilter: '',
    supplierOptions: ['ABC', 'XYZ'],
    expandedGroupId: null,
    replacingMaterialIndex: null,
    selectedMaterials: [],
    pickerRef: { current: null },
    searchInputRef: { current: null },
    optionRefs: { current: [] },
    offerButtonRefs: { current: {} },
    colors,
    onClose: vi.fn(),
    onOpen: vi.fn(),
    onManualAdd: vi.fn(),
    onSearchFocus: vi.fn(),
    onSearchChange: vi.fn(),
    onSearchKeyDown: vi.fn(),
    onCategoryChange: vi.fn(),
    onSupplierChange: vi.fn(),
    onHighlight: vi.fn(),
    onToggleGroup: vi.fn(),
    onSelectMaterial: vi.fn(),
    ...overrides,
  };

  render(<MaterialPicker {...props} />);
  return props;
};

describe('MaterialPicker', () => {
  it('selects a material from a single-offer group', () => {
    const props = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: '+ Dodaj' }));

    expect(props.onSelectMaterial).toHaveBeenCalledWith(material);
  });

  it('forwards category and supplier filters', () => {
    const props = renderPicker();
    const comboboxes = screen.getAllByRole('combobox');

    fireEvent.change(comboboxes[1], { target: { value: 'Plyta' } });
    fireEvent.change(comboboxes[2], { target: { value: 'ABC' } });

    expect(props.onCategoryChange).toHaveBeenCalledWith('Plyta');
    expect(props.onSupplierChange).toHaveBeenCalledWith('ABC');
  });

  it('shows replacement context without selecting immediately', () => {
    renderPicker({
      replacingMaterialIndex: 0,
      selectedMaterials: [{ ...material, name: 'Old material' }],
    });

    expect(screen.getByText('Old material')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anuluj' })).toBeInTheDocument();
  });
});
