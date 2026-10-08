import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useProjectCloseLifecycle from './useProjectCloseLifecycle';

const renderCloseLifecycle = (overrides = {}) => {
  const props = {
    isDirty: false,
    isMobileVariant: false,
    isEmbedded: false,
    onClose: vi.fn(),
    onDirtyChange: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...renderHook(
      ({ values }) => useProjectCloseLifecycle(values),
      { initialProps: { values: props } },
    ),
  };
};

describe('useProjectCloseLifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes immediately when there are no unsaved changes', () => {
    const hook = renderCloseLifecycle();

    act(() => {
      hook.result.current.handleClose();
    });

    expect(hook.props.onClose).toHaveBeenCalledOnce();
    expect(hook.result.current.confirmClose).toBe(false);
  });

  it('opens confirmation instead of closing when dirty', () => {
    const hook = renderCloseLifecycle({ isDirty: true });

    act(() => {
      hook.result.current.handleClose();
    });

    expect(hook.props.onClose).not.toHaveBeenCalled();
    expect(hook.result.current.confirmClose).toBe(true);
  });

  it('reports dirty-state changes to the parent', () => {
    const hook = renderCloseLifecycle();

    expect(hook.props.onDirtyChange).toHaveBeenLastCalledWith(false);

    act(() => {
      hook.rerender({ values: { ...hook.props, isDirty: true } });
    });

    expect(hook.props.onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('guards browser back navigation on a dirty mobile screen', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const hook = renderCloseLifecycle({ isDirty: true, isMobileVariant: true });

    expect(pushState).toHaveBeenCalledWith({ jarvisMobileProject: true }, '');

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(pushState).toHaveBeenCalledTimes(2);
    expect(hook.props.onClose).not.toHaveBeenCalled();
    expect(hook.result.current.confirmClose).toBe(true);
  });

  it('closes on browser back when the mobile screen is clean', () => {
    const hook = renderCloseLifecycle({ isMobileVariant: true });

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(hook.props.onClose).toHaveBeenCalledOnce();
  });

  it('removes the mobile history entry on an explicit close', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const hook = renderCloseLifecycle({ isMobileVariant: true });

    act(() => {
      hook.result.current.finalizeClose();
    });

    expect(back).toHaveBeenCalledOnce();
    expect(hook.props.onClose).toHaveBeenCalledOnce();
  });

  it('routes Escape through the same dirty confirmation', () => {
    const hook = renderCloseLifecycle({ isDirty: true, isEmbedded: true });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(hook.props.onClose).not.toHaveBeenCalled();
    expect(hook.result.current.confirmClose).toBe(true);
  });
});