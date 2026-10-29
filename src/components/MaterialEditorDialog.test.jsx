import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MaterialEditorDialog from './MaterialEditorDialog';

const suppliers = [
  { id: 's1', name: 'Alfa', is_archived: false },
  { id: 's2', name: 'Beta', is_archived: false },
];

describe('MaterialEditorDialog', () => {
  it('saves several suppliers with exactly one preferred link', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => ({}));
    render(<MaterialEditorDialog
      suppliers={suppliers}
      onCreateSupplier={vi.fn()}
      onSave={onSave}
      onClose={vi.fn()}
    />);

    await user.type(screen.getByLabelText('Pełna nazwa'), 'Płyta testowa');
    await user.type(screen.getByLabelText('Cena brutto (PLN)'), '120');
    // Wybór w <select> dodaje dostawcę od razu — nie ma już osobnego przycisku „Dodaj”.
    await user.selectOptions(screen.getByLabelText('Dodaj dostawcę'), 's1');
    await user.selectOptions(screen.getByLabelText('Dodaj dostawcę'), 's2');
    await user.click(screen.getAllByRole('radio')[1]);
    await user.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      links: [
        expect.objectContaining({ supplier_id: 's1', is_preferred: false }),
        expect.objectContaining({ supplier_id: 's2', is_preferred: true }),
      ],
    }));
  });

  it('saves the selected supplier when Zapisz is clicked right after selecting it, with no intermediate click', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => ({}));
    render(<MaterialEditorDialog
      suppliers={suppliers}
      onCreateSupplier={vi.fn()}
      onSave={onSave}
      onClose={vi.fn()}
    />);

    await user.type(screen.getByLabelText('Pełna nazwa'), 'Płyta testowa');
    await user.type(screen.getByLabelText('Cena brutto (PLN)'), '120');
    await user.selectOptions(screen.getByLabelText('Dodaj dostawcę'), 's1');
    expect(screen.getByText('Alfa')).toBeInTheDocument();
    expect(screen.queryByText('Brak przypisanych dostawców.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      links: [expect.objectContaining({ supplier_id: 's1', is_preferred: true })],
    }));
  });

  it('creates a supplier on the fly and attaches it', async () => {
    const user = userEvent.setup();
    const onCreateSupplier = vi.fn(async fields => ({ id: 's3', ...fields }));
    const onSave = vi.fn(async () => ({}));
    render(<MaterialEditorDialog suppliers={suppliers} onCreateSupplier={onCreateSupplier} onSave={onSave} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Pełna nazwa'), 'Blat');
    await user.type(screen.getByLabelText('Cena brutto (PLN)'), '50');
    await user.click(screen.getByRole('button', { name: '+ Utwórz nowego' }));
    await user.type(screen.getByLabelText('Nazwa nowego dostawcy'), 'Gamma');
    await user.click(screen.getByRole('button', { name: 'Utwórz' }));
    expect(onCreateSupplier).toHaveBeenCalledWith(expect.objectContaining({ name: 'Gamma' }));
    expect(await screen.findByText('Gamma')).toBeInTheDocument();
  });

  it('creates and attaches the supplier from an unconfirmed "+ Utwórz nowego" draft on Zapisz', async () => {
    const user = userEvent.setup();
    const onCreateSupplier = vi.fn(async fields => ({ id: 's3', ...fields }));
    const onSave = vi.fn(async () => ({}));
    render(<MaterialEditorDialog suppliers={suppliers} onCreateSupplier={onCreateSupplier} onSave={onSave} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Pełna nazwa'), 'Blat');
    await user.type(screen.getByLabelText('Cena brutto (PLN)'), '50');
    await user.click(screen.getByRole('button', { name: '+ Utwórz nowego' }));
    await user.type(screen.getByLabelText('Nazwa nowego dostawcy'), 'Gamma');
    // Bez klikania „Utwórz” — od razu Zapisz.
    await user.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(onCreateSupplier).toHaveBeenCalledWith(expect.objectContaining({ name: 'Gamma' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      links: [expect.objectContaining({ supplier_id: 's3', is_preferred: true })],
    }));
  });
});
