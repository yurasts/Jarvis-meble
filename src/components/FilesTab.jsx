import { useState, useRef, useMemo, useEffect } from 'react';
import { getProjectFileDisplayUrl } from '../utils/projectFileAccess';
import {
  DEFAULT_PROJECT_FILE_CATEGORY,
  PROJECT_FILE_CATEGORIES,
  findProjectFileCategory,
} from '../utils/projectFileCategories';
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

// Четыре реальные папки (id = project_files.category, см. utils/projectFileCategories.js) —
// общие для variant='shelf' и variant='tab': один и тот же выбор одновременно фильтрует видимые
// файлы и служит категорией загрузки. "Wszystkie" сюда намеренно не входит.
// Единый порядок для mobile/tab и desktop: Projekt → Zadanie → Krój → Montaż.
// На desktop сами кнопки папок живут в левой панели.
const FOLDER_CATEGORIES = PROJECT_FILE_CATEGORIES;

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
// Desktop workspace (2026-10): кнопки папок и "+" вынесены в левую панель под активный проект.
// В этом режиме (externalFolderControls) выбранная папка приходит снаружи (category /
// onCategoryChange), а "+" вызывает загрузку через функцию, которую FilesTab регистрирует в
// uploadTriggerRef — сам скрытый <input type="file"> остаётся здесь, рядом с useProjectFiles.
export default function FilesTab({
  clientId,
  currentProfile,
  coverUrl,
  onCoverChange,
  variant = 'tab',
  initialShelfExpanded = false,
  expanded: expandedProp,
  onExpandedChange,
  mobileLayout = false,
  mobileWorkspaceLayout = false,
  externalFolderControls = false,
  category: categoryProp,
  onCategoryChange,
  uploadTriggerRef,
  onUploadingChange,
}) {
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
  const [internalCategory, setInternalCategory] = useState(DEFAULT_PROJECT_FILE_CATEGORY);
  const isCategoryControlled = categoryProp !== undefined;
  const activeCategory = isCategoryControlled ? categoryProp : internalCategory;
  const setActiveCategory = (id) => {
    if (isCategoryControlled) onCategoryChange?.(id);
    else setInternalCategory(id);
  };
  const [editingComment, setEditingComment] = useState(null);
  const [commentDraft,   setCommentDraft]   = useState('');
  const [confirmDeleteId,setConfirmDeleteId]= useState(null);
  // Папка сменилась снаружи (клик в левой панели) — сбрасываем открытое подтверждение удаления и
  // ошибку прошлой операции так же, как при локальном selectFolder (adjust-state-during-render).
  const [renderedCategory, setRenderedCategory] = useState(activeCategory);
  if (renderedCategory !== activeCategory) {
    setRenderedCategory(activeCategory);
    setConfirmDeleteId(null);
    if (fileActionError) clearFileActionError();
  }
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

  // "+" из левой панели: регистрируем функцию открытия диалога выбора файлов. Вызывается прямо
  // из обработчика клика кнопки, поэтому браузер считает это действием пользователя.
  useEffect(() => {
    if (!uploadTriggerRef) return undefined;
    const trigger = () => fileInputRef.current?.click();
    uploadTriggerRef.current = trigger;
    return () => {
      if (uploadTriggerRef.current === trigger) uploadTriggerRef.current = null;
    };
  }, [uploadTriggerRef]);

  useEffect(() => {
    if (!onUploadingChange) return undefined;
    onUploadingChange(uploading);
    return () => onUploadingChange(false);
  }, [uploading, onUploadingChange]);

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
    const activeFolder = findProjectFileCategory(activeCategory);
    return (
      <section
        className={[fs.desktopShelf, externalFolderControls ? fs.desktopShelfCompact : ''].filter(Boolean).join(' ')}
        aria-label={externalFolderControls && activeFolder ? `Pliki projektu: ${activeFolder.label}` : 'Pliki projektu'}
      >
        {externalFolderControls ? (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.pms,.pr0"
            hidden
            onChange={handleUpload}
            data-testid="project-files-upload-input"
          />
        ) : (
        <div className={fs.desktopControls}>
          <strong className={fs.desktopTitle}>Pliki projektu</strong>
          <div className={fs.desktopFolderRow}>
            {FOLDER_CATEGORIES.map(category => (
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
        )}

        <DesktopProjectFileCarousel
          files={visible}
          loading={loading}
          emptyText={externalFolderControls && activeFolder
            ? `Brak plików w folderze „${activeFolder.label}”. Dodaj je przyciskiem + w panelu projektów po lewej.`
            : undefined}
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
    // Mobile Project Workspace v1 (redesign 2026-10-18 — parytet z desktopem): ten sam
    // DesktopProjectFileCarousel co na desktop-polce (ten sam rozmiar 224×224px, ten sam przycisk
    // usuwania z potwierdzeniem) zamiast osobnej, mniejszej (132px) karuzeli bez usuwania — duże,
    // czytelne miniatury. Rząd przycisków-folderów NIE jest już osobnym wierszem NAD karuzelą (p.2
    // starego układu) — to wąska pionowa kolumna PO PRAWEJ stronie karuzeli (ikona + skrócona
    // podpis, min-height 40px), żeby duże zdjęcia miały maksimum szerokości. Ten sam activeCategory
    // jednocześnie filtruje widoczne pliki i służy kategorii uploadu — bez zmian.
    return (
      <div className={fs.root}>
        <div className={fs.mobileFilesRow}>
          <div className={fs.mobileCarouselWrap}>
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
          </div>

          <div className={fs.mobileFolderCol}>
            {FOLDER_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                disabled={uploading}
                className={`${fs.mobileFolderBtn} ${activeCategory === cat.id ? fs.mobileFolderBtnActive : ''}`}
                onClick={() => selectFolder(cat.id)}
                aria-label={cat.label}
                title={cat.label}
              >
                <span aria-hidden="true" className={fs.mobileFolderIcon}>{cat.icon}</span>
                <span className={fs.mobileFolderLabel}>{cat.label}</span>
              </button>
            ))}
            <button
              type="button"
              disabled={uploading}
              className={fs.mobileUploadBtn}
              onClick={() => fileInputRef.current.click()}
              aria-label="Dodaj plik lub zdjęcie"
              title="Dodaj plik lub zdjęcie"
            >
              {uploading ? '⏳' : '+'}
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.pms,.pr0" className={fs.hiddenFileInput} onChange={handleUpload} />
          </div>
        </div>

        {renderLightbox()}
      </div>
    );
  }

  if (isShelf) {
    return (
      <div className={fs.compactShelf} data-mobile={mobileLayout}>
        {/* Компактная строка — всегда видна */}
        {mobileLayout ? (
          <div className={fs.compactRow} data-mobile="true">
            <FileCategorySelect
              categories={FOLDER_CATEGORIES}
              files={files}
              value={activeCategory}
              disabled={uploading}
              onChange={setActiveCategory}
              showCounts
              ariaLabel="Folder plików projektu"
              className={fs.compactSelectMobile}
            />
            <button
              onClick={() => fileInputRef.current.click()}
              disabled={uploading}
              title="Dodaj plik lub zdjęcie"
              aria-label="Dodaj plik lub zdjęcie"
              className={fs.compactUploadBtnMobile}
            >
              {uploading ? '⏳' : '+'}
            </button>
            <button
              onClick={() => setShelfExpanded(v => !v)}
              title={shelfExpanded ? 'Zwiń pliki' : 'Rozwiń pliki'}
              aria-label={shelfExpanded ? 'Zwiń pliki' : 'Rozwiń pliki'}
              className={fs.compactToggleBtnMobile}
            >
              {shelfExpanded ? '⌃' : '⌄'}
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.pms,.pr0" className={fs.hiddenFileInput} onChange={handleUpload} />
          </div>
        ) : (
          <div className={fs.compactRow}>
            <span className={fs.compactLabel}>📎 Pliki</span>
            <FileCategorySelect
              categories={FOLDER_CATEGORIES}
              files={files}
              value={activeCategory}
              disabled={uploading}
              onChange={setActiveCategory}
              className={fs.compactSelect}
            />
            <span className={fs.compactCount}>
              {loading ? '…' : `${visible.length} ${pluralPliki(visible.length)}`}
            </span>
            <button
              onClick={() => fileInputRef.current.click()}
              disabled={uploading}
              className={fs.compactUploadBtn}
            >
              {uploading ? '⏳' : '+ Dodaj'}
            </button>
            <button
              onClick={() => setShelfExpanded(v => !v)}
              className={fs.compactToggleBtn}
            >
              {shelfExpanded ? 'Zwiń' : 'Rozwiń'}
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.pms,.pr0" className={fs.hiddenFileInput} onChange={handleUpload} />
          </div>
        )}

        {!shelfExpanded && <FileActionError message={fileActionError} />}

        {/* Горизонтальная лента миниатюр — только в свёрнутом состоянии, свой overflow-x (весь
            остальной экран горизонтальный scroll не получает). Пока идёт первичная загрузка
            (loading), пустая папка не утверждается — показываем нейтральный индикатор вместо
            преждевременного "Brak plików". */}
        {!shelfExpanded && (
          loading ? (
            <div className={fs.compactStateText}>Ładowanie...</div>
          ) : visible.length === 0 ? (
            <div className={fs.compactStateText}>Brak plików w tym folderze.</div>
          ) : (
            <div className={fs.compactStrip}>
              {visible.map(file => (
                isImage(file.file_type) ? (
                  <img
                    key={file.id}
                    src={getProjectFileDisplayUrl(file)}
                    alt={file.file_name}
                    onClick={() => setLightboxFileId(file.id)}
                    data-mobile={mobileLayout}
                    className={`${fs.compactStripImg} ${coverUrl === file.file_url ? fs.compactStripImgCover : ''}`}
                  />
                ) : (
                  <a
                    key={file.id}
                    href={getProjectFileDisplayUrl(file)}
                    target="_blank"
                    rel="noreferrer"
                    title={file.file_name}
                    data-mobile={mobileLayout}
                    className={fs.compactStripDoc}
                  >
                    <span className={fs.compactStripDocIcon}>{isPdf(file.file_type) ? '📄' : '📁'}</span>
                    <span className={fs.compactStripDocName}>
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
          <div className={fs.compactExpanded}>
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
    <div className={fs.tabRoot}>

      {/* Компактная верхняя строка: [ ⚠ Projekt (2) ▾ ][ + Dodaj plik / zdjęcie ] */}
      <div className={fs.tabTopRow}>
        <FileCategorySelect
          categories={FOLDER_CATEGORIES}
          files={files}
          value={activeCategory}
          disabled={uploading}
          onChange={setActiveCategory}
          showCounts
          ariaLabel="Folder plików projektu"
          className={fs.tabSelect}
        />
        <button
          onClick={() => fileInputRef.current.click()}
          disabled={uploading}
          className={fs.tabUploadBtn}
        >
          {uploading ? '⏳ Wgrywanie...' : (narrowUpload ? '+ Dodaj' : '+ Dodaj plik / zdjęcie')}
        </button>
        <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.pms,.pr0" className={fs.hiddenFileInput} onChange={handleUpload} />
      </div>

      {/* Подсказка про обложку */}
      {images.length > 0 && (
        <span className={fs.tabCoverHint}>
          ⭐ = okładka na Dashboard
        </span>
      )}

      {renderDetailedList()}
      {renderLightbox()}
    </div>
  );
}
