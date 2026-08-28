import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileBox, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { supabase } from '../supabase';
import s from './Pro100Library.module.css';

const BUCKET = 'pro100-library';
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const emptyForm = { title: '', clientName: '', categoryId: '', description: '', tags: '' };

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

const safeFilename = (name) => {
  const cleaned = String(name || 'projekt.sto').normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_');
  return cleaned.toLowerCase().endsWith('.sto') ? cleaned : `${cleaned}.sto`;
};

const storagePathFor = (file) => {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${id}/${Date.now()}_${safeFilename(file.name)}`;
};

const parseTags = (value) => String(value || '').split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
const normalizeSearchValue = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pl-PL');

const fetchLibraryData = async () => {
  const [categoryResult, fileResult] = await Promise.all([
    supabase.from('pro100_library_categories').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('pro100_library_files').select('*').order('updated_at', { ascending: false }),
  ]);
  return { categoryResult, fileResult };
};

export default function Pro100Library() {
  const [categories, setCategories] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [expandedId, setExpandedId] = useState(null);
  const [dialogMode, setDialogMode] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const replaceInputRef = useRef(null);

  const applyLoadResult = useCallback((categoryResult, fileResult) => {
    if (categoryResult.error || fileResult.error) {
      setLoadError('Nie udało się załadować biblioteki PRO100. Spróbuj ponownie.');
    } else {
      setCategories(categoryResult.data || []);
      setFiles(fileResult.data || []);
    }
    setLoading(false);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { categoryResult, fileResult } = await fetchLibraryData();
    applyLoadResult(categoryResult, fileResult);
  }, [applyLoadResult]);

  useEffect(() => {
    let active = true;
    fetchLibraryData().then(({ categoryResult, fileResult }) => {
      if (!active) return;
      if (categoryResult.error || fileResult.error) {
        setLoadError('Nie udało się załadować biblioteki PRO100. Spróbuj ponownie.');
      } else {
        setCategories(categoryResult.data || []);
        setFiles(fileResult.data || []);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category])),
    [categories],
  );

  const visibleFiles = useMemo(() => {
    const searchTerms = normalizeSearchValue(search).trim().split(/\s+/).filter(Boolean);
    const filtered = files.filter((file) => {
      const searchableTags = Array.isArray(file.tags)
        ? file.tags
        : String(file.tags || '').replace(/[{}"]/g, ' ').split(',');
      if (searchTerms.length === 0 && activeCategory !== 'all' && file.category_id !== activeCategory) return false;
      if (searchTerms.length === 0) return true;
      const searchableText = normalizeSearchValue([
        file.title,
        file.original_filename,
        file.client_name,
        categoryById[file.category_id]?.name,
        file.description,
        ...searchableTags,
      ].join(' '));
      return searchTerms.every((term) => searchableText.includes(term));
    });
    return [...filtered].sort((a, b) => {
      if (sortOrder === 'oldest') return new Date(a.updated_at) - new Date(b.updated_at);
      if (sortOrder === 'title') return String(a.title).localeCompare(String(b.title), 'pl');
      return new Date(b.updated_at) - new Date(a.updated_at);
    });

  }, [activeCategory, categoryById, files, search, sortOrder]);
  const openCreate = () => {
    setEditingFile(null);
    setSelectedFile(null);
    setForm({ ...emptyForm, categoryId: categories[0]?.id || '' });
    setActionError('');
    setDialogMode('create');
  };

  const openEdit = (file) => {
    setEditingFile(file);
    setSelectedFile(null);
    setForm({ title: file.title || '', clientName: file.client_name || '', categoryId: file.category_id || '', description: file.description || '', tags: (file.tags || []).join(', ') });
    setActionError('');
    setDialogMode('edit');
  };

  const closeDialog = () => {
    if (actionBusy) return;
    setDialogMode(null);
    setEditingFile(null);
    setSelectedFile(null);
    setActionError('');
  };

  const validateSto = (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.sto')) return 'Wybierz plik PRO100 z rozszerzeniem .sto.';
    if (file.size <= 0) return 'Wybrany plik jest pusty.';
    if (file.size > MAX_FILE_SIZE) return 'Plik jest większy niż 100 MB.';
    return '';
  };

  const saveDialog = async (event) => {
    event.preventDefault();
    setActionError('');
    const title = form.title.trim();
    if (!title) { setActionError('Podaj nazwę projektu.'); return; }
    if (!form.categoryId) { setActionError('Wybierz kategorię.'); return; }
    setActionBusy(true);

    if (dialogMode === 'create') {
      const validation = validateSto(selectedFile);
      if (validation) { setActionError(validation); setActionBusy(false); return; }
      const storagePath = storagePathFor(selectedFile);
      const uploadResult = await supabase.storage.from(BUCKET).upload(storagePath, selectedFile, {
        contentType: selectedFile.type || 'application/octet-stream', upsert: false,
      });
      if (uploadResult.error) { setActionError('Nie udało się wysłać pliku. Spróbuj ponownie.'); setActionBusy(false); return; }
      const insertResult = await supabase.from('pro100_library_files').insert({
        category_id: form.categoryId, title, client_name: form.clientName.trim() || null, description: form.description.trim() || null,
        tags: parseTags(form.tags), storage_path: storagePath, original_filename: selectedFile.name,
        file_size: selectedFile.size, content_type: selectedFile.type || 'application/octet-stream',
      }).select('*').single();
      if (insertResult.error) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        setActionError('Nie udało się zapisać pliku w bibliotece.'); setActionBusy(false); return;
      }
      setFiles((current) => [insertResult.data, ...current]);
      setNotice('Plik został dodany do biblioteki.');
    } else {
      const updateResult = await supabase.from('pro100_library_files').update({
        category_id: form.categoryId, title, client_name: form.clientName.trim() || null, description: form.description.trim() || null, tags: parseTags(form.tags),
      }).eq('id', editingFile.id).select('*').single();
      if (updateResult.error) { setActionError('Nie udało się zapisać zmian.'); setActionBusy(false); return; }
      setFiles((current) => current.map((file) => file.id === updateResult.data.id ? updateResult.data : file));
      setNotice('Opis pliku został zaktualizowany.');
    }
    setActionBusy(false);
    setDialogMode(null);
    setEditingFile(null);
    setSelectedFile(null);
  };

  const downloadFile = async (file) => {
    setNotice(''); setActionError('');
    const result = await supabase.storage.from(BUCKET).download(file.storage_path);
    if (result.error) { setActionError('Nie udało się pobrać pliku.'); return; }
    const url = URL.createObjectURL(result.data);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = file.original_filename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };

  const startReplace = (file) => {
    setReplaceTarget(file); setActionError('');
    if (replaceInputRef.current) { replaceInputRef.current.value = ''; replaceInputRef.current.click(); }
  };

  const replaceFile = async (event) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile || !replaceTarget) return;
    const validation = validateSto(nextFile);
    if (validation) { setActionError(validation); return; }
    setActionBusy(true);
    const newPath = storagePathFor(nextFile);
    const uploadResult = await supabase.storage.from(BUCKET).upload(newPath, nextFile, {
      contentType: nextFile.type || 'application/octet-stream', upsert: false,
    });
    if (uploadResult.error) { setActionError('Nie udało się wysłać nowej wersji pliku.'); setActionBusy(false); return; }
    const updateResult = await supabase.from('pro100_library_files').update({
      storage_path: newPath, original_filename: nextFile.name, file_size: nextFile.size,
      content_type: nextFile.type || 'application/octet-stream', version: (replaceTarget.version || 1) + 1,
    }).eq('id', replaceTarget.id).select('*').single();
    if (updateResult.error) {
      await supabase.storage.from(BUCKET).remove([newPath]);
      setActionError('Nie udało się zapisać nowej wersji pliku.'); setActionBusy(false); return;
    }
    await supabase.storage.from(BUCKET).remove([replaceTarget.storage_path]);
    setFiles((current) => current.map((file) => file.id === updateResult.data.id ? updateResult.data : file));
    setNotice('Plik został zastąpiony nową wersją.'); setReplaceTarget(null); setActionBusy(false);
  };

  const deleteFile = async (file) => {
    setActionBusy(true); setActionError('');
    const deleteResult = await supabase.from('pro100_library_files').delete().eq('id', file.id);
    if (deleteResult.error) { setActionError('Nie udało się usunąć pliku.'); setActionBusy(false); return; }
    await supabase.storage.from(BUCKET).remove([file.storage_path]);
    setFiles((current) => current.filter((item) => item.id !== file.id));
    setExpandedId(null); setDeleteId(null); setNotice('Plik został usunięty z biblioteki.'); setActionBusy(false);
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
        {!loading && loadError && <div className={s.stateBox}><FileBox size={30} /><strong>{loadError}</strong><button type="button" className={s.secondaryButton} onClick={loadData}>Spróbuj ponownie</button></div>}
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
              <button type="button" className={s.downloadButton} onClick={() => downloadFile(file)}><Download size={15} /> Pobierz</button>
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
