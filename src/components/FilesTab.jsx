import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabase';
import { getProjectFileDisplayUrl, withProjectFileSignedUrls } from '../utils/projectFileAccess';
import FileLightbox from './FileLightbox';
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

const isImage = (type) => type && type.startsWith('image/');
const isPdf   = (type) => type === 'application/pdf';
const isStoFile = (file) => /\.sto$/i.test(file?.file_name || '');

const shortenFileName = (name, max = 12) => {
  if (!name) return '';
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
};

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
  const [files,          setFiles]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [uploading,      setUploading]      = useState(false);
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
  const [settingCover,   setSettingCover]   = useState(false); // лоадер при выборе обложки
  const [replacingSto,   setReplacingSto]   = useState(false);
  const [downloadingSto, setDownloadingSto] = useState(false);
  const [stoError,       setStoError]       = useState('');
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
  // ✅ FIX: ref для категории — гарантирует актуальное значение в момент загрузки файла.
  // Зеркалит activeCategory в обеих вариантах (единственный селектор = категория загрузки).
  const uploadCategoryRef = useRef('usterki');

  // Загрузка списка файлов проекта. Async-функция объявлена и вызвана прямо внутри эффекта
  // (канонический паттерн React для fetch-в-эффекте: https://react.dev/learn/you-might-not-need-an-effect),
  // а не как отдельная функция компонента — тело эффекта не делает ни одного синхронного
  // setState до первого await. Флаг cancelled защищает от записи в state после unmount/смены clientId.
  useEffect(() => {
    let cancelled = false;
    async function loadFiles() {
      const { data } = await supabase
        .from('project_files')
        .select('*')
        .eq('client_id', clientId)
        .order('uploaded_at', { ascending: false });
      const signedFiles = await withProjectFileSignedUrls(data || []);
      if (cancelled) return;
      setFiles(signedFiles);
      setLoading(false);
    }
    loadFiles();
    return () => { cancelled = true; };
  }, [clientId]);

  // Именованный (не создаваемый заново в .map()) обработчик выбора папки — используется рядом
  // кнопок-папок в mobileWorkspaceLayout ниже; тот же принцип "один select одновременно фильтрует
  // видимые файлы и служит категорией загрузки", что и у остальных вариантов.
  function selectFolder(id) {
    setActiveCategory(id);
    uploadCategoryRef.current = id;
  }

  async function handleUpload(e) {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;
    setUploading(true);
    for (const file of selected) {
      const path = `${clientId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage
        .from('project-files').upload(path, file, { upsert: false });
      if (upErr) { console.error(upErr); continue; }
      const { data: { publicUrl } } = supabase.storage
        .from('project-files').getPublicUrl(path);
      const { data: row } = await supabase.from('project_files').insert([{
        client_id:         clientId,
        category:          uploadCategoryRef.current, // ✅ берём из ref — всегда актуально
        file_name:         file.name,
        file_path:         path,
        file_url:          publicUrl,
        file_type:         file.type,
        comment:           '',
        uploaded_by:       currentProfile?.id    || null,
        uploaded_by_color: currentProfile?.color || '#718096',
      }]).select().single();
      if (row) {
        const [signedRow] = await withProjectFileSignedUrls([row]);
        setFiles(prev => [signedRow, ...prev]);
      }
    }
    setUploading(false);
    fileInputRef.current.value = '';
  }

  async function handleStoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.sto$/i.test(file.name)) {
      setStoError('Wybierz plik z rozszerzeniem .sto.');
      e.target.value = '';
      return;
    }

    setReplacingSto(true);
    setStoError('');
    const uploadedAt = new Date().toISOString();
    const path = clientId + '/sto/' + uploadedAt.replace(/[^0-9]/g, '') + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    try {
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('project-files')
        .getPublicUrl(path);
      const payload = {
        client_id: clientId,
        category: 'sto',
        file_name: file.name,
        file_path: path,
        file_url: publicUrl,
        file_type: file.type || 'application/octet-stream',
        comment: '',
        uploaded_at: uploadedAt,
        uploaded_by: currentProfile?.id || null,
        uploaded_by_color: currentProfile?.color || '#718096',
      };

      const oldPath = stoFile?.file_path;
      const query = stoFile
        ? supabase.from('project_files').update(payload).eq('id', stoFile.id)
        : supabase.from('project_files').insert([payload]);
      const { data: savedFile, error: saveError } = await query.select().single();

      if (saveError) {
        await supabase.storage.from('project-files').remove([path]);
        throw saveError;
      }

      setFiles(prev => [savedFile, ...prev.filter(item => item.id !== savedFile.id)]);
      if (oldPath && oldPath !== path) {
        const { error: cleanupError } = await supabase.storage.from('project-files').remove([oldPath]);
        if (cleanupError) console.error(cleanupError);
      }
    } catch (error) {
      console.error(error);
      setStoError('Nie udało się zapisać pliku .sto. Spróbuj ponownie.');
    } finally {
      setReplacingSto(false);
      e.target.value = '';
    }
  }

  async function handleDeleteFile(file) {
    await supabase.storage.from('project-files').remove([file.file_path]);
    await supabase.from('project_files').delete().eq('id', file.id);
    setFiles(prev => prev.filter(f => f.id !== file.id));
    // если удалили обложку — сбрасываем
    if (file.file_url === coverUrl) {
      await supabase.from('clients').update({ cover_url: null }).eq('id', clientId);
      onCoverChange?.(null);
    }
    setConfirmDeleteId(null);
  }

  async function saveComment(file) {
    await supabase.from('project_files').update({ comment: commentDraft }).eq('id', file.id);
    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, comment: commentDraft } : f));
    setEditingComment(null);
  }

  // ⭐ Установить/снять обложку
  async function handleSetCover(file) {
    setSettingCover(file.id);
    const newUrl = coverUrl === file.file_url ? null : file.file_url; // повторный клик — снимает
    await supabase.from('clients').update({ cover_url: newUrl }).eq('id', clientId);
    onCoverChange?.(newUrl);
    setSettingCover(false);
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

  async function handleDownloadSto() {
    if (!stoFile || downloadingSto) return;
    setDownloadingSto(true);
    setStoError('');
    try {
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from('project-files')
        .download(stoFile.file_path);
      if (downloadError) throw downloadError;
      const blobUrl = URL.createObjectURL(fileBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = stoFile.file_name || 'projekt.sto';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error(error);
      setStoError('Nie udało się pobrać pliku .sto.');
    } finally {
      setDownloadingSto(false);
    }
  }

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
      <>
        {loading && <div style={{ color: '#a0aec0', fontSize: '13px' }}>Ładowanie...</div>}

        {/* ФОТО */}
        {images.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
            {images.map(file => {
              const isCover = coverUrl === file.file_url;
              return (
                <div key={file.id} style={{
                  borderRadius: '6px', overflow: 'hidden', position: 'relative',
                  border: isCover
                    ? '2px solid #f6ad55'                          // золотая рамка = обложка
                    : `2px solid ${file.uploaded_by_color || '#e2e8f0'}`,
                  background: '#fff',
                  boxShadow: isCover ? '0 0 0 2px #f6ad5566' : 'none',
                }}>

                  {/* Миниатюра — клик = лайтбокс */}
                  <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => setLightboxFileId(file.id)}>
                    <img
                      src={getProjectFileDisplayUrl(file)} alt={file.file_name}
                      style={{ width: '100%', height: '100px', objectFit: 'cover', display: 'block' }}
                    />
                    {/* Иконка категории */}
                    <div style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '3px' }}>
                      {FOLDER_CATEGORIES.find(c => c.id === file.category)?.icon}
                    </div>
                    {/* Бейдж "обложка" */}
                    {isCover && (
                      <div style={{ position: 'absolute', bottom: '4px', left: '4px', background: '#f6ad55', color: '#744210', fontSize: '10px', fontWeight: 'bold', padding: '1px 5px', borderRadius: '3px' }}>
                        okładka
                      </div>
                    )}
                  </div>

                  {/* Комментарий */}
                  <div style={{ padding: '4px 6px', borderTop: `2px solid ${file.uploaded_by_color || '#e2e8f0'}` }}>
                    {editingComment === file.id ? (
                      <input
                        autoFocus
                        value={commentDraft}
                        onChange={e => setCommentDraft(e.target.value)}
                        onBlur={() => saveComment(file)}
                        onKeyDown={e => e.key === 'Enter' && saveComment(file)}
                        style={{ width: '100%', fontSize: '11px', border: 'none', outline: 'none', background: 'transparent', boxSizing: 'border-box' }}
                      />
                    ) : (
                      <div
                        onClick={() => { setEditingComment(file.id); setCommentDraft(file.comment || ''); }}
                        style={{ fontSize: '11px', color: file.comment ? '#2d3748' : '#a0aec0', cursor: 'text', minHeight: '16px' }}
                      >
                        {file.comment || '+ komentarz'}
                      </div>
                    )}
                  </div>

                  {/* ⭐ Кнопка обложки — внизу справа */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSetCover(file); }}
                    disabled={settingCover === file.id}
                    title={isCover ? 'Usuń okładkę' : 'Ustaw jako okładkę projektu'}
                    style={{
                      position: 'absolute', bottom: '28px', right: '4px',
                      background: isCover ? '#f6ad55' : 'rgba(0,0,0,0.45)',
                      border: 'none', borderRadius: '50%',
                      width: '22px', height: '22px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: '12px', lineHeight: 1,
                      transition: 'background 0.15s',
                    }}
                  >
                    {settingCover === file.id ? '⏳' : isCover ? '⭐' : '☆'}
                  </button>

                  {/* ✖ Удаление — вверху справа */}
                  <div style={{ position: 'absolute', top: '4px', right: '4px' }}>
                    {confirmDeleteId === file.id ? (
                      <div style={{ background: 'rgba(0,0,0,0.75)', borderRadius: '4px', padding: '3px 5px', display: 'flex', gap: '3px' }}>
                        <button onClick={() => handleDeleteFile(file)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>Tak</button>
                        <button onClick={() => setConfirmDeleteId(null)} style={{ background: '#e2e8f0', color: '#2d3748', border: 'none', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>Nie</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(file.id)} style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', border: 'none', width: '20px', height: '20px', borderRadius: '50%', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✖</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PDF и другие документы */}
        {docs.length > 0 && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
            {docs.map((file, idx) => (
              <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderBottom: idx < docs.length - 1 ? '1px solid #e2e8f0' : 'none', background: '#fff', borderLeft: `3px solid ${file.uploaded_by_color || '#e2e8f0'}` }}>
                <span style={{ fontSize: '18px', flexShrink: 0 }}>{isPdf(file.file_type) ? '📄' : '📁'}</span>
                <a href={getProjectFileDisplayUrl(file)} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#2b6cb0', fontWeight: 'bold', textDecoration: 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.file_name}>
                  {file.file_name}
                </a>
                {editingComment === file.id ? (
                  <input autoFocus value={commentDraft} onChange={e => setCommentDraft(e.target.value)}
                    onBlur={() => saveComment(file)} onKeyDown={e => e.key === 'Enter' && saveComment(file)}
                    placeholder="Komentarz..."
                    style={{ fontSize: '11px', border: '1px solid #cbd5e0', borderRadius: '4px', padding: '2px 6px', width: '140px' }}
                  />
                ) : (
                  <span onClick={() => { setEditingComment(file.id); setCommentDraft(file.comment || ''); }}
                    style={{ fontSize: '11px', color: file.comment ? '#4a5568' : '#a0aec0', cursor: 'text', minWidth: '60px' }}>
                    {file.comment || '+ komentarz'}
                  </span>
                )}
                <span style={{ fontSize: '10px', color: '#a0aec0', flexShrink: 0 }}>
                  {FOLDER_CATEGORIES.find(c => c.id === file.category)?.icon}
                </span>
                {confirmDeleteId === file.id ? (
                  <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                    <button onClick={() => handleDeleteFile(file)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Tak</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{ background: '#e2e8f0', color: '#2d3748', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Nie</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteId(file.id)}
                    style={{ background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', fontSize: '14px', flexShrink: 0, lineHeight: 1 }}
                    onMouseEnter={e => e.target.style.color='#e53e3e'}
                    onMouseLeave={e => e.target.style.color='#cbd5e0'}>✖</button>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px', color: '#a0aec0', fontSize: '13px', border: '2px dashed #e2e8f0', borderRadius: '8px' }}>
            {isShelf ? 'Brak plików w tym folderze.' : 'Brak plików w tej kategorii.'}
          </div>
        )}
      </>
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

        {loading ? (
          <div className={fs.desktopEmpty}>Ładowanie...</div>
        ) : visible.length === 0 ? (
          <div className={fs.desktopEmpty}>Brak plików w tym folderze.</div>
        ) : (
          <div className={fs.desktopCarousel}>
            {visible.map(file => (
              isImage(file.file_type) ? (
                <img
                  key={file.id}
                  src={getProjectFileDisplayUrl(file)}
                  alt={file.file_name}
                  draggable={false}
                  onClick={() => setLightboxFileId(file.id)}
                  className={fs.desktopCarouselImg}
                  style={coverUrl === file.file_url ? { borderColor: '#f6ad55', borderWidth: '2px' } : undefined}
                />
              ) : (
                <a
                  key={file.id}
                  href={getProjectFileDisplayUrl(file)}
                  target="_blank"
                  rel="noreferrer"
                  title={file.file_name}
                  className={fs.desktopCarouselDoc}
                >
                  <span className={fs.desktopCarouselDocIcon}>{isPdf(file.file_type) ? 'PDF' : 'PLIK'}</span>
                  <span className={fs.desktopCarouselDocName}>{shortenFileName(file.file_name, 18)}</span>
                </a>
              )
            ))}
          </div>
        )}

        <div className={fs.stoRow}>
          <span className={fs.stoLabel}>Plik PRO100 (.sto):</span>
          {loading ? (
            <span className={fs.stoMissing}>Ładowanie...</span>
          ) : stoFile ? (
            <>
              <span className={fs.stoFilename} title={stoFile.file_name}>{stoFile.file_name}</span>
              <button type="button" className={fs.stoDownloadBtn} disabled={downloadingSto || replacingSto} onClick={handleDownloadSto}>
                {downloadingSto ? 'Pobieranie…' : 'Pobierz'}
              </button>
              <button type="button" className={fs.stoReplaceBtn} disabled={replacingSto} onClick={() => stoInputRef.current?.click()}>
                {replacingSto ? 'Wgrywanie…' : 'Zamień'}
              </button>
            </>
          ) : (
            <>
              <span className={fs.stoMissing}>Brak pliku .sto</span>
              <button type="button" className={fs.stoDownloadBtn} disabled={replacingSto} onClick={() => stoInputRef.current?.click()}>
                {replacingSto ? 'Wgrywanie…' : 'Dodaj'}
              </button>
            </>
          )}
          <input ref={stoInputRef} type="file" accept=".sto" hidden onChange={handleStoUpload} />
        </div>
        {stoError && <div className={fs.stoError} role="alert">{stoError}</div>}

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
            <select
              value={activeCategory}
              disabled={uploading}
              onChange={e => {
                setActiveCategory(e.target.value);
                uploadCategoryRef.current = e.target.value; // категория загрузки = выбранная папка
              }}
              aria-label="Folder plików projektu"
              style={{ flex: 1, minWidth: 0, minHeight: '40px', boxSizing: 'border-box', padding: '9px 8px', borderRadius: '8px', border: '1px solid var(--input-border)', fontSize: '13px', background: 'var(--input-bg)', color: 'var(--text-main)' }}
            >
              {FOLDER_CATEGORIES.map(c => {
                const count = files.filter(f => f.category === c.id).length;
                return <option key={c.id} value={c.id}>{c.icon} {c.label} ({count})</option>;
              })}
            </select>
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
            <select
              value={activeCategory}
              disabled={uploading}
              onChange={e => {
                setActiveCategory(e.target.value);
                uploadCategoryRef.current = e.target.value; // категория загрузки = выбранная папка
              }}
              style={{ padding: '3px 5px', borderRadius: '6px', border: '1px solid var(--input-border)', fontSize: '11px', background: 'var(--input-bg)', color: 'var(--text-main)', flexShrink: 1, minWidth: 0 }}
            >
              {FOLDER_CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
              ))}
            </select>
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
        <select
          value={activeCategory}
          disabled={uploading}
          onChange={e => {
            setActiveCategory(e.target.value);
            uploadCategoryRef.current = e.target.value; // ✅ синхронно обновляем ref
          }}
          style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '12px' }}
        >
          {FOLDER_CATEGORIES.map(c => {
            const count = files.filter(f => f.category === c.id).length;
            return <option key={c.id} value={c.id}>{c.icon} {c.label} ({count})</option>;
          })}
        </select>
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
