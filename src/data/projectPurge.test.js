import { describe, expect, it, vi } from 'vitest';
import { createProjectPurge } from './projectPurge';

vi.mock('./clientsRepository', () => ({ default: {} }));
vi.mock('./projectFilesRepository', () => ({ default: {} }));

const setup = ({ paths = ['7/a.jpg', '7/sto/b.sto'], deleteError = null, storageError = null } = {}) => {
  const calls = [];
  const files = {
    listStoragePaths: vi.fn(async (id) => { calls.push(['list', id]); return paths; }),
    removeStoragePaths: vi.fn(async (list) => { calls.push(['remove', list]); return storageError; }),
  };
  const clients = {
    permanentlyDelete: vi.fn(async (id) => {
      calls.push(['delete', id]);
      if (deleteError) throw deleteError;
    }),
  };
  return { calls, purge: createProjectPurge({ clients, files }), files };
};

describe('projectPurge', () => {
  it('collects file paths, deletes the row, then removes storage objects', async () => {
    const { calls, purge } = setup();

    await expect(purge(7)).resolves.toEqual({ removedFiles: 2, storageError: null });
    expect(calls).toEqual([
      ['list', 7],
      ['delete', 7],
      ['remove', ['7/a.jpg', '7/sto/b.sto']],
    ]);
  });

  it('keeps the files when the database refuses the deletion', async () => {
    const refused = Object.assign(new Error('denied'), { code: 'PURGE_NOT_ALLOWED' });
    const { purge, files } = setup({ deleteError: refused });

    await expect(purge(7)).rejects.toBe(refused);
    expect(files.removeStoragePaths).not.toHaveBeenCalled();
  });

  it('reports a storage clean-up failure without undoing the deletion', async () => {
    const storageError = new Error('storage down');
    const { purge } = setup({ storageError });

    await expect(purge(7)).resolves.toEqual({ removedFiles: 2, storageError });
  });

  it('skips the storage call for a project without files', async () => {
    const { purge, files } = setup({ paths: [] });

    await expect(purge(7)).resolves.toEqual({ removedFiles: 0, storageError: null });
    expect(files.removeStoragePaths).not.toHaveBeenCalled();
  });
});
