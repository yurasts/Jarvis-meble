import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useProjectFiles from './useProjectFiles';

vi.mock('../data/projectFilesRepository', () => ({ default: {} }));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createRepository = (overrides = {}) => ({
  list: vi.fn(async () => []),
  upload: vi.fn(),
  replaceSto: vi.fn(),
  remove: vi.fn(),
  updateComment: vi.fn(),
  updateCover: vi.fn(),
  download: vi.fn(),
  ...overrides,
});

const setup = (repository, overrides = {}) => {
  const props = {
    clientId: 'client-1',
    currentProfile: { id: 'user-1', color: '#123456' },
    coverUrl: null,
    onCoverChange: vi.fn(),
    repository,
    ...overrides,
  };
  return {
    ...renderHook(currentProps => useProjectFiles(currentProps), { initialProps: props }),
    props,
  };
};

describe('useProjectFiles', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not expose files from a stale project request', async () => {
    const first = deferred();
    const second = deferred();
    const repository = createRepository({
      list: vi.fn(clientId => clientId === 'client-1' ? first.promise : second.promise),
    });
    const hook = setup(repository);

    hook.rerender({ ...hook.props, clientId: 'client-2' });
    await act(async () => first.resolve([{ id: 'old-file' }]));

    expect(hook.result.current.loading).toBe(true);
    expect(hook.result.current.files).toEqual([]);

    await act(async () => second.resolve([{ id: 'new-file' }]));
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.files).toEqual([{ id: 'new-file' }]);
  });

  it('uploads into the selected category and prepends the saved row', async () => {
    const existing = { id: 'existing' };
    const uploaded = { id: 'uploaded', category: 'montaz' };
    const repository = createRepository({
      list: vi.fn(async () => [existing]),
      upload: vi.fn(async () => uploaded),
    });
    const hook = setup(repository);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    const file = { name: 'photo.jpg', type: 'image/jpeg' };

    await act(async () => {
      await hook.result.current.uploadFiles([file], 'montaz');
    });

    expect(repository.upload).toHaveBeenCalledWith({
      clientId: 'client-1',
      category: 'montaz',
      file,
      profile: hook.props.currentProfile,
    });
    expect(hook.result.current.files).toEqual([uploaded, existing]);
    expect(hook.result.current.uploading).toBe(false);
  });

  it('does not leak an in-flight upload state into another project', async () => {
    const upload = deferred();
    const repository = createRepository({
      list: vi.fn(async () => []),
      upload: vi.fn(() => upload.promise),
    });
    const hook = setup(repository);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    let uploadPromise;
    act(() => {
      uploadPromise = hook.result.current.uploadFiles([{ name: 'photo.jpg' }], 'inne');
    });
    expect(hook.result.current.uploading).toBe(true);

    hook.rerender({ ...hook.props, clientId: 'client-2' });
    expect(hook.result.current.uploading).toBe(false);

    await act(async () => {
      upload.resolve({ id: 'old-project-file' });
      await uploadPromise;
    });
    expect(hook.result.current.files).toEqual([]);
  });

  it('does not let an older list response overwrite a completed upload', async () => {
    const list = deferred();
    const uploaded = { id: 'uploaded' };
    const repository = createRepository({
      list: vi.fn(() => list.promise),
      upload: vi.fn(async () => uploaded),
    });
    const hook = setup(repository);

    await act(async () => {
      await hook.result.current.uploadFiles([{ name: 'photo.jpg' }], 'inne');
    });
    expect(hook.result.current.files).toEqual([uploaded]);

    await act(async () => list.resolve([]));
    expect(hook.result.current.files).toEqual([uploaded]);
  });

  it('keeps a file in state when deletion is rejected', async () => {
    const file = { id: 'file-1', file_path: 'client/file.jpg', file_url: 'cover-url' };
    const repository = createRepository({
      list: vi.fn(async () => [file]),
      remove: vi.fn(async () => { throw new Error('denied'); }),
    });
    const hook = setup(repository, { coverUrl: 'cover-url' });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    let removed;
    await act(async () => {
      removed = await hook.result.current.removeFile(file);
    });

    expect(removed).toBe(false);
    expect(hook.result.current.files).toEqual([file]);
    expect(hook.result.current.fileActionError).toContain('usunąć pliku');
    expect(hook.props.onCoverChange).not.toHaveBeenCalled();
  });

  it('updates the cover only after persistence succeeds', async () => {
    const file = { id: 'file-1', file_url: 'new-cover' };
    const repository = createRepository({
      list: vi.fn(async () => [file]),
      updateCover: vi.fn(async () => {}),
    });
    const hook = setup(repository);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    await act(async () => {
      await hook.result.current.toggleCover(file);
    });

    expect(repository.updateCover).toHaveBeenCalledWith('client-1', 'new-cover');
    expect(hook.props.onCoverChange).toHaveBeenCalledWith('new-cover');
    expect(hook.result.current.settingCover).toBe(false);
  });

  it('rejects a non-STO replacement before touching the repository', async () => {
    const repository = createRepository();
    const hook = setup(repository);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    let replaced;
    await act(async () => {
      replaced = await hook.result.current.replaceSto({ name: 'project.pdf' }, null);
    });

    expect(replaced).toBe(false);
    expect(repository.replaceSto).not.toHaveBeenCalled();
    expect(hook.result.current.stoError).toContain('.sto');
  });
});
