import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ServicePicker from './ServicePicker';

const colors = {
  bgInput: '#fff',
  bgHeader: '#eee',
  border: '#ccc',
  text: '#111',
  textLight: '#666',
  highlightBackground: '#def',
  selectedBackground: '#efe',
  accent: '#167',
};

const renderPicker = (overrides = {}) => {
  const props = {
    compact: true,
    isMobileVariant: false,
    isOpen: true,
    searchTerm: '',
    highlightedIndex: 0,
    services: [
      { id: 'service-1', name: 'Transport', price: 200, unit: 'szt' },
      { id: 'service-2', name: 'Montaz', price: 350, unit: 'szt' },
    ],
    selectedServices: [],
    pickerRef: { current: null },
    searchInputRef: { current: null },
    optionRefs: { current: [] },
    colors,
    onClose: vi.fn(),
    onOpen: vi.fn(),
    onManualAdd: vi.fn(),
    onSearchFocus: vi.fn(),
    onSearchChange: vi.fn(),
    onSearchKeyDown: vi.fn(),
    onHighlight: vi.fn(),
    onSelectService: vi.fn(),
    ...overrides,
  };

  render(<ServicePicker {...props} />);
  return props;
};

describe('ServicePicker', () => {
  it('renders available services and selects a service', () => {
    const props = renderPicker();

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Transport' }));

    expect(props.onSelectService).toHaveBeenCalledWith(props.services[0]);
  });

  it('forwards search changes to its controller', () => {
    const props = renderPicker();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'trans' } });

    expect(props.onSearchChange).toHaveBeenCalledWith('trans');
  });

  it('opens the manual entry flow', () => {
    const props = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: /R\u0119cznie/ }));

    expect(props.onManualAdd).toHaveBeenCalledOnce();
  });
});
