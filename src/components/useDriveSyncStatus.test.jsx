import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useDriveSyncStatus from './useDriveSyncStatus';

vi.mock('../data/driveSyncRepository', () => ({ default: {} }));

describe('useDriveSyncStatus', () => {
  afterEach(() => vi.useRealTimers());

  it('does not request owner-only state when disabled', async () => {
    vi.useFakeTimers();
    const repository = { getState: vi.fn() };
    const { result } = renderHook(() => useDriveSyncStatus({ enabled: false, repository }));

    await act(async () => vi.runOnlyPendingTimersAsync());
    expect(repository.getState).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('loads and refreshes the singleton state for an owner', async () => {
    vi.useFakeTimers();
    const repository = {
      getState: vi.fn()
        .mockResolvedValueOnce({ singleton_id: 1, locked_by_host: 'PC-A' })
        .mockResolvedValueOnce({ singleton_id: 1, locked_by_host: 'PC-B' }),
    };
    const { result } = renderHook(() => useDriveSyncStatus({
      enabled: true,
      repository,
      refreshMs: 1000,
    }));

    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(result.current.state.locked_by_host).toBe('PC-A');
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.state.locked_by_host).toBe('PC-B');
  });
});
