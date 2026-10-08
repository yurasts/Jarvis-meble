import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useProjectItemEditor, { evaluateQuantityExpression } from './useProjectItemEditor';

describe('evaluateQuantityExpression', () => {
  it.each([
    ['2 + 3', 5],
    ['2,5 * 2', 5],
    ['(12 / 3) + 0.25', 4.25],
  ])('evaluates %s', (expression, expected) => {
    expect(evaluateQuantityExpression(expression)).toBe(expected);
  });

  it.each(['', 'abc', '2 - 2', '-4', '2 / 0'])('rejects %s', (expression) => {
    expect(evaluateQuantityExpression(expression)).toBeNull();
  });
});

describe('useProjectItemEditor', () => {
  it('commits a quantity expression without mutating the original items', () => {
    const updateItems = vi.fn();
    const items = [{ id: 1, quantity: 2 }, { id: 2, quantity: 4 }];
    const { result } = renderHook(() => useProjectItemEditor({ updateItems }));

    act(() => result.current.handleQuantityFocus('mat-0', items[0].quantity));
    act(() => result.current.handleQuantityChange('mat-0', '2 + 3'));
    act(() => result.current.commitQuantity('calc_materials', items, 0, 'mat-0'));

    expect(updateItems).toHaveBeenCalledWith('calc_materials', [
      { id: 1, quantity: 5 },
      { id: 2, quantity: 4 },
    ]);
    expect(items[0].quantity).toBe(2);
    expect(result.current.quantityDrafts['mat-0']).toBe('5');
  });

  it('restores the current quantity when the expression is invalid', () => {
    const updateItems = vi.fn();
    const items = [{ id: 1, quantity: 7 }];
    const { result } = renderHook(() => useProjectItemEditor({ updateItems }));

    act(() => result.current.handleQuantityFocus('mat-0', 7));
    act(() => result.current.handleQuantityChange('mat-0', 'invalid'));
    act(() => result.current.commitQuantity('calc_materials', items, 0, 'mat-0'));

    expect(updateItems).not.toHaveBeenCalled();
    expect(result.current.quantityDrafts['mat-0']).toBe('7');
  });

  it('saves a price immutably and exits price editing', () => {
    const updateItems = vi.fn();
    const items = [{ id: 1, price: 12 }, { id: 2, price: 20 }];
    const { result } = renderHook(() => useProjectItemEditor({ updateItems }));

    act(() => {
      result.current.setEditingPrice('mat-0');
      result.current.setPriceDraft('15.75');
    });
    act(() => result.current.savePrice('calc_materials', items, 0));

    expect(updateItems).toHaveBeenCalledWith('calc_materials', [
      { id: 1, price: 15.75 },
      { id: 2, price: 20 },
    ]);
    expect(items[0].price).toBe(12);
    expect(result.current.editingPrice).toBeNull();
  });

  it('removes the selected item and clears all editor state', () => {
    const updateItems = vi.fn();
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const { result } = renderHook(() => useProjectItemEditor({ updateItems }));

    act(() => {
      result.current.setExpandedItemKey('mat-1');
      result.current.setConfirmDeleteKey('calc_materials-1');
      result.current.setEditingPrice('mat-1');
      result.current.setPriceDraft('99');
      result.current.handleQuantityFocus('mat-1', 2);
    });
    act(() => result.current.removeItem('calc_materials', items, 1));

    expect(updateItems).toHaveBeenCalledWith('calc_materials', [{ id: 1 }, { id: 3 }]);
    expect(result.current.expandedItemKey).toBeNull();
    expect(result.current.confirmDeleteKey).toBeNull();
    expect(result.current.editingPrice).toBeNull();
    expect(result.current.priceDraft).toBe('');
    expect(result.current.quantityDrafts).toEqual({});
  });
});