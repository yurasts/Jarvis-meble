import { getProjectFileDisplayUrl } from '../utils/projectFileAccess';
import {
  projectFileDisplayLabel,
  projectFileMetadataLabel,
} from '../utils/projectFileMetadata';
import {
  isProjectImage,
  isProjectPdf,
  shortenProjectFilename,
} from '../utils/projectFileTypes';
import fs from './FilesTab.module.css';

export function FileActionError({ message, className = fs.desktopFileError }) {
  if (!message) return null;
  return <div className={className} role="alert">{message}</div>;
}

export function FileCategorySelect({
  categories,
  files,
  value,
  disabled,
  onChange,
  showCounts = false,
  ariaLabel,
  className,
  style,
}) {
  return (
    <select
      className={className}
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
      aria-label={ariaLabel}
      style={style}
    >
      {categories.map(category => {
        const count = showCounts
          ? ` (${files.filter(file => file.category === category.id).length})`
          : '';
        return (
          <option key={category.id} value={category.id}>
            {category.icon} {category.label}{count}
          </option>
        );
      })}
    </select>
  );
}

export function ProjectFileDetails({
  loading,
  isShelf,
  images,
  documents,
  categories,
  coverUrl,
  editingComment,
  commentDraft,
  settingCover,
  deletingFileId,
  confirmDeleteId,
  fileActionError,
  onOpenImage,
  onCommentDraftChange,
  onStartComment,
  onSaveComment,
  onToggleCover,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
}) {
  const categoryIcon = categoryId => categories.find(category => category.id === categoryId)?.icon;
  // Цвет автора файла — единственное значение из данных; передаётся в CSS через переменную,
  // остальные стили живут в FilesTab.module.css.
  const uploaderStyle = file => (file.uploaded_by_color ? { '--file-uploader-color': file.uploaded_by_color } : undefined);

  return (
    <>
      {loading && <div className={fs.detailsLoading}>Ładowanie...</div>}
      <FileActionError message={fileActionError} />

      {images.length > 0 && (
        <div className={fs.detailsGrid}>
          {images.map(file => {
            const isCover = coverUrl === file.file_url;
            const isDeleting = deletingFileId === file.id;
            return (
              <div
                key={file.id}
                className={[fs.imageCard, isCover ? fs.imageCardCover : ''].filter(Boolean).join(' ')}
                style={uploaderStyle(file)}
              >
                <div className={fs.imagePreview} onClick={() => onOpenImage(file.id)}>
                  <img
                    src={getProjectFileDisplayUrl(file)}
                    alt={file.file_name}
                    className={fs.imagePreviewImg}
                  />
                  <div className={fs.imageCategoryBadge}>
                    {categoryIcon(file.category)}
                  </div>
                  {isCover && (
                    <div className={fs.imageCoverBadge}>
                      okładka
                    </div>
                  )}
                </div>

                <div className={fs.imageCommentArea}>
                  {editingComment === file.id ? (
                    <input
                      autoFocus
                      value={commentDraft}
                      onChange={event => onCommentDraftChange(event.target.value)}
                      onBlur={() => onSaveComment(file)}
                      onKeyDown={event => event.key === 'Enter' && onSaveComment(file)}
                      aria-label={`Komentarz do ${file.file_name}`}
                      className={fs.imageCommentInput}
                    />
                  ) : (
                    <div
                      onClick={() => onStartComment(file)}
                      className={[fs.imageComment, file.comment ? fs.imageCommentFilled : ''].filter(Boolean).join(' ')}
                    >
                      {file.comment || '+ komentarz'}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={event => { event.stopPropagation(); onToggleCover(file); }}
                  disabled={settingCover === file.id}
                  title={isCover ? 'Usuń okładkę' : 'Ustaw jako okładkę projektu'}
                  className={[fs.coverToggle, isCover ? fs.coverToggleActive : ''].filter(Boolean).join(' ')}
                >
                  {settingCover === file.id ? '⏳' : isCover ? '⭐' : '☆'}
                </button>

                <div className={fs.imageDeleteSlot}>
                  {confirmDeleteId === file.id ? (
                    <div className={fs.imageDeleteConfirm}>
                      <button type="button" disabled={isDeleting} onClick={() => onDelete(file)} className={fs.imageConfirmYes}>{isDeleting ? '…' : 'Tak'}</button>
                      <button type="button" disabled={isDeleting} onClick={onCancelDelete} className={fs.imageConfirmNo}>Nie</button>
                    </div>
                  ) : (
                    <button type="button" disabled={deletingFileId !== null} aria-label={`Usuń plik ${file.file_name}`} onClick={() => onConfirmDelete(file.id)} className={fs.imageDeleteBtn}>✖</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {documents.length > 0 && (
        <div className={fs.docList}>
          {documents.map(file => {
            const isDeleting = deletingFileId === file.id;
            return (
              <div key={file.id} className={fs.docRow} style={uploaderStyle(file)}>
                <span className={fs.docIcon}>{file.file_type === 'application/pdf' ? '📄' : '📁'}</span>
                <a href={getProjectFileDisplayUrl(file)} target="_blank" rel="noreferrer" className={fs.docLink} title={file.file_name}>
                  {file.file_name}
                </a>
                {editingComment === file.id ? (
                  <input
                    autoFocus
                    value={commentDraft}
                    onChange={event => onCommentDraftChange(event.target.value)}
                    onBlur={() => onSaveComment(file)}
                    onKeyDown={event => event.key === 'Enter' && onSaveComment(file)}
                    aria-label={`Komentarz do ${file.file_name}`}
                    placeholder="Komentarz..."
                    className={fs.docCommentInput}
                  />
                ) : (
                  <span onClick={() => onStartComment(file)} className={[fs.docComment, file.comment ? fs.docCommentFilled : ''].filter(Boolean).join(' ')}>
                    {file.comment || '+ komentarz'}
                  </span>
                )}
                <span className={fs.docCategory}>{categoryIcon(file.category)}</span>
                {confirmDeleteId === file.id ? (
                  <div className={fs.docDeleteConfirm}>
                    <button type="button" disabled={isDeleting} onClick={() => onDelete(file)} className={fs.docConfirmYes}>{isDeleting ? '…' : 'Tak'}</button>
                    <button type="button" disabled={isDeleting} onClick={onCancelDelete} className={fs.docConfirmNo}>Nie</button>
                  </div>
                ) : (
                  <button type="button" disabled={deletingFileId !== null} aria-label={`Usuń plik ${file.file_name}`} onClick={() => onConfirmDelete(file.id)} className={fs.docDeleteBtn}>✖</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && images.length === 0 && documents.length === 0 && (
        <div className={fs.detailsEmpty}>
          {isShelf ? 'Brak plików w tym folderze.' : 'Brak plików w tej kategorii.'}
        </div>
      )}
    </>
  );
}

export function DesktopProjectFileCarousel({
  files,
  loading,
  desktopWorkspaceLayout = false,
  coverUrl,
  deletingFileId,
  confirmDeleteId,
  onOpenImage,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  emptyText = 'Brak plików w tym folderze.',
}) {
  if (loading) return <div className={fs.desktopEmpty} data-desktop-file-empty={desktopWorkspaceLayout || undefined}>Ładowanie...</div>;
  if (files.length === 0) return <div className={fs.desktopEmpty} data-desktop-file-empty={desktopWorkspaceLayout || undefined}>{emptyText}</div>;

  return (
    <div className={fs.desktopCarousel}>
      {files.map(file => {
        const fileLabel = projectFileDisplayLabel(file, { includeYear: false });
        return (
          <div key={file.id} className={fs.desktopCarouselItem} title={fileLabel}>
          {isProjectImage(file.file_type) ? (
            <img
              src={getProjectFileDisplayUrl(file)}
              alt={file.file_name}
              title={fileLabel}
              draggable={false}
              onClick={() => onOpenImage(file.id)}
              className={[fs.desktopCarouselImg, coverUrl === file.file_url ? fs.desktopCarouselImgCover : ''].filter(Boolean).join(' ')}
            />
          ) : (
            <a href={getProjectFileDisplayUrl(file)} target="_blank" rel="noreferrer" title={fileLabel} className={fs.desktopCarouselDoc}>
              <span className={fs.desktopCarouselDocIcon}>{isProjectPdf(file.file_type) ? 'PDF' : 'PLIK'}</span>
              <span className={fs.desktopCarouselDocName}>{shortenProjectFilename(file.file_name, 18)}</span>
            </a>
          )}
          <button
            type="button"
            className={fs.desktopDeleteBtn}
            disabled={deletingFileId !== null}
            aria-label={`Usuń plik ${file.file_name}`}
            title="Usuń plik"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              onConfirmDelete(file.id);
            }}
          >
            ×
          </button>
          {confirmDeleteId === file.id && (
            <div className={fs.desktopDeleteConfirm} role="dialog" aria-label={`Usunąć plik ${file.file_name}?`}>
              <span>Usunąć?</span>
              <div className={fs.desktopDeleteActions}>
                <button type="button" disabled={deletingFileId === file.id} onClick={() => onDelete(file)}>
                  {deletingFileId === file.id ? '…' : 'Tak'}
                </button>
                <button type="button" disabled={deletingFileId === file.id} onClick={onCancelDelete}>Nie</button>
              </div>
            </div>
          )}
          </div>
        );
      })}
    </div>
  );
}

export function StoFileRow({
  loading,
  file,
  replacing,
  downloading,
  error,
  inputRef,
  onDownload,
  onSelectFile,
  headerLayout = false,
}) {
  const fileLabel = file ? projectFileDisplayLabel(file) : '';
  const fileMetadata = file ? projectFileMetadataLabel(file) : '';
  return (
    <>
      <div className={fs.stoRow} data-project-sto-header={headerLayout || undefined}>
        <span className={fs.stoLabel} data-project-sto-label>Plik PRO100 (.sto):</span>
        {loading ? (
          <span className={fs.stoMissing} data-project-sto-value>Ładowanie...</span>
        ) : file ? (
          <>
            <span className={fs.stoFilename} data-project-sto-value title={fileLabel}>
              <span data-project-sto-filename>{file.file_name}</span>
              {fileMetadata && <span data-project-sto-metadata> · {fileMetadata}</span>}
            </span>
            <button type="button" className={fs.stoDownloadBtn} data-project-sto-action disabled={downloading || replacing} onClick={onDownload}>
              {downloading ? 'Pobieranie…' : 'Pobierz'}
            </button>
            <button type="button" className={fs.stoReplaceBtn} data-project-sto-action disabled={replacing} onClick={() => inputRef.current?.click()}>
              {replacing ? 'Wgrywanie…' : 'Zamień'}
            </button>
          </>
        ) : (
          <>
            <span className={fs.stoMissing} data-project-sto-value>Brak pliku .sto</span>
            <button type="button" className={fs.stoDownloadBtn} data-project-sto-action disabled={replacing} onClick={() => inputRef.current?.click()}>
              {replacing ? 'Wgrywanie…' : 'Dodaj'}
            </button>
          </>
        )}
        <input ref={inputRef} type="file" accept=".sto" hidden onChange={onSelectFile} />
      </div>
      {error && <div className={fs.stoError} data-project-sto-error={headerLayout || undefined} role="alert">{error}</div>}
    </>
  );
}
