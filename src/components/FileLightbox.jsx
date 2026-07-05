import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import s from './FileLightbox.module.css';

export default function FileLightbox({ files, categoryLabel, onClose }) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(null);

  const next = () => setIndex(i => (i + 1) % files.length);
  const prev = () => setIndex(i => (i - 1 + files.length) % files.length);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [files.length]);

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -40) next();
    else if (dx > 40) prev();
    touchStartX.current = null;
  };

  if (!files || files.length === 0) {
    return createPortal(
      <div className={s.overlay} onClick={onClose}>
        <div className={s.empty} onClick={e => e.stopPropagation()}>
          <p>Brak plików w kategorii {categoryLabel}.</p>
          <button className={s.closeBtn} onClick={onClose}>✕ Zamknij</button>
        </div>
      </div>,
      document.body
    );
  }

  const file = files[index];
  const isImage = (file.file_type || '').startsWith('image')
    || /\.(jpe?g|png|gif|webp)$/i.test(file.file_name || file.file_url || '');

  if (!isImage) {
    return createPortal(
      <div className={s.modalOverlay} onClick={onClose}>
        <div className={s.modalBox} onClick={e => e.stopPropagation()}>
          <div className={s.modalHeader}>
            <span className={s.categoryLabel}>{categoryLabel} · {index + 1}/{files.length}</span>
            <button className={s.closeBtn} onClick={onClose}>✕</button>
          </div>
          <div className={s.modalBody}>
            <a href={file.file_url} target="_blank" rel="noreferrer" className={s.fileLinkModal}>
              📄 {file.file_name || 'Otwórz plik'}
            </a>
            {file.comment && <div className={s.commentModal}>{file.comment}</div>}
          </div>
          {files.length > 1 && (
            <div className={s.modalNav}>
              <button className={s.modalNavBtn} onClick={prev}>‹ Poprzedni</button>
              <button className={s.modalNavBtn} onClick={next}>Następny ›</button>
            </div>
          )}
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className={s.overlay}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className={s.topBar} onClick={e => e.stopPropagation()}>
        <span className={s.categoryLabel}>{categoryLabel}</span>
        <span className={s.counter}>{index + 1} / {files.length}</span>
        <button className={s.closeBtn} onClick={onClose}>✕</button>
      </div>

      {files.length > 1 && (
        <button className={s.navLeft} onClick={(e) => { e.stopPropagation(); prev(); }}>‹</button>
      )}

      <div className={s.content} onClick={e => e.stopPropagation()}>
        <img src={file.file_url} alt={file.file_name || ''} className={s.image} />
        {file.comment && <div className={s.comment}>{file.comment}</div>}
      </div>

      {files.length > 1 && (
        <button className={s.navRight} onClick={(e) => { e.stopPropagation(); next(); }}>›</button>
      )}
    </div>,
    document.body
  );
}
