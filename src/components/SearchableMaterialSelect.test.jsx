import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SearchableMaterialSelect from './SearchableMaterialSelect';

const items = [
  { id: 101, name: 'PL W960 SM Biały', symbol: 'W960', category: 'Płyta', price: 180, unit: 'szt' },
  { id: 102, name: 'U702 ST9 Kaszmir', symbol: 'U702', category: 'Płyta', price: 220.5, unit: 'szt' },
  { id: 103, name: 'ABS W960 SM Biały', category: 'Obrzeże', price: 1.13, unit: 'mb' },
];

describe('SearchableMaterialSelect', () => {
  it('shows the placeholder (no price badge) when nothing is selected', () => {
    render(<SearchableMaterialSelect items={items} value="" onChange={() => {}} ariaLabel="Płyta korpusu" />);
    const trigger = screen.getByLabelText('Płyta korpusu');
    expect(trigger).toHaveTextContent('— nie wybrano —');
    expect(trigger).not.toHaveTextContent('zł');
  });

  it('shows the selected material name and a bold price badge on the trigger', () => {
    render(<SearchableMaterialSelect items={items} value={101} onChange={() => {}} ariaLabel="Płyta korpusu" />);
    const trigger = screen.getByLabelText('Płyta korpusu');
    expect(trigger).toHaveTextContent('PL W960 SM Biały');
    expect(trigger).toHaveTextContent('180.00 zł / szt');
  });

  it('resolves the selected item even when value is a string and item.id is a number (Postgres vs <select>)', () => {
    render(<SearchableMaterialSelect items={items} value="101" onChange={() => {}} ariaLabel="Płyta korpusu" />);
    expect(screen.getByLabelText('Płyta korpusu')).toHaveTextContent('PL W960 SM Biały');
  });

  it('opens a popover with a search input and every item showing its price, on click', () => {
    render(<SearchableMaterialSelect items={items} value="" onChange={() => {}} ariaLabel="Płyta korpusu" />);
    fireEvent.click(screen.getByLabelText('Płyta korpusu'));

    expect(screen.getByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…')).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    // +1 dla pozycji "— nie wybrano —" na górze listy.
    expect(options).toHaveLength(items.length + 1);
    expect(screen.getByRole('option', { name: /PL W960 SM Biały.*180\.00 zł \/ szt/s })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /ABS W960 SM Biały.*1\.13 zł \/ mb/s })).toBeInTheDocument();
  });

  it('filters the list by name as the user types in the search box', () => {
    render(<SearchableMaterialSelect items={items} value="" onChange={() => {}} ariaLabel="Płyta korpusu" />);
    fireEvent.click(screen.getByLabelText('Płyta korpusu'));

    fireEvent.change(screen.getByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…'), { target: { value: 'kaszmir' } });

    expect(screen.getByRole('option', { name: /U702 ST9 Kaszmir/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /PL W960 SM Biały/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /ABS W960 SM Biały/ })).not.toBeInTheDocument();
  });

  it('filters by symbol/code too, not just by name', () => {
    render(<SearchableMaterialSelect items={items} value="" onChange={() => {}} ariaLabel="Płyta korpusu" />);
    fireEvent.click(screen.getByLabelText('Płyta korpusu'));
    fireEvent.change(screen.getByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…'), { target: { value: 'u702' } });
    expect(screen.getByRole('option', { name: /U702 ST9 Kaszmir/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /PL W960 SM Biały/ })).not.toBeInTheDocument();
  });

  it('shows a "Brak wyników" message when the search matches nothing', () => {
    render(<SearchableMaterialSelect items={items} value="" onChange={() => {}} ariaLabel="Płyta korpusu" />);
    fireEvent.click(screen.getByLabelText('Płyta korpusu'));
    fireEvent.change(screen.getByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…'), { target: { value: 'nieistniejący' } });
    expect(screen.getByText('Brak wyników')).toBeInTheDocument();
  });

  it('marks the currently selected option with a checkmark', () => {
    render(<SearchableMaterialSelect items={items} value={102} onChange={() => {}} ariaLabel="Płyta korpusu" />);
    fireEvent.click(screen.getByLabelText('Płyta korpusu'));
    const selectedOption = screen.getByRole('option', { name: /U702 ST9 Kaszmir/ });
    expect(selectedOption).toHaveAttribute('aria-selected', 'true');
    expect(selectedOption).toHaveTextContent('✓');
  });

  it('calls onChange with the item id and closes the popover when an option is clicked', () => {
    const onChange = vi.fn();
    render(<SearchableMaterialSelect items={items} value="" onChange={onChange} ariaLabel="Płyta korpusu" />);
    fireEvent.click(screen.getByLabelText('Płyta korpusu'));

    fireEvent.click(screen.getByRole('option', { name: /U702 ST9 Kaszmir/ }));

    expect(onChange).toHaveBeenCalledWith(102);
    expect(screen.queryByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…')).not.toBeInTheDocument();
  });

  it('clicking the empty "— nie wybrano —" option calls onChange with an empty string', () => {
    const onChange = vi.fn();
    render(<SearchableMaterialSelect items={items} value={101} onChange={onChange} ariaLabel="Płyta korpusu" />);
    fireEvent.click(screen.getByLabelText('Płyta korpusu'));
    fireEvent.click(screen.getByRole('option', { name: '— nie wybrano —' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('a custom emptyLabel (e.g. "Domyślna z projektu") replaces the default placeholder text', () => {
    render(
      <SearchableMaterialSelect items={items} value="" onChange={() => {}} ariaLabel="Płyta korpusu tej szafki" emptyLabel="Domyślna z projektu" />,
    );
    expect(screen.getByLabelText('Płyta korpusu tej szafki')).toHaveTextContent('Domyślna z projektu');
    fireEvent.click(screen.getByLabelText('Płyta korpusu tej szafki'));
    expect(screen.getByRole('option', { name: 'Domyślna z projektu' })).toBeInTheDocument();
  });

  it('closes on Escape without changing the selection', () => {
    const onChange = vi.fn();
    render(<SearchableMaterialSelect items={items} value={101} onChange={onChange} ariaLabel="Płyta korpusu" />);
    fireEvent.click(screen.getByLabelText('Płyta korpusu'));
    expect(screen.getByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…'), { key: 'Escape' });

    expect(screen.queryByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes when clicking outside the component', () => {
    render(
      <div>
        <SearchableMaterialSelect items={items} value="" onChange={() => {}} ariaLabel="Płyta korpusu" />
        <button type="button">outside</button>
      </div>,
    );
    fireEvent.click(screen.getByLabelText('Płyta korpusu'));
    expect(screen.getByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('outside'));

    expect(screen.queryByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…')).not.toBeInTheDocument();
  });

  it('Enter selects the first (highlighted-by-default) option', () => {
    const onChange = vi.fn();
    render(<SearchableMaterialSelect items={items} value="" onChange={onChange} ariaLabel="Płyta korpusu" />);
    fireEvent.click(screen.getByLabelText('Płyta korpusu'));
    const search = screen.getByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…');

    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(101);
  });

  it('ArrowDown moves the highlight to the next item before Enter selects it', () => {
    const onChange = vi.fn();
    render(<SearchableMaterialSelect items={items} value="" onChange={onChange} ariaLabel="Płyta korpusu" />);
    fireEvent.click(screen.getByLabelText('Płyta korpusu'));
    const search = screen.getByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…');

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(102);
  });

  it('a disabled select shows no caret interaction and never opens the popover', () => {
    render(<SearchableMaterialSelect items={items} value={101} onChange={() => {}} ariaLabel="Obrzeże korpusu" disabled />);
    const trigger = screen.getByLabelText('Obrzeże korpusu');
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(trigger);
    expect(screen.queryByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…')).not.toBeInTheDocument();
  });

  it('allowEmpty=false hides the "— nie wybrano —" option (required-but-already-guaranteed roles)', () => {
    render(<SearchableMaterialSelect items={items} value={101} onChange={() => {}} ariaLabel="Płyta korpusu" allowEmpty={false} />);
    fireEvent.click(screen.getByLabelText('Płyta korpusu'));
    expect(screen.queryByRole('option', { name: '— nie wybrano —' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(items.length);
  });

  it('the 📋 copy button copies the selected material name to the clipboard and briefly shows ✓', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<SearchableMaterialSelect items={items} value={101} onChange={() => {}} ariaLabel="Płyta korpusu" />);

    const copyButton = screen.getByRole('button', { name: 'Kopiuj nazwę materiału' });
    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith('PL W960 SM Biały');
    expect(await screen.findByRole('button', { name: 'Kopiuj nazwę materiału' })).toHaveTextContent('✓');
  });

  it('clicking the copy button does not open the popover (stopPropagation)', () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    render(<SearchableMaterialSelect items={items} value={101} onChange={() => {}} ariaLabel="Płyta korpusu" />);
    fireEvent.click(screen.getByRole('button', { name: 'Kopiuj nazwę materiału' }));
    expect(screen.queryByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…')).not.toBeInTheDocument();
  });

  it('no copy button is shown while nothing is selected', () => {
    render(<SearchableMaterialSelect items={items} value="" onChange={() => {}} ariaLabel="Płyta korpusu" />);
    expect(screen.queryByRole('button', { name: 'Kopiuj nazwę materiału' })).not.toBeInTheDocument();
  });

  it('a click that ends an active text selection (user highlighting the name to copy it) does not open the popover', () => {
    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'PL W960' });
    const onChange = vi.fn();
    render(<SearchableMaterialSelect items={items} value={101} onChange={onChange} ariaLabel="Płyta korpusu" />);

    fireEvent.click(screen.getByLabelText('Płyta korpusu'));

    expect(screen.queryByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…')).not.toBeInTheDocument();
    getSelectionSpy.mockRestore();
  });

  it('a normal click (no text selection) still opens the popover as usual', () => {
    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '' });
    render(<SearchableMaterialSelect items={items} value={101} onChange={() => {}} ariaLabel="Płyta korpusu" />);

    fireEvent.click(screen.getByLabelText('Płyta korpusu'));

    expect(screen.getByPlaceholderText('🔍 Szukaj po nazwie lub kodzie…')).toBeInTheDocument();
    getSelectionSpy.mockRestore();
  });
});
