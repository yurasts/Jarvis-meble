import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import s from './FileLightbox.module.css';

const isImageFile = (file) =>
  (file.file_type || '').startsWith('image')
  || /\.(jpe?g|png|gif|webp)$/i.test(file.file_name || file.file_url || '');

export default function FileLightbox({ files, categoryLabel, onClose }) {
  const [mode, setMode] = useState(files && files.length > 1 ? 'grid' : 'view');
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(null);

  const next = () => setIndex(i => (i + 1) % files.length);
  const prev = () => setIndex(i => (i - 1 + files.length) % files.length);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (mode !== 'view') return;
      if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [files?.length, mode]);

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

  // --- Шаг 1: сетка миниатюр (если файлов больше одного) ---
  if (mode === 'grid') {
    return createPortal(
      <div className={s.overlay} onClick={onClose}>
        <div className={s.gridBox} onClick={e => e.stopPropagation()}>
          <div className={s.gridHeader}>
            <span className={s.categoryLabel}>{categoryLabel}</span>
            <span className={s.counter}>{files.length} plików</span>
            <button className={s.closeBtn} onClick={onClose}>✕</button>
          </div>
          <div className={s.thumbGrid}>
            {files.map((f, i) => (
              <button
                key={f.id || i}
                className={s.thumbItem}
                onClick={() => { setIndex(i); setMode('view'); }}
                title={f.file_name || ''}
              >
                {isImageFile(f) ? (
                  <img src={f.file_url} alt={f.file_name || ''} className={s.thumbImg} />
                ) : (
                  <div className={s.thumbFileIcon}>📄</div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  const file = files[index];
  const isImage = isImageFile(file);
  const showBackBtn = files.length > 1;

  if (!isImage) {
    return createPortal(
      <div className={s.modalOverlay} onClick={onClose}>
        <div className={s.modalBox} onClick={e => e.stopPropagation()}>
          <div className={s.modalHeader}>
            <span className={s.categoryLabel}>{categoryLabel} · {index + 1}/{files.length}</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {showBackBtn && (
                <button className={s.closeBtn} onClick={() => setMode('grid')} title="Wróć do siatki">⊞</button>
              )}
              <button className={s.closeBtn} onClick={onClose}>✕</button>
            </div>
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
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {showBackBtn && (
            <button className={s.closeBtn} onClick={() => setMode('grid')} title="Wróć do siatki">⊞</button>
          )}
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </div>
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
