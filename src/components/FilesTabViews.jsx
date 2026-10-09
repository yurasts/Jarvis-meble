import { getProjectFileDisplayUrl } from '../utils/projectFileAccess';
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
  style,
}) {
  return (
    <select
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

  return (
    <>
      {loading && <div style={{ color: '#a0aec0', fontSize: '13px' }}>Ładowanie...</div>}
      <FileActionError message={fileActionError} />

      {images.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
          {images.map(file => {
            const isCover = coverUrl === file.file_url;
            const isDeleting = deletingFileId === file.id;
            return (
              <div key={file.id} style={{
                borderRadius: '6px', overflow: 'hidden', position: 'relative',
                border: isCover ? '2px solid #f6ad55' : `2px solid ${file.uploaded_by_color || '#e2e8f0'}`,
                background: '#fff',
                boxShadow: isCover ? '0 0 0 2px #f6ad5566' : 'none',
              }}>
                <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => onOpenImage(file.id)}>
                  <img
                    src={getProjectFileDisplayUrl(file)}
                    alt={file.file_name}
                    style={{ width: '100%', height: '100px', objectFit: 'cover', display: 'block' }}
                  />
                  <div style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '3px' }}>
                    {categoryIcon(file.category)}
                  </div>
                  {isCover && (
                    <div style={{ position: 'absolute', bottom: '4px', left: '4px', background: '#f6ad55', color: '#744210', fontSize: '10px', fontWeight: 'bold', padding: '1px 5px', borderRadius: '3px' }}>
                      okładka
                    </div>
                  )}
                </div>

                <div style={{ padding: '4px 6px', borderTop: `2px solid ${file.uploaded_by_color || '#e2e8f0'}` }}>
                  {editingComment === file.id ? (
                    <input
                      autoFocus
                      value={commentDraft}
                      onChange={event => onCommentDraftChange(event.target.value)}
                      onBlur={() => onSaveComment(file)}
                      onKeyDown={event => event.key === 'Enter' && onSaveComment(file)}
                      aria-label={`Komentarz do ${file.file_name}`}
                      style={{ width: '100%', fontSize: '11px', border: 'none', outline: 'none', background: 'transparent', boxSizing: 'border-box' }}
                    />
                  ) : (
                    <div
                      onClick={() => onStartComment(file)}
                      style={{ fontSize: '11px', color: file.comment ? '#2d3748' : '#a0aec0', cursor: 'text', minHeight: '16px' }}
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
                  style={{
                    position: 'absolute', bottom: '28px', right: '4px',
                    background: isCover ? '#f6ad55' : 'rgba(0,0,0,0.45)',
                    border: 'none', borderRadius: '50%', width: '22px', height: '22px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', fontSize: '12px', lineHeight: 1,
                    transition: 'background 0.15s',
                  }}
                >
                  {settingCover === file.id ? '⏳' : isCover ? '⭐' : '☆'}
                </button>

                <div style={{ position: 'absolute', top: '4px', right: '4px' }}>
                  {confirmDeleteId === file.id ? (
                    <div style={{ background: 'rgba(0,0,0,0.75)', borderRadius: '4px', padding: '3px 5px', display: 'flex', gap: '3px' }}>
                      <button type="button" disabled={isDeleting} onClick={() => onDelete(file)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>{isDeleting ? '…' : 'Tak'}</button>
                      <button type="button" disabled={isDeleting} onClick={onCancelDelete} style={{ background: '#e2e8f0', color: '#2d3748', border: 'none', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>Nie</button>
                    </div>
                  ) : (
                    <button type="button" disabled={deletingFileId !== null} aria-label={`Usuń plik ${file.file_name}`} onClick={() => onConfirmDelete(file.id)} style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', border: 'none', width: '20px', height: '20px', borderRadius: '50%', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✖</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {documents.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
          {documents.map((file, index) => {
            const isDeleting = deletingFileId === file.id;
            return (
              <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderBottom: index < documents.length - 1 ? '1px solid #e2e8f0' : 'none', background: '#fff', borderLeft: `3px solid ${file.uploaded_by_color || '#e2e8f0'}` }}>
                <span style={{ fontSize: '18px', flexShrink: 0 }}>{file.file_type === 'application/pdf' ? '📄' : '📁'}</span>
                <a href={getProjectFileDisplayUrl(file)} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#2b6cb0', fontWeight: 'bold', textDecoration: 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.file_name}>
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
                    style={{ fontSize: '11px', border: '1px solid #cbd5e0', borderRadius: '4px', padding: '2px 6px', width: '140px' }}
                  />
                ) : (
                  <span onClick={() => onStartComment(file)} style={{ fontSize: '11px', color: file.comment ? '#4a5568' : '#a0aec0', cursor: 'text', minWidth: '60px' }}>
                    {file.comment || '+ komentarz'}
                  </span>
                )}
                <span style={{ fontSize: '10px', color: '#a0aec0', flexShrink: 0 }}>{categoryIcon(file.category)}</span>
                {confirmDeleteId === file.id ? (
                  <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                    <button type="button" disabled={isDeleting} onClick={() => onDelete(file)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>{isDeleting ? '…' : 'Tak'}</button>
                    <button type="button" disabled={isDeleting} onClick={onCancelDelete} style={{ background: '#e2e8f0', color: '#2d3748', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Nie</button>
                  </div>
                ) : (
                  <button type="button" disabled={deletingFileId !== null} aria-label={`Usuń plik ${file.file_name}`} onClick={() => onConfirmDelete(file.id)} style={{ background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', fontSize: '14px', flexShrink: 0, lineHeight: 1 }}>✖</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && images.length === 0 && documents.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px', color: '#a0aec0', fontSize: '13px', border: '2px dashed #e2e8f0', borderRadius: '8px' }}>
          {isShelf ? 'Brak plików w tym folderze.' : 'Brak plików w tej kategorii.'}
        </div>
      )}
    </>
  );
}

export function DesktopProjectFileCarousel({
  files,
  loading,
  coverUrl,
  deletingFileId,
  confirmDeleteId,
  onOpenImage,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
}) {
  if (loading) return <div className={fs.desktopEmpty}>Ładowanie...</div>;
  if (files.length === 0) return <div className={fs.desktopEmpty}>Brak plików w tym folderze.</div>;

  return (
    <div className={fs.desktopCarousel}>
      {files.map(file => (
        <div key={file.id} className={fs.desktopCarouselItem}>
          {isProjectImage(file.file_type) ? (
            <img
              src={getProjectFileDisplayUrl(file)}
              alt={file.file_name}
              draggable={false}
              onClick={() => onOpenImage(file.id)}
              className={fs.desktopCarouselImg}
              style={coverUrl === file.file_url ? { borderColor: '#f6ad55', borderWidth: '2px' } : undefined}
            />
          ) : (
            <a href={getProjectFileDisplayUrl(file)} target="_blank" rel="noreferrer" title={file.file_name} className={fs.desktopCarouselDoc}>
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
      ))}
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
}) {
  return (
    <>
      <div className={fs.stoRow}>
        <span className={fs.stoLabel}>Plik PRO100 (.sto):</span>
        {loading ? (
          <span className={fs.stoMissing}>Ładowanie...</span>
        ) : file ? (
          <>
            <span className={fs.stoFilename} title={file.file_name}>{file.file_name}</span>
            <button type="button" className={fs.stoDownloadBtn} disabled={downloading || replacing} onClick={onDownload}>
              {downloading ? 'Pobieranie…' : 'Pobierz'}
            </button>
            <button type="button" className={fs.stoReplaceBtn} disabled={replacing} onClick={() => inputRef.current?.click()}>
              {replacing ? 'Wgrywanie…' : 'Zamień'}
            </button>
          </>
        ) : (
          <>
            <span className={fs.stoMissing}>Brak pliku .sto</span>
            <button type="button" className={fs.stoDownloadBtn} disabled={replacing} onClick={() => inputRef.current?.click()}>
              {replacing ? 'Wgrywanie…' : 'Dodaj'}
            </button>
          </>
        )}
        <input ref={inputRef} type="file" accept=".sto" hidden onChange={onSelectFile} />
      </div>
      {error && <div className={fs.stoError} role="alert">{error}</div>}
    </>
  );
}
