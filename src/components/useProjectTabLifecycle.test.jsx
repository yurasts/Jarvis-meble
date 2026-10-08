import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useProjectTabLifecycle from './useProjectTabLifecycle';

const setup = (overrides = {}) => {
  const cashLedgerRef = {
    current: {
      saveActiveDraft: vi.fn(async () => ({ error: null })),
    },
  };
  const props = {
    activeTab: 'materials',
    setActiveTab: vi.fn(),
    isMobileVariant: true,
    isEmbedded: false,
    cashDirty: false,
    setCashDirty: vi.fn(),
    cashLedgerRef,
    finishEditing: vi.fn(),
    resetPickers: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...renderHook(() => useProjectTabLifecycle(props)),
  };
};

describe('useProjectTabLifecycle', () => {
  it('finishes editing, resets pickers, and changes a mobile tab', () => {
    const hook = setup();

    act(() => {
      hook.result.current.handleTabChange('services');
    });

    expect(hook.props.finishEditing).toHaveBeenCalledOnce();
    expect(hook.props.resetPickers).toHaveBeenCalledOnce();
    expect(hook.props.setActiveTab).toHaveBeenCalledWith('services');
  });

  it('does not finish editing in the plain modal variant', () => {
    const hook = setup({ isMobileVariant: false, isEmbedded: false });

    act(() => {
      hook.result.current.handleTabChange('services');
    });

    expect(hook.props.finishEditing).not.toHaveBeenCalled();
    expect(hook.props.resetPickers).toHaveBeenCalledOnce();
    expect(hook.props.setActiveTab).toHaveBeenCalledWith('services');
  });

  it('defers leaving cash tab when its draft is dirty', () => {
    const hook = setup({ activeTab: 'expenses', cashDirty: true });

    act(() => {
      hook.result.current.handleTabChange('materials');
    });

    expect(hook.result.current.pendingTabChange).toBe('materials');
    expect(hook.props.finishEditing).not.toHaveBeenCalled();
    expect(hook.props.setActiveTab).not.toHaveBeenCalled();
  });

  it('cancels a deferred tab change without touching the draft', () => {
    const hook = setup({ activeTab: 'expenses', cashDirty: true });

    act(() => {
      hook.result.current.handleTabChange('services');
      hook.result.current.cancelTabChange();
    });

    expect(hook.result.current.pendingTabChange).toBeNull();
    expect(hook.props.setCashDirty).not.toHaveBeenCalled();
    expect(hook.props.setActiveTab).not.toHaveBeenCalled();
  });

  it('discards the cash draft and completes the deferred change', () => {
    const hook = setup({ activeTab: 'expenses', cashDirty: true });

    act(() => {
      hook.result.current.handleTabChange('materials');
    });
    act(() => {
      hook.result.current.discardTabChange();
    });

    expect(hook.props.setCashDirty).toHaveBeenCalledWith(false);
    expect(hook.props.finishEditing).toHaveBeenCalledOnce();
    expect(hook.props.setActiveTab).toHaveBeenCalledWith('materials');
  });

  it('saves the cash draft before completing the deferred change', async () => {
    const hook = setup({ activeTab: 'expenses', cashDirty: true });

    act(() => {
      hook.result.current.handleTabChange('services');
    });
    await act(async () => {
      await hook.result.current.saveAndChangeTab();
    });

    expect(hook.props.cashLedgerRef.current.saveActiveDraft).toHaveBeenCalledOnce();
    expect(hook.props.setCashDirty).toHaveBeenCalledWith(false);
    expect(hook.props.setActiveTab).toHaveBeenCalledWith('services');
    expect(hook.result.current.pendingTabChange).toBeNull();
  });

  it('keeps the pending tab and reports an error when cash save fails', async () => {
    const cashLedgerRef = {
      current: {
        saveActiveDraft: vi.fn(async () => ({ error: new Error('failed') })),
      },
    };
    const hook = setup({
      activeTab: 'expenses',
      cashDirty: true,
      cashLedgerRef,
    });

    act(() => {
      hook.result.current.handleTabChange('materials');
    });
    await act(async () => {
      await hook.result.current.saveAndChangeTab();
    });

    expect(hook.result.current.pendingTabChange).toBe('materials');
    expect(hook.result.current.cashTabSaveError).toBe(true);
    expect(hook.props.setActiveTab).not.toHaveBeenCalled();
  });
});