import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useActivityTracker, { ACTIVITY_HEARTBEAT_MS } from './useActivityTracker';

vi.mock('../supabase', () => ({ supabase: {} }));

function TrackerHarness({ session, client, repository }) {
  useActivityTracker({ session, client, repository });
  return null;
}

describe('useActivityTracker', () => {
  let visibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records session start, sign-in and visible heartbeats without surfacing failures', async () => {
    let authHandler;
    const unsubscribe = vi.fn();
    const client = {
      auth: {
        onAuthStateChange: vi.fn(handler => {
          authHandler = handler;
          return { data: { subscription: { unsubscribe } } };
        }),
      },
    };
    const repository = { record: vi.fn().mockResolvedValue(null) };
    const session = { user: { id: 'user-1' } };
    const { unmount } = render(
      <TrackerHarness session={session} client={client} repository={repository} />,
    );

    await act(async () => {});
    expect(repository.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'session_start' }));

    await act(async () => {
      authHandler('SIGNED_IN', session);
    });
    expect(repository.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'sign_in' }));

    visibilityState = 'hidden';
    await act(async () => { vi.advanceTimersByTime(ACTIVITY_HEARTBEAT_MS); });
    expect(repository.record).toHaveBeenCalledTimes(2);

    visibilityState = 'visible';
    await act(async () => { vi.advanceTimersByTime(ACTIVITY_HEARTBEAT_MS); });
    expect(repository.record).toHaveBeenCalledTimes(3);
    expect(repository.record).toHaveBeenLastCalledWith(expect.objectContaining({ eventType: 'session_start' }));

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('swallows telemetry errors so the application remains usable', async () => {
    const client = {
      auth: {
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
    };
    const repository = { record: vi.fn().mockRejectedValue(new Error('offline')) };

    expect(() => render(
      <TrackerHarness session={{ user: { id: 'user-1' } }} client={client} repository={repository} />,
    )).not.toThrow();
    await act(async () => {});
  });

  it('does not duplicate a fresh sign-in with an immediate session-start event', async () => {
    let authHandler;
    const client = {
      auth: {
        onAuthStateChange: vi.fn(handler => {
          authHandler = handler;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
    };
    const repository = { record: vi.fn().mockResolvedValue(null) };
    const session = { user: { id: 'user-1' } };
    const { rerender } = render(
      <TrackerHarness session={null} client={client} repository={repository} />,
    );

    await act(async () => {
      authHandler('SIGNED_IN', session);
    });
    rerender(<TrackerHarness session={session} client={client} repository={repository} />);
    await act(async () => {});

    expect(repository.record).toHaveBeenCalledTimes(1);
    expect(repository.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'sign_in' }));
  });
});
