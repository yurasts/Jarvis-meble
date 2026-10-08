import { useCallback, useState } from 'react';

export const evaluateQuantityExpression = (expression) => {
  if (expression === '' || expression === null || expression === undefined) return null;

  const sanitized = String(expression)
    .replace(',', '.')
    .replace(/[^0-9+\-*/.()\s]/g, '');

  try {
    const result = Function(`"use strict"; return (${sanitized})`)();
    if (typeof result === 'number' && Number.isFinite(result) && result > 0) {
      return Number.parseFloat(result.toFixed(4));
    }
  } catch {
    return null;
  }

  return null;
};

const useProjectItemEditor = ({ updateItems }) => {
  const [expandedItemKey, setExpandedItemKey] = useState(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [editingPrice, setEditingPrice] = useState(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [quantityDrafts, setQuantityDrafts] = useState({});

  const toggleExpandedItem = useCallback((key) => {
    setExpandedItemKey(current => (current === key ? null : key));
  }, []);

  const closeEditor = useCallback(() => {
    setExpandedItemKey(null);
    setEditingPrice(null);
    setPriceDraft('');
    setQuantityDrafts({});
    setConfirmDeleteKey(null);
  }, []);

  const finishEditing = useCallback(() => {
    if (document.activeElement?.tagName === 'INPUT') {
      document.activeElement.blur();
    }
    closeEditor();
  }, [closeEditor]);

  const handleQuantityFocus = useCallback((key, currentValue) => {
    setQuantityDrafts(current => ({ ...current, [key]: String(currentValue ?? '') }));
  }, []);

  const handleQuantityChange = useCallback((key, value) => {
    setQuantityDrafts(current => ({ ...current, [key]: value }));
  }, []);

  const updateQuantity = useCallback((field, currentItems, index, quantity) => {
    const nextItems = currentItems.map((item, itemIndex) => (
      itemIndex === index ? { ...item, quantity } : item
    ));
    updateItems(field, nextItems);
  }, [updateItems]);

  const commitQuantity = useCallback((field, currentItems, index, key) => {
    const rawValue = quantityDrafts[key];
    if (rawValue === undefined) return;

    const quantity = evaluateQuantityExpression(rawValue);
    if (quantity !== null) {
      updateQuantity(field, currentItems, index, quantity);
      setQuantityDrafts(current => ({ ...current, [key]: String(quantity) }));
      return;
    }

    setQuantityDrafts(current => ({
      ...current,
      [key]: String(currentItems[index]?.quantity ?? 1),
    }));
  }, [quantityDrafts, updateQuantity]);

  const savePrice = useCallback((field, currentItems, index) => {
    const price = Number.parseFloat(priceDraft);
    if (Number.isFinite(price) && price >= 0) {
      const nextItems = currentItems.map((item, itemIndex) => (
        itemIndex === index ? { ...item, price } : item
      ));
      updateItems(field, nextItems);
    }
    setEditingPrice(null);
  }, [priceDraft, updateItems]);

  const removeItem = useCallback((field, currentItems, index) => {
    closeEditor();
    updateItems(field, currentItems.filter((_, itemIndex) => itemIndex !== index));
  }, [closeEditor, updateItems]);

  return {
    expandedItemKey,
    setExpandedItemKey,
    confirmDeleteKey,
    setConfirmDeleteKey,
    editingPrice,
    setEditingPrice,
    priceDraft,
    setPriceDraft,
    quantityDrafts,
    toggleExpandedItem,
    closeEditor,
    finishEditing,
    handleQuantityFocus,
    handleQuantityChange,
    commitQuantity,
    savePrice,
    removeItem,
  };
};

export default useProjectItemEditor;