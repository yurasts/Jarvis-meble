import { useState, useRef, useMemo } from 'react';
import { getProjectFileDisplayUrl } from '../utils/projectFileAccess';
import {
  isProjectImage as isImage,
  isProjectPdf as isPdf,
  shortenProjectFilename as shortenFileName,
} from '../utils/projectFileTypes';
import FileLightbox from './FileLightbox';
import {
  DesktopProjectFileCarousel,
  FileActionError,
  FileCategorySelect,
  ProjectFileDetails,
  StoFileRow,
} from './FilesTabViews';
import useProjectFiles from './useProjectFiles';
import fs from './FilesTab.module.css';

// Единая таблица четырёх реальных папок — общая для variant='shelf' и variant='tab' (оба
// используют один и тот же селектор одновременно как фильтр видимых файлов и как категорию
// загрузки нового файла). "Wszystkie" сюда намеренно не входит — обе полки не место назначения
// для загрузки "во все"; id совпадают с project_files.category и нигде не переименовываются.
const FOLDER_CATEGORIES = [
  { id: 'projekt', label: 'Zadanie', icon: '📐' },
  { id: 'usterki', label: 'Projekt', icon: '⚠' },
  { id: 'montaz',  label: 'Montaż',  icon: '✅' },
  { id: 'inne',    label: 'Inne',    icon: '📄' },
];

const DESKTOP_FOLDER_CATEGORIES = ['usterki', 'projekt', 'montaz', 'inne']
  .map(id => FOLDER_CATEGORIES.find(category => category.id === id));

const isStoFile = (file) => /\.sto$/i.test(file?.file_name || '');

// Польское склонение существительного "plik" по числу: 1 plik; 2-4 pliki (кроме 12-14); 5-21
// plików (включая 12-14); и так же далее по остатку от деления на 10/100 (22-24 pliki, 25-31
// plików и т.д.) — стандартное правило множественного числа для исчисляемых существительных.
const pluralPliki = (n) => {
  if (n === 1) return 'plik';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'pliki';
  return 'plików';
};

// variant='tab' — прежний полноразмерный интерфейс вкладки Pliki (только desktop/embedded
// modal-fallback после переноса mobile на полку — см. ниже); variant='shelf' — компактная полка,
// используемая и в шапке desktop/embedded, и (с mobileLayout=true) внутри прокручиваемого
// контента mobile-экрана проекта (ADR-003 + feat/mobile-files-zoom). Один компонент, один
// files-стейт, один fetch — переключается только JSX-вывод, никакого второго монтирования/запроса.
export default function FilesTab({ clientId, currentProfile, coverUrl, onCoverChange, variant = 'tab', initialShelfExpanded = false, expanded: expandedProp, onExpandedChange, mobileLayout = false, mobileWorkspaceLayout = false }) {
  const isShelf = variant === 'shelf';
  const {
    files,
    loading,
    uploading,
    deletingFileId,
    fileActionError,
    clearFileActionError,
    settingCover,
    replacingSto,
    downloadingSto,
    stoError,
    uploadFiles,
    replaceSto,
    removeFile,
    updateComment,
    toggleCover,
    downloadSto,
  } = useProjectFiles({ clientId, currentProfile, coverUrl, onCoverChange });
  // Общий дефолт для обеих вариантов — при открытии Pliki (mobile/tab) и полки (shelf)
  // изначально видна папка "usterki" (подпись "⚠ Projekt" — см. FOLDER_CATEGORIES). В обеих
  // вариантах один и тот же activeCategory одновременно фильтрует видимые файлы и служит
  // категорией загрузки — отдельного uploadCategory-стейта больше нет ни у одной из них.
  const [activeCategory, setActiveCategory] = useState('usterki');
  const [editingComment, setEditingComment] = useState(null);
  const [commentDraft,   setCommentDraft]   = useState('');
  const [confirmDeleteId,setConfirmDeleteId]= useState(null);
  // id файла, открытого в общем FileLightbox (не url — id стабилен и однозначно находит позицию
  // в текущей отфильтрованной по категории подборке images, даже если files успел измениться).
  const [lightboxFileId, setLightboxFileId] = useState(null);
  // Полка Pliki (variant='shelf'): свёрнута по умолчанию, кроме случая, когда ProjectModal явно
  // просит открыть её развёрнутой (initialTab='files' на desktop/embedded и на mobile). Может
  // управляться снаружи (expanded/onExpandedChange — родитель меняет layout шапки/контента при
  // разворачивании) либо оставаться неконтролируемым состоянием самого компонента — оба режима
  // используют один и тот же смонтированный экземпляр FilesTab.
  const isExpandedControlled = expandedProp !== undefined;
  const [internalShelfExpanded, setInternalShelfExpanded] = useState(initialShelfExpanded);
  const shelfExpanded = isExpandedControlled ? expandedProp : internalShelfExpanded;
  const setShelfExpanded = (updater) => {
    const next = typeof updater === 'function' ? updater(shelfExpanded) : updater;
    if (isExpandedControlled) onExpandedChange?.(next);
    else setInternalShelfExpanded(next);
  };
  const fileInputRef = useRef();
  const stoInputRef = useRef();

  // Именованный (не создаваемый заново в .map()) обработчик выбора папки — используется рядом
  // кнопок-папок в mobileWorkspaceLayout ниже; тот же принцип "один select одновременно фильтрует
  // видимые файлы и служит категорией загрузки", что и у остальных вариантов.
  function selectFolder(id) {
    setConfirmDeleteId(null);
    clearFileActionError();
    setActiveCategory(id);
  }

  async function handleUpload(e) {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;
    await uploadFiles(selected, activeCategory);
    e.target.value = '';
  }

  async function handleStoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    await replaceSto(file, stoFile);
    e.target.value = '';
  }

  async function handleDeleteFile(file) {
    const removed = await removeFile(file);
    if (removed && lightboxFileId === file.id) setLightboxFileId(null);
    setConfirmDeleteId(null);
  }

  function beginDelete(fileId) {
    clearFileActionError();
    setConfirmDeleteId(fileId);
  }

  async function saveComment(file) {
    const saved = await updateComment(file, commentDraft);
    if (saved) setEditingComment(null);
  }

  // Ни один из двух вариантов больше не предлагает "Wszystkie" в селекторе — activeCategory
  // всегда одна из 4 реальных папок, поэтому фильтрация всегда точечная по категории.
  // useMemo — не просто оптимизация: images передаётся в FileLightbox как проп files, от
  // которого зависят его next/prev (useCallback) и, соответственно, эффект подписки на keydown
  // (Escape/стрелки); без мемоизации новый массив на КАЖДЫЙ рендер FilesTab (включая никак не
  // связанные с файлами изменения — editingComment, confirmDeleteId и т.п.) пересоздавал бы
  // next/prev и постоянно пересобирал слушатель, а не только при реальном изменении набора файлов.
  const stoFile = files.find(isStoFile) || null;
  const ordinaryFiles = useMemo(() => files.filter(file => !isStoFile(file)), [files]);
  const visible = useMemo(() => ordinaryFiles.filter(f => f.category === activeCategory), [ordinaryFiles, activeCategory]);
  const images = useMemo(() => visible.filter(f => isImage(f.file_type)), [visible]);
  const docs   = visible.filter(f => !isImage(f.file_type));

  // Общий FileLightbox (перенос из бывшей внутренней renderLightbox — теперь используется тот
  // же компонент, что и в Dashboard.jsx). files — только изображения ТЕКУЩЕЙ отфильтрованной
  // категории (images), а не все файлы проекта — иначе, выбрав, например, "⚠ Projekt", можно
  // было бы перелистнуть на файл из Zadanie/Montaż/Inne. startInView — клик по миниатюре сразу
  // открывает выбранное изображение, минуя промежуточную сетку (та по-прежнему доступна изнутри
  // просмотра через кнопку "⊞ Wróć do siatki", если файлов несколько).
  function renderLightbox() {
    const lightboxIndex = lightboxFileId !== null ? images.findIndex(f => f.id === lightboxFileId) : -1;
    if (lightboxIndex < 0) return null;
    const cat = FOLDER_CATEGORIES.find(c => c.id === activeCategory);
    return (
      <FileLightbox
        files={images}
        categoryLabel={cat ? `${cat.icon} ${cat.label}` : ''}
        initialIndex={lightboxIndex}
        startInView
        onClose={() => setLightboxFileId(null)}
      />
    );
  }

  // Полноразмерная сетка фото + список документов — общая часть variant='tab' и
  // разворота variant='shelf' (без второго Supabase-запроса, тот же files/visible/images/docs).
  function renderDetailedList() {
    return (
      <ProjectFileDetails
        loading={loading}
        isShelf={isShelf}
        images={images}
        documents={docs}
        categories={FOLDER_CATEGORIES}
        coverUrl={coverUrl}
        editingComment={editingComment}
        commentDraft={commentDraft}
        settingCover={settingCover}
        deletingFileId={deletingFileId}
        confirmDeleteId={confirmDeleteId}
        fileActionError={fileActionError}
        onOpenImage={setLightboxFileId}
        onCommentDraftChange={setCommentDraft}
        onStartComment={file => { setEditingComment(file.id); setCommentDraft(file.comment || ''); }}
        onSaveComment={saveComment}
        onToggleCover={toggleCover}
        onConfirmDelete={beginDelete}
        onCancelDelete={() => setConfirmDeleteId(null)}
        onDelete={handleDeleteFile}
      />
    );
  }

  // ======== variant='shelf' — компактная полка Pliki: в шапке desktop/embedded (mobileLayout
  // не передан) либо внутри прокручиваемого контента mobile-экрана (mobileLayout=true — крупные
  // touch-target'ы ≥40×40px, счётчик встроен в текст опции селектора, подпись "📎 Pliki" скрыта,
  // подписи кнопок — иконки с aria-label/title, лента миниатюр крупнее). ========
  if (isShelf && !mobileLayout && !mobileWorkspaceLayout) {
    return (
      <section className={fs.desktopShelf} aria-label="Pliki projektu">
        <div className={fs.desktopControls}>
          <strong className={fs.desktopTitle}>Pliki projektu</strong>
          <div className={fs.desktopFolderRow}>
            {DESKTOP_FOLDER_CATEGORIES.map(category => (
              <button
                key={category.id}
                type="button"
                disabled={uploading}
                className={[fs.desktopFolderBtn, activeCategory === category.id ? fs.desktopFolderBtnActive : ''].filter(Boolean).join(' ')}
                onClick={() => selectFolder(category.id)}
              >
                {category.label}
              </button>
            ))}
            <button
              type="button"
              disabled={uploading}
              className={fs.desktopUploadBtn}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Dodaj plik lub zdjęcie do wybranego folderu"
              title="Dodaj plik lub zdjęcie"
            >
              {uploading ? '…' : '+'}
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.pms,.pr0" hidden onChange={handleUpload} />
          </div>
        </div>

        <DesktopProjectFileCarousel
          files={visible}
          loading={loading}
          coverUrl={coverUrl}
          deletingFileId={deletingFileId}
          confirmDeleteId={confirmDeleteId}
          onOpenImage={setLightboxFileId}
          onConfirmDelete={beginDelete}
          onCancelDelete={() => setConfirmDeleteId(null)}
          onDelete={handleDeleteFile}
        />

        <FileActionError message={fileActionError} />

        <StoFileRow
          loading={loading}
          file={stoFile}
          replacing={replacingSto}
          downloading={downloadingSto}
          error={stoError}
          inputRef={stoInputRef}
          onDownload={() => downloadSto(stoFile)}
          onSelectFile={handleStoUpload}
        />

        {renderLightbox()}
      </section>
    );
  }

  if (isShelf && mobileWorkspaceLayout) {
    // Mobile Project Workspace v1 (p.3): вместо <select> + Rozwiń/Zwiń — ряд из 4 кнопок-папок
    // (FOLDER_CATEGORIES, те же id) + "+", и ПОСТОЯННО видимая горизонтальная карусель миниатюр
    // 132×132px (без промежуточного свёрнутого/развёрнутого состояния — просто нет отдельного
    // "развёрнутого" вида в этом варианте). Один и тот же activeCategory одновременно фильтрует
    // видимые файлы и служит категорией загрузки — тот же принцип, что и в остальных вариантах,
    // переключение папки не делает новый Supabase fetch (files/loading общие с variant='shelf').
    return (
      <div className={fs.root}>
        <div className={fs.folderRow}>
          {FOLDER_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              disabled={uploading}
              className={`${fs.folderBtn} ${activeCategory === cat.id ? fs.folderBtnActive : ''}`}
              onClick={() => selectFolder(cat.id)}
            >
              {cat.label}
            </button>
          ))}
          <button
            type="button"
            disabled={uploading}
            className={fs.uploadBtn}
            onClick={() => fileInputRef.current.click()}
            aria-label="Dodaj plik lub zdjęcie"
            title="Dodaj plik lub zdjęcie"
          >
            {uploading ? '⏳' : '+'}
          </button>
          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.pms,.pr0" style={{ display: 'none' }} onChange={handleUpload} />
        </div>

        <FileActionError message={fileActionError} />

        {loading ? (
          <div className={fs.emptyHint}>Ładowanie...</div>
        ) : visible.length === 0 ? (
          <div className={fs.emptyHint}>Brak plików w tym folderze.</div>
        ) : (
          <div className={fs.carousel}>
            {visible.map(file => (
              isImage(file.file_type) ? (
                <img
                  key={file.id}
                  src={getProjectFileDisplayUrl(file)}
                  alt={file.file_name}
                  draggable={false}
                  onClick={() => setLightboxFileId(file.id)}
                  className={fs.carouselImg}
                  style={coverUrl === file.file_url ? { borderColor: '#f6ad55', borderWidth: '2px' } : undefined}
                />
              ) : (
                <a
                  key={file.id}
                  href={getProjectFileDisplayUrl(file)}
                  target="_blank"
                  rel="noreferrer"
                  title={file.file_name}
                  className={fs.carouselDoc}
                >
                  <span className={fs.carouselDocIcon}>{isPdf(file.file_type) ? '📄' : '📁'}</span>
                  <span className={fs.carouselDocName}>{shortenFileName(file.file_name, 18)}</span>
                </a>
              )
            ))}
          </div>
        )}

        {renderLightbox()}
      </div>
    );
  }

  if (isShelf) {
    const thumbSize = mobileLayout ? '68px' : '60px';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: mobileLayout ? '8px' : '6px', minWidth: 0 }}>
        {/* Компактная строка — всегда видна */}
        {mobileLayout ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', minWidth: 0 }}>
            <FileCategorySelect
              categories={FOLDER_CATEGORIES}
              files={files}
              value={activeCategory}
              disabled={uploading}
              onChange={setActiveCategory}
              showCounts
              ariaLabel="Folder plików projektu"
              style={{ flex: 1, minWidth: 0, minHeight: '40px', boxSizing: 'border-box', padding: '9px 8px', borderRadius: '8px', border: '1px solid var(--input-border)', fontSize: '13px', background: 'var(--input-bg)', color: 'var(--text-main)' }}
            />
            <button
              onClick={() => fileInputRef.current.click()}
              disabled={uploading}
              title="Dodaj plik lub zdjęcie"
              aria-label="Dodaj plik lub zdjęcie"
              style={{ flexShrink: 0, width: '40px', height: '40px', boxSizing: 'border-box', borderRadius: '8px', border: 'none', background: '#3182ce', color: '#fff', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {uploading ? '⏳' : '+'}
            </button>
            <button
              onClick={() => setShelfExpanded(v => !v)}
              title={shelfExpanded ? 'Zwiń pliki' : 'Rozwiń pliki'}
              aria-label={shelfExpanded ? 'Zwiń pliki' : 'Rozwiń pliki'}
              style={{ flexShrink: 0, width: '40px', height: '40px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {shelfExpanded ? '⌃' : '⌄'}
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.pms,.pr0" style={{ display: 'none' }} onChange={handleUpload} />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', minWidth: 0 }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-main)', whiteSpace: 'nowrap', flexShrink: 0 }}>📎 Pliki</span>
            <FileCategorySelect
              categories={FOLDER_CATEGORIES}
              files={files}
              value={activeCategory}
              disabled={uploading}
              onChange={setActiveCategory}
              style={{ padding: '3px 5px', borderRadius: '6px', border: '1px solid var(--input-border)', fontSize: '11px', background: 'var(--input-bg)', color: 'var(--text-main)', flexShrink: 1, minWidth: 0 }}
            />
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {loading ? '…' : `${visible.length} ${pluralPliki(visible.length)}`}
            </span>
            <button
              onClick={() => fileInputRef.current.click()}
              disabled={uploading}
              style={{ padding: '3px 9px', borderRadius: '6px', border: 'none', background: '#3182ce', color: '#fff', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              {uploading ? '⏳' : '+ Dodaj'}
            </button>
            <button
              onClick={() => setShelfExpanded(v => !v)}
              style={{ padding: '3px 9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              {shelfExpanded ? 'Zwiń' : 'Rozwiń'}
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.pms,.pr0" style={{ display: 'none' }} onChange={handleUpload} />
          </div>
        )}

        {!shelfExpanded && <FileActionError message={fileActionError} />}

        {/* Горизонтальная лента миниатюр — только в свёрнутом состоянии, свой overflow-x (весь
            остальной экран горизонтальный scroll не получает). Пока идёт первичная загрузка
            (loading), пустая папка не утверждается — показываем нейтральный индикатор вместо
            преждевременного "Brak plików". */}
        {!shelfExpanded && (
          loading ? (
            <div style={{ fontSize: '11px', color: '#a0aec0' }}>Ładowanie...</div>
          ) : visible.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#a0aec0' }}>Brak plików w tym folderze.</div>
          ) : (
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', overflowY: 'hidden', paddingBottom: '2px' }}>
              {visible.map(file => (
                isImage(file.file_type) ? (
                  <img
                    key={file.id}
                    src={getProjectFileDisplayUrl(file)}
                    alt={file.file_name}
                    onClick={() => setLightboxFileId(file.id)}
                    style={{
                      height: thumbSize, width: thumbSize, objectFit: 'cover', borderRadius: '4px',
                      cursor: 'zoom-in', flexShrink: 0,
                      border: coverUrl === file.file_url ? '2px solid #f6ad55' : '1px solid var(--border)',
                    }}
                  />
                ) : (
                  <a
                    key={file.id}
                    href={getProjectFileDisplayUrl(file)}
                    target="_blank"
                    rel="noreferrer"
                    title={file.file_name}
                    style={{
                      height: thumbSize, minWidth: '56px', maxWidth: '80px', flexShrink: 0,
                      borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: '2px', textDecoration: 'none', padding: '4px', boxSizing: 'border-box',
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>{isPdf(file.file_type) ? '📄' : '📁'}</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      {shortenFileName(file.file_name)}
                    </span>
                  </a>
                )
              ))}
            </div>
          )
        )}

        {/* Развёрнутый вид — те же карточки/документы, что и в variant='tab' (комментарии,
            удаление, обложка, lightbox) — без второго монтирования или Supabase-запроса. */}
        {shelfExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '2px' }}>
            {renderDetailedList()}
          </div>
        )}

        {renderLightbox()}
      </div>
    );
  }

  // ======== variant='tab' — desktop/embedded modal-fallback (mobile теперь использует полку
  // выше). Тот же принцип единого селектора, что и в variant='shelf' (пункт финального ревью: два
  // раздельных набора "видимая папка"/"категория загрузки" с одинаковыми на вид, но разными по
  // сути названиями — недопустимы). Один select одновременно фильтрует видимые файлы и служит
  // категорией загрузки; отдельной строки filter-chips и "Wszystkie" здесь больше нет. ========
  // На узких экранах (320–390px, всё ещё возможно для fallback-варианта) длинная подпись кнопки
  // не помещается рядом с select (flex:1) — допустимое сокращение до "+ Dodaj".
  const narrowUpload = typeof window !== 'undefined' && window.innerWidth < 400;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Компактная верхняя строка: [ ⚠ Projekt (2) ▾ ][ + Dodaj plik / zdjęcie ] */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <FileCategorySelect
          categories={FOLDER_CATEGORIES}
          files={files}
          value={activeCategory}
          disabled={uploading}
          onChange={setActiveCategory}
          showCounts
          ariaLabel="Folder plików projektu"
          style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '12px' }}
        />
        <button
          onClick={() => fileInputRef.current.click()}
          disabled={uploading}
          style={{ flexShrink: 0, whiteSpace: 'nowrap', background: '#3182ce', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
        >
          {uploading ? '⏳ Wgrywanie...' : (narrowUpload ? '+ Dodaj' : '+ Dodaj plik / zdjęcie')}
        </button>
        <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.pms,.pr0" style={{ display: 'none' }} onChange={handleUpload} />
      </div>

      {/* Подсказка про обложку */}
      {images.length > 0 && (
        <span style={{ fontSize: '11px', color: '#a0aec0' }}>
          ⭐ = okładka na Dashboard
        </span>
      )}

      {renderDetailedList()}
      {renderLightbox()}
    </div>
  );
}
