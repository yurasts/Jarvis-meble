import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Pro100Library from './Pro100Library';

const { mockUsePro100Library } = vi.hoisted(() => ({
  mockUsePro100Library: vi.fn(),
}));

vi.mock('./usePro100Library', () => ({ default: mockUsePro100Library }));

const categories = [
  { id: 'kitchen', name: 'Kuchnie' },
  { id: 'wardrobe', name: 'Szafy' },
];

const kitchenFile = {
  id: 'file-1',
  category_id: 'kitchen',
  title: 'Biała kuchnia',
  original_filename: 'kitchen.sto',
  storage_path: 'files/kitchen.sto',
  file_size: 2048,
  client_name: 'Anna',
  description: 'Projekt narożny',
  tags: ['biała'],
  updated_at: '2026-10-01T10:00:00Z',
};

const wardrobeFile = {
  id: 'file-2',
  category_id: 'wardrobe',
  title: 'Szafa dębowa',
  original_filename: 'wardrobe.sto',
  storage_path: 'files/wardrobe.sto',
  file_size: 4096,
  client_name: null,
  description: '',
  tags: [],
  updated_at: '2026-09-01T10:00:00Z',
};

const createHookResult = (overrides = {}) => ({
  categories,
  files: [kitchenFile, wardrobeFile],
  loading: false,
  loadError: '',
  actionBusy: false,
  actionError: '',
  notice: '',
  reload: vi.fn(),
  saveFile: vi.fn(async () => true),
  replaceFile: vi.fn(async () => true),
  deleteFile: vi.fn(async () => true),
  downloadFile: vi.fn(async () => true),
  clearActionError: vi.fn(),
  ...overrides,
});

const renderLibrary = (overrides = {}) => {
  const hookResult = createHookResult(overrides);
  mockUsePro100Library.mockReturnValue(hookResult);
  return { ...render(<Pro100Library />), hookResult };
};

describe('Pro100Library', () => {
  beforeEach(() => {
    mockUsePro100Library.mockReset();
  });

  it('filters by category and searches globally without Polish diacritics', async () => {
    const user = userEvent.setup();
    renderLibrary();

    await user.click(screen.getByRole('button', { name: /Szafy 1/ }));
    expect(screen.getByText('Szafa dębowa')).toBeInTheDocument();
    expect(screen.queryByText('Biała kuchnia')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Szukaj pliku lub opisu'), 'biala');
    expect(screen.getByText('Biała kuchnia')).toBeInTheDocument();
    expect(screen.queryByText('Szafa dębowa')).not.toBeInTheDocument();
  });

  it('submits create dialog data through the hook', async () => {
    const user = userEvent.setup();
    const { hookResult } = renderLibrary();
    await user.click(screen.getByRole('button', { name: /Dodaj plik/ }));

    const file = new File(['sto'], 'new-kitchen.sto', { type: 'application/octet-stream' });
    const picker = screen.getByText('Wybierz plik .sto').closest('label').querySelector('input[type="file"]');
    fireEvent.change(picker, { target: { files: [file] } });

    expect(screen.getByLabelText('Nazwa')).toHaveValue('new-kitchen');
    await user.type(screen.getByLabelText('Klient'), 'Jan');
    await user.click(screen.getByRole('button', { name: 'Dodaj do biblioteki' }));

    await waitFor(() => expect(hookResult.saveFile).toHaveBeenCalledWith({
      mode: 'create',
      form: {
        title: 'new-kitchen',
        clientName: 'Jan',
        categoryId: 'kitchen',
        description: '',
        tags: '',
      },
      selectedFile: file,
      editingFile: null,
    }));
  });

  it('confirms deletion before delegating it to the hook', async () => {
    const user = userEvent.setup();
    const { hookResult } = renderLibrary();

    await user.click(screen.getByRole('button', { name: /Biała kuchnia/ }));
    await user.click(screen.getByRole('button', { name: /Usuń/ }));
    expect(screen.getByText('Usunąć plik?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tak' }));

    await waitFor(() => expect(hookResult.deleteFile).toHaveBeenCalledWith(kitchenFile));
  });

  it('delegates downloads to the hook', async () => {
    const user = userEvent.setup();
    const { hookResult } = renderLibrary();

    await user.click(screen.getAllByRole('button', { name: /Pobierz/ })[0]);
    expect(hookResult.downloadFile).toHaveBeenCalledWith(kitchenFile);
  });

  it('retries a failed initial load through the hook', async () => {
    const { hookResult } = renderLibrary({
      files: [],
      categories: [],
      loadError: 'Nie udało się załadować biblioteki PRO100. Spróbuj ponownie.',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(hookResult.reload).toHaveBeenCalledOnce();
  });
});
