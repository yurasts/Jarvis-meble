import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import usePro100Library from './usePro100Library';

vi.mock('../data/pro100LibraryRepository', () => ({ default: {} }));

const createRepository = (overrides = {}) => ({
  load: vi.fn(async () => ({ categories: [], files: [] })),
  create: vi.fn(),
  updateMetadata: vi.fn(),
  replace: vi.fn(),
  remove: vi.fn(),
  download: vi.fn(),
  ...overrides,
});

const setup = (repository) => renderHook(() => usePro100Library({ repository }));

describe('usePro100Library', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('loads categories and files through the repository', async () => {
    const categories = [{ id: 'cat-1', name: 'Kuchnie' }];
    const files = [{ id: 'file-1', title: 'Projekt' }];
    const repository = createRepository({
      load: vi.fn(async () => ({ categories, files })),
    });
    const hook = setup(repository);

    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.categories).toEqual(categories);
    expect(hook.result.current.files).toEqual(files);
  });

  it('validates create input before calling the repository', async () => {
    const repository = createRepository();
    const hook = setup(repository);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    let saved;
    await act(async () => {
      saved = await hook.result.current.saveFile({
        mode: 'create',
        form: { title: '', categoryId: '', clientName: '', description: '', tags: '' },
        selectedFile: null,
        editingFile: null,
      });
    });

    expect(saved).toBe(false);
    expect(repository.create).not.toHaveBeenCalled();
    expect(hook.result.current.actionError).toContain('nazwę projektu');
  });

  it('creates a file with normalized metadata and prepends it', async () => {
    const existing = { id: 'old', title: 'Old' };
    const savedFile = { id: 'new', title: 'Kitchen' };
    const repository = createRepository({
      load: vi.fn(async () => ({ categories: [], files: [existing] })),
      create: vi.fn(async () => savedFile),
    });
    const hook = setup(repository);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    const file = new File(['sto'], 'kitchen.sto', { type: 'application/octet-stream' });

    await act(async () => {
      await hook.result.current.saveFile({
        mode: 'create',
        form: {
          title: '  Kitchen  ',
          categoryId: 'cat-1',
          clientName: ' Client ',
          description: '',
          tags: 'white, corner',
        },
        selectedFile: file,
        editingFile: null,
      });
    });

    expect(repository.create).toHaveBeenCalledWith({
      file,
      metadata: {
        category_id: 'cat-1',
        title: 'Kitchen',
        client_name: 'Client',
        description: null,
        tags: ['white', 'corner'],
      },
    });
    expect(hook.result.current.files).toEqual([savedFile, existing]);
    expect(hook.result.current.notice).toContain('dodany');
  });

  it('keeps the existing row and reports replacement errors', async () => {
    const existing = { id: 'file-1', title: 'Old' };
    const repository = createRepository({
      load: vi.fn(async () => ({ categories: [], files: [existing] })),
      replace: vi.fn(async () => { throw Object.assign(new Error('failed'), { stage: 'replace-save' }); }),
    });
    const hook = setup(repository);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    await act(async () => {
      await hook.result.current.replaceFile(
        existing,
        new File(['sto'], 'new.sto', { type: 'application/octet-stream' }),
      );
    });

    expect(hook.result.current.files).toEqual([existing]);
    expect(hook.result.current.actionError).toContain('nowej wersji');
    expect(hook.result.current.actionBusy).toBe(false);
  });

  it('removes a file from local state only after repository success', async () => {
    const file = { id: 'file-1', storage_path: 'file.sto' };
    const repository = createRepository({
      load: vi.fn(async () => ({ categories: [], files: [file] })),
      remove: vi.fn(async () => {}),
    });
    const hook = setup(repository);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    await act(async () => {
      await hook.result.current.deleteFile(file);
    });

    expect(hook.result.current.files).toEqual([]);
    expect(hook.result.current.notice).toContain('usunięty');
  });
});
