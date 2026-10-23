import { useCallback, useEffect, useRef, useState } from 'react';

const useProjectSaveLifecycle = ({
  cashDirty,
  clientFieldsDirty,
  cashLedgerRef,
  onSave,
  finalizeClose,
  staysOpenOnSave,
  isMobileVariant,
  closeMobileRowEditor,
  flushAutosave,
}) => {
  const [saveStatus, setSaveStatus] = useState(null);
  const saveStatusTimerRef = useRef(null);

  useEffect(() => () => {
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
  }, []);

  const saveAllDirty = useCallback(async () => {
    const autosaveResult = await flushAutosave?.();
    if (autosaveResult?.error) {
      setSaveStatus('error');
      return { error: true };
    }
    if (cashDirty) {
      const cashResult = await cashLedgerRef.current?.saveActiveDraft();
      if (cashResult?.error) {
        setSaveStatus('error');
        return { error: true };
      }
    }

    if (clientFieldsDirty) {
      const result = await onSave();
      if (result?.error) {
        setSaveStatus('error');
        return { error: true };
      }
    }

    return { error: null };
  }, [cashDirty, cashLedgerRef, clientFieldsDirty, flushAutosave, onSave]);

  const handleSaveClick = useCallback(async () => {
    const autosaveResult = await flushAutosave?.();
    if (autosaveResult?.error) {
      setSaveStatus('error');
      return;
    }
    if (!staysOpenOnSave) {
      const result = await onSave();
      if (result?.error) {
        setSaveStatus('error');
        return;
      }
      finalizeClose();
      return;
    }

    if (cashLedgerRef.current?.hasActiveDraft()) {
      const cashResult = await cashLedgerRef.current.saveActiveDraft();
      if (cashResult?.error) {
        setSaveStatus('error');
        return;
      }
    }

    const result = await onSave();
    if (result?.error) {
      setSaveStatus('error');
      return;
    }

    if (isMobileVariant) closeMobileRowEditor();
    setSaveStatus('saved');

    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus(null), 2500);
  }, [
    cashLedgerRef,
    closeMobileRowEditor,
    finalizeClose,
    isMobileVariant,
    onSave,
    staysOpenOnSave,
    flushAutosave,
  ]);

  return {
    saveStatus,
    saveAllDirty,
    handleSaveClick,
  };
};

export default useProjectSaveLifecycle;