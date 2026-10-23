import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useProjectItemsAutosave from './useProjectItemsAutosave';

describe('useProjectItemsAutosave', () => {
  it('debounces edits and persists only the latest field value', async () => {
    vi.useFakeTimers();
    const onPersist = vi.fn(async () => undefined);
    const { result } = renderHook(() => useProjectItemsAutosave({ projectId: 9, onPersist }));

    act(() => {
      result.current.schedule('calc_materials', [{ id: 1, quantity: 1 }]);
      result.current.schedule('calc_materials', [{ id: 1, quantity: 2 }]);
    });
    expect(result.current.status).toBe('saving');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist).toHaveBeenCalledWith(9, {
      calc_materials: [{ id: 1, quantity: 2 }],
    });
    expect(result.current.status).toBe('saved');
    vi.useRealTimers();
  });

  it('flushes pending edits immediately and exposes failures', async () => {
    const error = new Error('offline');
    const onPersist = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useProjectItemsAutosave({ projectId: 4, onPersist }));
    act(() => { result.current.schedule('calc_services', [{ id: 2 }]); });

    let response;
    await act(async () => { response = await result.current.flush(); });
    expect(response.error).toBe(error);
    expect(result.current.status).toBe('error');

    await act(async () => { response = await result.current.flush(); });
    expect(response.error).toBeNull();
    expect(onPersist).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
  });

  it('serializes overlapping structural saves and keeps their order', async () => {
    let releaseFirst;
    const onPersist = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { releaseFirst = resolve; }))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useProjectItemsAutosave({ projectId: 5, onPersist }));

    let firstSave;
    let secondSave;
    await act(async () => {
      firstSave = result.current.schedule('calc_materials', [{ id: 1 }], { immediate: true });
      secondSave = result.current.schedule('calc_materials', [{ id: 1 }, { id: 2 }], { immediate: true });
      await Promise.resolve();
    });
    expect(onPersist).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseFirst();
      await Promise.all([firstSave, secondSave]);
    });

    expect(onPersist).toHaveBeenCalledTimes(2);
    expect(onPersist.mock.calls[1][1]).toEqual({ calc_materials: [{ id: 1 }, { id: 2 }] });
    expect(result.current.status).toBe('saved');
  });
});
