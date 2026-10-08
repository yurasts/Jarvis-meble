import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useProjectSaveLifecycle from './useProjectSaveLifecycle';

const setup = (overrides = {}) => {
  const calls = [];
  const cashLedgerRef = {
    current: {
      hasActiveDraft: () => false,
      saveActiveDraft: vi.fn(async () => {
        calls.push('cash');
        return { error: null };
      }),
    },
  };
  const onSave = vi.fn(async () => {
    calls.push('project');
    return { error: null };
  });
  const finalizeClose = vi.fn();
  const closeMobileRowEditor = vi.fn();

  const props = {
    cashDirty: false,
    clientFieldsDirty: false,
    cashLedgerRef,
    onSave,
    finalizeClose,
    staysOpenOnSave: true,
    isMobileVariant: false,
    closeMobileRowEditor,
    ...overrides,
  };

  return {
    ...renderHook(() => useProjectSaveLifecycle(props)),
    calls,
    cashLedgerRef,
    onSave,
    finalizeClose,
    closeMobileRowEditor,
  };
};

describe('useProjectSaveLifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves cash before project fields when both are dirty', async () => {
    const hook = setup({ cashDirty: true, clientFieldsDirty: true });

    let result;
    await act(async () => {
      result = await hook.result.current.saveAllDirty();
    });

    expect(result).toEqual({ error: null });
    expect(hook.calls).toEqual(['cash', 'project']);
  });

  it('stops after a cash error and preserves the project save', async () => {
    const cashLedgerRef = {
      current: {
        saveActiveDraft: vi.fn(async () => ({ error: new Error('cash failed') })),
      },
    };
    const onSave = vi.fn();
    const hook = setup({
      cashDirty: true,
      clientFieldsDirty: true,
      cashLedgerRef,
      onSave,
    });

    let result;
    await act(async () => {
      result = await hook.result.current.saveAllDirty();
    });

    expect(result).toEqual({ error: true });
    expect(onSave).not.toHaveBeenCalled();
    expect(hook.result.current.saveStatus).toBe('error');
  });

  it('closes only after a successful non-sticky save', async () => {
    const hook = setup({ staysOpenOnSave: false });

    await act(async () => {
      await hook.result.current.handleSaveClick();
    });

    expect(hook.onSave).toHaveBeenCalledOnce();
    expect(hook.finalizeClose).toHaveBeenCalledOnce();
  });

  it('keeps the screen open when a non-sticky save fails', async () => {
    const onSave = vi.fn(async () => ({ error: new Error('save failed') }));
    const hook = setup({ staysOpenOnSave: false, onSave });

    await act(async () => {
      await hook.result.current.handleSaveClick();
    });

    expect(hook.finalizeClose).not.toHaveBeenCalled();
    expect(hook.result.current.saveStatus).toBe('error');
  });

  it('saves an active cash draft before the project and clears saved status', async () => {
    vi.useFakeTimers();
    const hook = setup({ isMobileVariant: true });
    hook.cashLedgerRef.current.hasActiveDraft = () => true;

    await act(async () => {
      await hook.result.current.handleSaveClick();
    });

    expect(hook.calls).toEqual(['cash', 'project']);
    expect(hook.closeMobileRowEditor).toHaveBeenCalledOnce();
    expect(hook.result.current.saveStatus).toBe('saved');

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(hook.result.current.saveStatus).toBeNull();
  });
});