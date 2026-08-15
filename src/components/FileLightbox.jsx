import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getProjectFileDisplayUrl } from '../utils/projectFileAccess';
import s from './FileLightbox.module.css';

const isImageFile = (file) =>
  (file.file_type || '').startsWith('image')
  || /\.(jpe?g|png|gif|webp)$/i.test(file.file_name || file.file_url || '');

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const ZOOM_STEP = 1.4;
const SWIPE_THRESHOLD = 50;
const TAP_SLOP = 8;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Тот же алгоритм польского склонения "plik", что и в FilesTab.jsx — не импортируется оттуда,
// чтобы не создавать циклическую зависимость (FilesTab уже импортирует FileLightbox).
const pluralPliki = (n) => {
  if (n === 1) return 'plik';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'pliki';
  return 'plików';
};

// Полноэкранный image-viewer с zoom/pan без сторонней библиотеки (Pointer Events + touch-action:
// none — современный подход, не требует preventDefault на touch-событиях). Архитектура жестов:
// - один палец/мышь при scale=1: НЕ двигает картинку, на pointerup решает tap (→ handleTap,
//   двойной — zoom) или swipe (→ onSwipeNext/onSwipePrev), только если жест не завершился как pan;
// - один палец/мышь при scale>1: перемещает изображение (pan), swipe-навигация в этом случае
//   отключена — жест целиком уходит на перемещение увеличенной картинки;
// - два пальца: pinch — масштаб и перенос считаются от снимка состояния в момент начала жеста
//   (gestureRef), а не инкрементально от предыдущего кадра — устойчиво к пропущенным кадрам;
// - зум вокруг точки (курсор/пальцы/double-tap) — формула сохраняет экранную позицию точки:
//   tx1 = tx0*r + dx*(1-r), где r = s1/s0, dx/dy — смещение точки от центра контейнера;
// - сброс zoom/pan при смене изображения/переоткрытии — не эффектом, а через key={file.id} у
//   ZoomableImage (родитель) — React размонтирует и монтирует заново, что тривиально и надёжно.
function ZoomableImage({ src, alt, canSwipe, onSwipeNext, onSwipePrev }) {
  const containerRef = useRef(null);
  const [xform, setXform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [isGesturing, setIsGesturing] = useState(false);
  const xformRef = useRef(xform);
  useEffect(() => { xformRef.current = xform; }, [xform]);

  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });

  // clampXform/zoomAt — стабильные (useCallback, без зависимостей от render-значений: читают
  // только containerRef.current и пишут через функциональный setXform) — это единственный способ
  // дать wheel-эффекту ниже корректный, непустой и НЕ подавленный exhaustive-deps массив
  // зависимостей, при котором listener монтируется один раз за жизненный цикл компонента, а не
  // пересоздаётся на каждый setXform (каждый кадр зума колёсиком).
  const clampXform = useCallback((scale, tx, ty) => {
    const nextScale = clamp(scale, MIN_SCALE, MAX_SCALE);
    const el = containerRef.current;
    let nx = tx, ny = ty;
    if (el) {
      const w = el.clientWidth, h = el.clientHeight;
      const maxX = Math.max(0, (w * nextScale - w) / 2);
      const maxY = Math.max(0, (h * nextScale - h) / 2);
      nx = clamp(tx, -maxX, maxX);
      ny = clamp(ty, -maxY, maxY);
    }
    return { scale: nextScale, tx: nx, ty: ny };
  }, []);

  // originX/originY — экранная точка (клиентские координаты), которая должна остаться на месте
  // после изменения масштаба (курсор колёсика, середина pinch, точка double-tap).
  const zoomAt = useCallback((originX, originY, scaleOrUpdater) => {
    setXform(prev => {
      const rect = containerRef.current?.getBoundingClientRect();
      const cx = rect ? rect.left + rect.width / 2 : originX;
      const cy = rect ? rect.top + rect.height / 2 : originY;
      const dx = originX - cx, dy = originY - cy;
      const target = typeof scaleOrUpdater === 'function' ? scaleOrUpdater(prev.scale) : scaleOrUpdater;
      const s1 = clamp(target, MIN_SCALE, MAX_SCALE);
      const r = s1 / prev.scale;
      return clampXform(s1, prev.tx * r + dx * (1 - r), prev.ty * r + dy * (1 - r));
    });
  }, [clampXform]);

  const zoomAtCenter = useCallback((scaleUpdater) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : 0;
    const cy = rect ? rect.top + rect.height / 2 : 0;
    zoomAt(cx, cy, scaleUpdater);
  }, [zoomAt]);

  const resetXform = () => setXform({ scale: 1, tx: 0, ty: 0 });

  // Mouse-wheel zoom (desktop) — нативный listener с passive:false, т.к. React attach'ит onWheel
  // как passive по умолчанию и preventDefault внутри синтетического обработчика не сработает.
  // zoomAt стабилен (см. выше), поэтому этот эффект с корректным [zoomAt] в зависимостях
  // монтирует listener РОВНО один раз за жизненный цикл компонента (не на каждый zoom-кадр).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, (s) => s * Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const handleTap = (x, y) => {
    const now = Date.now();
    const last = lastTapRef.current;
    const isDouble = now - last.time < 300 && Math.hypot(x - last.x, y - last.y) < 30;
    lastTapRef.current = isDouble ? { time: 0, x: 0, y: 0 } : { time: now, x, y };
    if (!isDouble) return;
    setXform(prev => {
      if (prev.scale > 1.01) return { scale: 1, tx: 0, ty: 0 };
      const rect = containerRef.current?.getBoundingClientRect();
      const cx = rect ? rect.left + rect.width / 2 : x;
      const cy = rect ? rect.top + rect.height / 2 : y;
      const dx = x - cx, dy = y - cy;
      const r = DOUBLE_TAP_SCALE / prev.scale;
      return clampXform(DOUBLE_TAP_SCALE, prev.tx * r + dx * (1 - r), prev.ty * r + dy * (1 - r));
    });
  };

  const onPointerDown = (e) => {
    // Некоторые окружения (в т.ч. синтетические pointer-события) не считают pointerId "активным" —
    // setPointerCapture в этом случае бросает исключение; сам захват — не более чем удобство
    // (гарантирует получение move/up за пределами элемента), поэтому безопасно игнорировать сбой.
    try { containerRef.current?.setPointerCapture(e.pointerId); } catch { /* noop */ }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      setIsGesturing(true);
      const { scale, tx, ty } = xformRef.current;
      gestureRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, tx0: tx, ty0: ty, scale0: scale, moved: false };
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const { scale, tx, ty } = xformRef.current;
      gestureRef.current = {
        type: 'pinch',
        d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        scale0: scale, tx0: tx, ty0: ty,
        midX0: (pts[0].x + pts[1].x) / 2, midY0: (pts[0].y + pts[1].y) / 2,
      };
    }
  };

  const onPointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    if (!g) return;
    if (g.type === 'pan') {
      const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
      if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) g.moved = true;
      if (g.scale0 > 1.01) {
        setXform(() => clampXform(g.scale0, g.tx0 + dx, g.ty0 + dy));
      }
    } else if (g.type === 'pinch') {
      const pts = Array.from(pointersRef.current.values());
      if (pts.length < 2) return;
      const d1 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const midX1 = (pts[0].x + pts[1].x) / 2, midY1 = (pts[0].y + pts[1].y) / 2;
      const target = clamp(g.scale0 * (d1 / g.d0), MIN_SCALE, MAX_SCALE);
      const r = target / g.scale0;
      const rect = containerRef.current?.getBoundingClientRect();
      const cx = rect ? rect.left + rect.width / 2 : g.midX0;
      const cy = rect ? rect.top + rect.height / 2 : g.midY0;
      const dx0 = g.midX0 - cx, dy0 = g.midY0 - cy;
      const nextTx = g.tx0 * r + dx0 * (1 - r) + (midX1 - g.midX0);
      const nextTy = g.ty0 * r + dy0 * (1 - r) + (midY1 - g.midY0);
      setXform(() => clampXform(target, nextTx, nextTy));
    }
  };

  const endGesture = (e) => {
    pointersRef.current.delete(e.pointerId);
    const g = gestureRef.current;
    if (pointersRef.current.size === 0) {
      setIsGesturing(false);
      if (g?.type === 'pan') {
        if (!g.moved) {
          handleTap(e.clientX, e.clientY);
        } else if (g.scale0 <= 1.01 && canSwipe) {
          const dx = e.clientX - g.startX;
          if (dx < -SWIPE_THRESHOLD) onSwipeNext?.();
          else if (dx > SWIPE_THRESHOLD) onSwipePrev?.();
        }
      }
      gestureRef.current = null;
    } else if (pointersRef.current.size === 1) {
      // Один палец убрали из pinch — переходим на pan с текущей (уже применённой) трансформации,
      // без "прыжка" картинки.
      const remaining = Array.from(pointersRef.current.values())[0];
      const { scale, tx, ty } = xformRef.current;
      gestureRef.current = { type: 'pan', startX: remaining.x, startY: remaining.y, tx0: tx, ty0: ty, scale0: scale, moved: false };
    }
  };

  return (
    <>
      <div
        ref={containerRef}
        className={s.zoomStage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        style={{ cursor: xform.scale > 1.01 ? (isGesturing ? 'grabbing' : 'grab') : 'default' }}
      >
        <img
          src={src}
          alt={alt || ''}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className={s.zoomImg}
          style={{
            transform: `translate3d(${xform.tx}px, ${xform.ty}px, 0) scale(${xform.scale})`,
            transition: isGesturing ? 'none' : 'transform 0.2s ease-out',
          }}
        />
      </div>
      <div className={s.bottomBar} onClick={e => e.stopPropagation()}>
        <div className={s.zoomPill}>
          <button className={s.zoomBtn} onClick={() => zoomAtCenter(sc => sc / ZOOM_STEP)} title="Pomniejsz" aria-label="Pomniejsz">−</button>
          <button className={s.zoomReset} onClick={resetXform} title="Resetuj powiększenie" aria-label="Resetuj powiększenie">{Math.round(xform.scale * 100)}%</button>
          <button className={s.zoomBtn} onClick={() => zoomAtCenter(sc => sc * ZOOM_STEP)} title="Powiększ" aria-label="Powiększ">+</button>
        </div>
      </div>
    </>
  );
}

export default function FileLightbox({ files, categoryLabel, onClose, initialIndex = 0, startInView = false }) {
  const [mode, setMode] = useState((startInView || !files || files.length <= 1) ? 'view' : 'grid');
  const [index, setIndex] = useState(initialIndex);

  const next = useCallback(() => setIndex(i => (i + 1) % files.length), [files]);
  const prev = useCallback(() => setIndex(i => (i - 1 + files.length) % files.length), [files]);

  // Пока viewer открыт — body не прокручивается (актуально и для сетки, и для просмотра
  // документа, и для zoom-view); восстанавливаем прежнее значение при закрытии.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (mode !== 'view') return;
      if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, next, prev, onClose]);

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
            <span className={s.counter}>{files.length} {pluralPliki(files.length)}</span>
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
                  <img src={getProjectFileDisplayUrl(f)} alt={f.file_name || ''} className={s.thumbImg} />
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
            <a href={getProjectFileDisplayUrl(file)} target="_blank" rel="noreferrer" className={s.fileLinkModal}>
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
    <div className={s.overlay} onClick={onClose}>
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
        {/* key={file.id} — при смене изображения (index) React полностью размонтирует и заново
            монтирует ZoomableImage, что само по себе сбрасывает scale/translate к 1×/0,0 без
            отдельного синхронизирующего эффекта; то же самое происходит при закрытии/повторном
            открытии viewer, т.к. FileLightbox целиком размонтируется родителем. */}
        <ZoomableImage
          key={file.id ?? index}
          src={getProjectFileDisplayUrl(file)}
          alt={file.file_name || ''}
          canSwipe={files.length > 1}
          onSwipeNext={next}
          onSwipePrev={prev}
        />
        {file.comment && <div className={s.comment}>{file.comment}</div>}
      </div>

      {files.length > 1 && (
        <button className={s.navRight} onClick={(e) => { e.stopPropagation(); next(); }}>›</button>
      )}
    </div>,
    document.body
  );
}
