import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';

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

const isImage = (type) => type && type.startsWith('image/');
const isPdf   = (type) => type === 'application/pdf';

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

// variant='tab' — прежний полноразмерный интерфейс вкладки Pliki (mobile Field Mode и
// desktop/embedded modal-fallback без изменений); variant='shelf' — новая компактная полка
// в шапке desktop/embedded (UX-прототип). Один компонент, один files-стейт, один fetch —
// переключается только JSX-вывод, никакого второго монтирования/запроса.
export default function FilesTab({ clientId, currentProfile, coverUrl, onCoverChange, variant = 'tab', initialShelfExpanded = false, expanded: expandedProp, onExpandedChange }) {
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
  const [lightbox,       setLightbox]       = useState(null);
  const [settingCover,   setSettingCover]   = useState(false); // лоадер при выборе обложки
  // Полка Pliki (только variant='shelf'): свёрнута по умолчанию, кроме случая, когда
  // ProjectModal явно просит открыть её развёрнутой (initialTab='files' на desktop/embedded).
  // Может управляться снаружи (expanded/onExpandedChange — ProjectModal меняет layout шапки
  // на полную ширину при развороте) либо оставаться неконтролируемым состоянием самого
  // компонента — оба режима используют один и тот же смонтированный экземпляр FilesTab.
  const isExpandedControlled = expandedProp !== undefined;
  const [internalShelfExpanded, setInternalShelfExpanded] = useState(initialShelfExpanded);
  const shelfExpanded = isExpandedControlled ? expandedProp : internalShelfExpanded;
  const setShelfExpanded = (updater) => {
    const next = typeof updater === 'function' ? updater(shelfExpanded) : updater;
    if (isExpandedControlled) onExpandedChange?.(next);
    else setInternalShelfExpanded(next);
  };
  const fileInputRef = useRef();
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
      if (cancelled) return;
      if (data) setFiles(data);
      setLoading(false);
    }
    loadFiles();
    return () => { cancelled = true; };
  }, [clientId]);

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
      if (row) setFiles(prev => [row, ...prev]);
    }
    setUploading(false);
    fileInputRef.current.value = '';
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
  const visible = files.filter(f => f.category === activeCategory);

  const images = visible.filter(f => isImage(f.file_type));
  const docs   = visible.filter(f => !isImage(f.file_type));

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
                  <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => setLightbox(file.file_url)}>
                    <img
                      src={file.file_url} alt={file.file_name}
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
                <a href={file.file_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#2b6cb0', fontWeight: 'bold', textDecoration: 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.file_name}>
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

  // Лайтбокс с навигацией — общий для обеих вариантов. Навигация Prev/Next — только по
  // изображениям ТЕКУЩЕЙ отфильтрованной категории (visible), а не по всем файлам проекта —
  // иначе, выбрав, например, "⚠ Projekt", можно было бы перелистнуть на файл из Zadanie/Montaż/Inne.
  function renderLightbox() {
    if (!lightbox) return null;
    const allImages = visible.filter(f => isImage(f.file_type));
    const currentIdx = allImages.findIndex(f => f.file_url === lightbox);
    const goPrev = (e) => { e.stopPropagation(); const i = (currentIdx - 1 + allImages.length) % allImages.length; setLightbox(allImages[i].file_url); };
    const goNext = (e) => { e.stopPropagation(); const i = (currentIdx + 1) % allImages.length; setLightbox(allImages[i].file_url); };
    return (
      <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={lightbox} alt="" style={{ maxWidth: '85vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '4px' }} onClick={e => e.stopPropagation()} />
        {/* Закрыть */}
        <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: '16px', right: '20px', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: '22px', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        {/* Счётчик */}
        <div style={{ position: 'absolute', top: '18px', left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: '12px', background: 'rgba(0,0,0,0.5)', padding: '3px 10px', borderRadius: '10px' }}>
          {currentIdx + 1} / {allImages.length}
        </div>
        {/* Навигация */}
        {allImages.length > 1 && (<>
          <button onClick={goPrev} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <button onClick={goNext} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </>)}
        {/* Комментарий */}
        {allImages[currentIdx]?.comment && (
          <div style={{ position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: '13px', background: 'rgba(0,0,0,0.6)', padding: '5px 14px', borderRadius: '8px', maxWidth: '80vw', textAlign: 'center' }}>
            {allImages[currentIdx].comment}
          </div>
        )}
      </div>
    );
  }

  // ======== variant='shelf' — компактная полка Pliki в шапке desktop/embedded ========
  if (isShelf) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
        {/* Компактная строка — всегда видна */}
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

        {/* Горизонтальная лента миниатюр — только в свёрнутом состоянии, свой overflow-x.
            Пока идёт первичная загрузка (loading), пустая папка не утверждается — показываем
            нейтральный индикатор вместо преждевременного "Brak plików". */}
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
                    src={file.file_url}
                    alt={file.file_name}
                    onClick={() => setLightbox(file.file_url)}
                    style={{
                      height: '60px', width: '60px', objectFit: 'cover', borderRadius: '4px',
                      cursor: 'zoom-in', flexShrink: 0,
                      border: coverUrl === file.file_url ? '2px solid #f6ad55' : '1px solid var(--border)',
                    }}
                  />
                ) : (
                  <a
                    key={file.id}
                    href={file.file_url}
                    target="_blank"
                    rel="noreferrer"
                    title={file.file_name}
                    style={{
                      height: '60px', minWidth: '56px', maxWidth: '80px', flexShrink: 0,
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

  // ======== variant='tab' — mobile Field Mode и desktop/embedded modal-fallback. Тот же
  // принцип единого селектора, что и в variant='shelf' (пункт финального ревью: два раздельных
  // набора "видимая папка"/"категория загрузки" с одинаковыми на вид, но разными по сути
  // названиями — недопустимы). Один select одновременно фильтрует видимые файлы и служит
  // категорией загрузки; отдельной строки filter-chips и "Wszystkie" здесь больше нет. ========
  // На узких экранах (320–390px) длинная подпись кнопки не помещается рядом с select (flex:1) —
  // допустимое по заданию сокращение до "+ Dodaj" (без изменения самого select/категорий).
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
