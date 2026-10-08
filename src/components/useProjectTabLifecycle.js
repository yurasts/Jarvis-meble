import { useCallback, useState } from 'react';

const useProjectTabLifecycle = ({
  activeTab,
  setActiveTab,
  isMobileVariant,
  isEmbedded,
  cashDirty,
  setCashDirty,
  cashLedgerRef,
  finishEditing,
  resetPickers,
}) => {
  const [pendingTabChange, setPendingTabChange] = useState(null);
  const [cashTabSaveError, setCashTabSaveError] = useState(false);

  const handleTabChange = useCallback((tab) => {
    if ((isMobileVariant || isEmbedded) && tab !== activeTab) {
      if (activeTab === 'expenses' && cashDirty) {
        setPendingTabChange(tab);
        return;
      }
      finishEditing();
    }

    if (tab !== activeTab) resetPickers();
    setActiveTab(tab);
  }, [
    activeTab,
    cashDirty,
    finishEditing,
    isEmbedded,
    isMobileVariant,
    resetPickers,
    setActiveTab,
  ]);

  const cancelTabChange = useCallback(() => {
    setPendingTabChange(null);
    setCashTabSaveError(false);
  }, []);

  const discardTabChange = useCallback(() => {
    const tab = pendingTabChange;
    setPendingTabChange(null);
    setCashDirty(false);
    finishEditing();
    setActiveTab(tab);
  }, [finishEditing, pendingTabChange, setActiveTab, setCashDirty]);

  const saveAndChangeTab = useCallback(async () => {
    setCashTabSaveError(false);
    const result = await cashLedgerRef.current?.saveActiveDraft();

    if (result?.error) {
      setCashTabSaveError(true);
      return;
    }

    const tab = pendingTabChange;
    setPendingTabChange(null);
    setCashDirty(false);
    finishEditing();
    setActiveTab(tab);
  }, [
    cashLedgerRef,
    finishEditing,
    pendingTabChange,
    setActiveTab,
    setCashDirty,
  ]);

  return {
    pendingTabChange,
    cashTabSaveError,
    handleTabChange,
    cancelTabChange,
    discardTabChange,
    saveAndChangeTab,
  };
};

export default useProjectTabLifecycle;