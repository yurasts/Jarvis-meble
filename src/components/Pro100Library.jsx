import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileBox, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { EMPTY_PRO100_FORM, filterAndSortPro100Files } from '../utils/pro100Library';
import usePro100Library from './usePro100Library';
import s from './Pro100Library.module.css';

const pluralFiles = (count) => {
  if (count === 1) return 'plik';
  const mod10 = count % 10;
  const mod100 = count % 100;
  return mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? 'pliki' : 'plików';
};

const formatSize = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
  : '—';

export default function Pro100Library() {
  const {
    categories,
    files,
    loading,
    loadError,
    actionBusy,
    actionError,
    notice,
    reload,
    saveFile,
    replaceFile: replaceLibraryFile,
    deleteFile: deleteLibraryFile,
    downloadFile: downloadLibraryFile,
    clearActionError,
  } = usePro100Library();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [expandedId, setExpandedId] = useState(null);
  const [dialogMode, setDialogMode] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const [form, setForm] = useState(EMPTY_PRO100_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const replaceInputRef = useRef(null);

  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category])),
    [categories],
  );

  const visibleFiles = useMemo(() => filterAndSortPro100Files({
    files,
    categories,
    search,
    activeCategory,
    sortOrder,
  }), [activeCategory, categories, files, search, sortOrder]);
  const openCreate = () => {
    setEditingFile(null);
    setSelectedFile(null);
    setForm({ ...EMPTY_PRO100_FORM, categoryId: categories[0]?.id || '' });
    clearActionError();
    setDialogMode('create');
  };

  const openEdit = (file) => {
    setEditingFile(file);
    setSelectedFile(null);
    setForm({ title: file.title || '', clientName: file.client_name || '', categoryId: file.category_id || '', description: file.description || '', tags: (file.tags || []).join(', ') });
    clearActionError();
    setDialogMode('edit');
  };

  const closeDialog = () => {
    if (actionBusy) return;
    setDialogMode(null);
    setEditingFile(null);
    setSelectedFile(null);
    clearActionError();
  };

  const saveDialog = async (event) => {
    event.preventDefault();
    const saved = await saveFile({
      mode: dialogMode,
      form,
      selectedFile,
      editingFile,
    });
    if (!saved) return;
    setDialogMode(null);
    setEditingFile(null);
    setSelectedFile(null);
  };

  const startReplace = (file) => {
    setReplaceTarget(file);
    clearActionError();
    if (replaceInputRef.current) { replaceInputRef.current.value = ''; replaceInputRef.current.click(); }
  };

  const replaceFile = async (event) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile || !replaceTarget) return;
    const replaced = await replaceLibraryFile(replaceTarget, nextFile);
    if (replaced) setReplaceTarget(null);
    event.target.value = '';
  };

  const deleteFile = async (file) => {
    const deleted = await deleteLibraryFile(file);
    if (!deleted) return;
    setExpandedId(null);
    setDeleteId(null);
  };

  return (
    <section className={s.screen} aria-labelledby="pro100-library-title">
      <header className={s.pageHeader}>
        <div><h1 id="pro100-library-title">Biblioteka PRO100</h1><p>{files.length} {pluralFiles(files.length)} w bibliotece</p></div>
        <button type="button" className={s.primaryButton} onClick={openCreate} disabled={loading || !!loadError}><Plus size={17} /> Dodaj plik</button>
      </header>

      <div className={s.toolbar}>
        <label className={s.searchBox}><Search size={17} aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj pliku lub opisu…" aria-label="Szukaj pliku lub opisu" /></label>
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} aria-label="Sortowanie">
          <option value="newest">Ostatnio dodane</option><option value="oldest">Najstarsze</option><option value="title">Nazwa A–Z</option>
        </select>
      </div>

      <div className={s.categoryBar} aria-label="Kategorie plików">
        <button type="button" className={activeCategory === 'all' ? s.categoryActive : ''} onClick={() => setActiveCategory('all')}>Wszystkie <span>{files.length}</span></button>
        {categories.map((category) => {
          const count = files.filter((file) => file.category_id === category.id).length;
          return <button key={category.id} type="button" className={activeCategory === category.id ? s.categoryActive : ''} onClick={() => setActiveCategory(category.id)}>{category.name} <span>{count}</span></button>;
        })}
      </div>

      {(notice || actionError) && <div className={actionError ? s.errorBanner : s.noticeBanner} role="status">{actionError || notice}</div>}

      <div className={s.tableShell}><div className={s.tableScroller}>
        <div className={s.tableHeader} aria-hidden="true"><span>Plik</span><span>Kategoria</span><span>Zmieniono</span><span>Rozmiar</span><span>Klient</span><span>Akcje</span></div>
        {loading && <div className={s.stateBox}>Ładowanie biblioteki…</div>}
        {!loading && loadError && <div className={s.stateBox}><FileBox size={30} /><strong>{loadError}</strong><button type="button" className={s.secondaryButton} onClick={reload}>Spróbuj ponownie</button></div>}
        {!loading && !loadError && visibleFiles.length === 0 && <div className={s.stateBox}><FileBox size={30} /><strong>Brak plików w tej kategorii.</strong><span>Zmień filtr albo dodaj pierwszy plik PRO100.</span></div>}

        {!loading && !loadError && visibleFiles.map((file) => {
          const expanded = expandedId === file.id;
          return <article key={file.id} className={`${s.fileItem} ${expanded ? s.fileItemExpanded : ''}`}>
            <div className={s.fileRow}>
              <button type="button" className={s.fileNameButton} onClick={() => setExpandedId(expanded ? null : file.id)} aria-expanded={expanded}>
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<span className={s.fileIcon}>STO</span>
                <span className={s.fileIdentity}><strong>{file.title || file.original_filename}</strong></span>
              </button>
              <span>{categoryById[file.category_id]?.name || '—'}</span><span>{formatDate(file.updated_at)}</span><span>{formatSize(file.file_size)}</span>
              <span>{file.client_name || '\u2014'}</span>
              <button type="button" className={s.downloadButton} onClick={() => downloadLibraryFile(file)}><Download size={15} /> Pobierz</button>
            </div>
            {expanded && <div className={s.expandedPanel}>
              <div className={s.descriptionBlock}><span>Opis</span><p>{file.description || 'Brak opisu. Możesz go dodać, aby łatwiej odnaleźć i wykorzystać projekt.'}</p>
                {(file.tags || []).length > 0 && <div className={s.tags}>{file.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
              </div>
              <div className={s.expandedActions}>
                <button type="button" onClick={() => startReplace(file)} disabled={actionBusy}><Upload size={15} /> Zastąp plik</button>
                <button type="button" onClick={() => openEdit(file)} disabled={actionBusy}><Pencil size={15} /> Edytuj opis</button>
                {deleteId === file.id ? <div className={s.deleteConfirm}><span>Usunąć plik?</span><button type="button" onClick={() => deleteFile(file)} disabled={actionBusy}>Tak</button><button type="button" onClick={() => setDeleteId(null)} disabled={actionBusy}>Nie</button></div>
                  : <button type="button" className={s.dangerButton} onClick={() => setDeleteId(file.id)} disabled={actionBusy}><Trash2 size={15} /> Usuń</button>}
              </div>
            </div>}
          </article>;
        })}
      </div></div>

      <input ref={replaceInputRef} type="file" accept=".sto" hidden onChange={replaceFile} />
      {dialogMode && <div className={s.modalBackdrop} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && closeDialog()}>
        <form className={s.modal} onSubmit={saveDialog}>
          <div className={s.modalHeader}><div><h2>{dialogMode === 'create' ? 'Dodaj plik PRO100' : 'Edytuj opis pliku'}</h2><p>{dialogMode === 'create' ? 'Dodaj gotowy projekt do wspólnej biblioteki.' : editingFile?.original_filename}</p></div><button type="button" className={s.closeButton} onClick={closeDialog} aria-label="Zamknij">×</button></div>
          {dialogMode === 'create' && <label className={s.filePicker}><Upload size={22} /><span>{selectedFile ? selectedFile.name : 'Wybierz plik .sto'}</span><small>Maksymalny rozmiar: 100 MB</small><input type="file" accept=".sto" onChange={(e) => { const file = e.target.files?.[0] || null; setSelectedFile(file); if (file && !form.title) setForm((current) => ({ ...current, title: file.name.replace(/\.sto$/i, '') })); }} /></label>}
          <div className={s.formGrid}>
            <label><span>Nazwa</span><input maxLength={140} value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} /></label>
            <label><span>Klient</span><input maxLength={140} value={form.clientName} onChange={(e) => setForm((current) => ({ ...current, clientName: e.target.value }))} placeholder="np. Nina Chernyak" /></label>
            <label><span>Kategoria</span><select value={form.categoryId} onChange={(e) => setForm((current) => ({ ...current, categoryId: e.target.value }))}><option value="">Wybierz kategorię</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          </div>
          <label className={s.fieldLabel}><span>Opis <small>(opcjonalnie)</small></span><textarea maxLength={1500} rows={5} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /></label>
          <label className={s.fieldLabel}><span>Tagi <small>(oddziel przecinkami)</small></span><input value={form.tags} onChange={(e) => setForm((current) => ({ ...current, tags: e.target.value }))} placeholder="np. narożna, biała, wysoka zabudowa" /></label>
          {actionError && <div className={s.modalError}>{actionError}</div>}
          <div className={s.modalActions}><button type="button" className={s.secondaryButton} onClick={closeDialog} disabled={actionBusy}>Anuluj</button><button type="submit" className={s.primaryButton} disabled={actionBusy}>{actionBusy ? 'Zapisywanie…' : dialogMode === 'create' ? 'Dodaj do biblioteki' : 'Zapisz zmiany'}</button></div>
        </form>
      </div>}
    </section>
  );
}
