import { useCallback, useEffect, useRef, useState } from 'react';

const useProjectCloseLifecycle = ({
  isDirty,
  isMobileVariant,
  isEmbedded,
  onClose,
  onDirtyChange,
  beforeClose,
}) => {
  const [confirmClose, setConfirmClose] = useState(false);
  const isDirtyRef = useRef(isDirty);
  const onCloseRef = useRef(onClose);
  const beforeCloseRef = useRef(beforeClose);
  const hasPushedHistoryRef = useRef(false);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    beforeCloseRef.current = beforeClose;
  }, [beforeClose]);

  useEffect(() => {
    if (!isMobileVariant) return;

    window.history.pushState({ jarvisMobileProject: true }, '');
    hasPushedHistoryRef.current = true;

    const onPopState = async () => {
      if (beforeCloseRef.current) {
        const result = await beforeCloseRef.current();
        if (result?.error) {
          window.history.pushState({ jarvisMobileProject: true }, '');
          return;
        }
      }
      if (isDirtyRef.current) {
        window.history.pushState({ jarvisMobileProject: true }, '');
        setConfirmClose(true);
        return;
      }

      hasPushedHistoryRef.current = false;
      onCloseRef.current();
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [isMobileVariant]);

  const finalizeClose = useCallback(() => {
    if (isMobileVariant && hasPushedHistoryRef.current) {
      hasPushedHistoryRef.current = false;
      window.history.back();
    }
    onClose();
  }, [isMobileVariant, onClose]);

  const handleClose = useCallback(() => {
    const finish = async () => {
      const result = await beforeClose?.();
      if (result?.error) return;
      if (isDirty) {
        setConfirmClose(true);
        return;
      }
      finalizeClose();
    };
    if (beforeClose) void finish();
    else if (isDirty) setConfirmClose(true);
    else finalizeClose();
  }, [beforeClose, finalizeClose, isDirty]);

  useEffect(() => {
    if (!isEmbedded && !isMobileVariant) return;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') handleClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose, isEmbedded, isMobileVariant]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  return {
    confirmClose,
    setConfirmClose,
    finalizeClose,
    handleClose,
  };
};

export default useProjectCloseLifecycle;