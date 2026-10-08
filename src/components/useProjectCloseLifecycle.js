import { useCallback, useEffect, useRef, useState } from 'react';

const useProjectCloseLifecycle = ({
  isDirty,
  isMobileVariant,
  isEmbedded,
  onClose,
  onDirtyChange,
}) => {
  const [confirmClose, setConfirmClose] = useState(false);
  const isDirtyRef = useRef(isDirty);
  const onCloseRef = useRef(onClose);
  const hasPushedHistoryRef = useRef(false);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isMobileVariant) return;

    window.history.pushState({ jarvisMobileProject: true }, '');
    hasPushedHistoryRef.current = true;

    const onPopState = () => {
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
    if (isDirty) {
      setConfirmClose(true);
      return;
    }
    finalizeClose();
  }, [finalizeClose, isDirty]);

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