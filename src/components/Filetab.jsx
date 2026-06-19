import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';

const CATEGORIES = [
  { id: 'all',     label: 'Wszystkie', icon: '📁' },
  { id: 'projekt', label: 'Projekt',   icon: '📐' },
  { id: 'usterki', label: 'Usterki',   icon: '⚠️' },
  { id: 'montaz',  label: 'Montaż',    icon: '✅' },
  { id: 'inne',    label: 'Inne',      icon: '📄' },
];

const isImage = (type) => type && type.startsWith('image/');
const isPdf   = (type) => type === 'application/pdf';

export default function FilesTab({ clientId, currentProfile }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [uploadCategory, setUploadCategory] = useState('projekt');
  const [editingComment, setEditingComment] = useState(null); // id файла
  const [commentDraft, setCommentDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [lightbox, setLightbox] = useState(null); // url для полноэкранного просмотра
  const fileInputRef = useRef();

  useEffect(() => {
    fetchFiles();
  }, [clientId]);

  async function fetchFiles() {
    setLoading(true);
    const { data } = await supabase
      .from('project_files')
      .select('*')
      .eq('client_id', clientId)
      .order('uploaded_at', { ascending: false });
    if (data) setFiles(data);
    setLoading(false);
  }

  async function handleUpload(e) {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;
    setUploading(true);

    for (const file of selected) {
      const path = `${clientId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage
        .from('project-files')
        .upload(path, file, { upsert: false });
      if (upErr) { console.error(upErr); continue; }

      const { data: { publicUrl } } = supabase.storage
        .from('project-files')
        .getPublicUrl(path);

      const { data: row } = await supabase.from('project_files').insert([{
        client_id: clientId,
        category: uploadCategory,
        file_name: file.name,
        file_path: path,
        file_url: publicUrl,
        file_type: file.type,
        comment: '',
        uploaded_by: currentProfile?.id || null,
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
    setConfirmDeleteId(null);
  }

  async function saveComment(file) {
    await supabase.from('project_files').update({ comment: commentDraft }).eq('id', file.id);
    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, comment: commentDraft } : f));
    setEditingComment(null);
  }

  const visible = activeCategory === 'all'
    ? files
    : files.filter(f => f.category === activeCategory);

  const images = visible.filter(f => isImage(f.file_type));
  const docs   = visible.filter(f => !isImage(f.file_type));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Тулбар: категория загрузки + кнопка */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={uploadCategory}
          onChange={e => setUploadCategory(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '12px' }}
        >
          {CATEGORIES.filter(c => c.id !== 'all').map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
          ))}
        </select>
        <button
          onClick={() => fileInputRef.current.click()}
          disabled={uploading}
          style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
        >
          {uploading ? '⏳ Wgrywanie...' : '+ Dodaj plik / zdjęcie'}
        </button>
        <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.pms,.pr0" style={{ display: 'none' }} onChange={handleUpload} />
      </div>

      {/* Фильтр-чипсы */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => {
          const count = c.id === 'all' ? files.length : files.filter(f => f.category === c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              style={{
                padding: '4px 10px', borderRadius: '20px', border: '1px solid',
                borderColor: activeCategory === c.id ? '#3182ce' : '#e2e8f0',
                background: activeCategory === c.id ? '#ebf8ff' : '#fff',
                color: activeCategory === c.id ? '#2b6cb0' : '#718096',
                cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
              }}
            >
              {c.icon} {c.label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
            </button>
          );
        })}
      </div>

      {loading && <div style={{ color: '#a0aec0', fontSize: '13px' }}>Ładowanie...</div>}

      {/* ФОТО — компактная сетка */}
      {images.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
          {images.map(file => (
            <div key={file.id} style={{ borderRadius: '6px', overflow: 'hidden', border: `2px solid ${file.uploaded_by_color || '#e2e8f0'}`, background: '#fff', position: 'relative' }}>
              {/* Миниатюра */}
              <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => setLightbox(file.file_url)}>
                <img src={file.file_url} alt={file.file_name}
                  style={{ width: '100%', height: '100px', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '3px' }}>
                  {CATEGORIES.find(c => c.id === file.category)?.icon}
                </div>
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
              {/* Удаление */}
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
          ))}
        </div>
      )}

      {/* PDF и другие документы — компактный список */}
      {docs.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
          {docs.map((file, idx) => (
            <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderBottom: idx < docs.length - 1 ? '1px solid #e2e8f0' : 'none', background: '#fff', borderLeft: `3px solid ${file.uploaded_by_color || '#e2e8f0'}` }}>
              <span style={{ fontSize: '18px', flexShrink: 0 }}>{isPdf(file.file_type) ? '📄' : '📁'}</span>
              <a href={file.file_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#2b6cb0', fontWeight: 'bold', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.file_name}>
                {file.file_name}
              </a>
              {/* Инлайн комментарий */}
              {editingComment === file.id ? (
                <input
                  autoFocus
                  value={commentDraft}
                  onChange={e => setCommentDraft(e.target.value)}
                  onBlur={() => saveComment(file)}
                  onKeyDown={e => e.key === 'Enter' && saveComment(file)}
                  placeholder="Komentarz..."
                  style={{ fontSize: '11px', border: '1px solid #cbd5e0', borderRadius: '4px', padding: '2px 6px', width: '140px' }}
                />
              ) : (
                <span onClick={() => { setEditingComment(file.id); setCommentDraft(file.comment || ''); }} style={{ fontSize: '11px', color: file.comment ? '#4a5568' : '#a0aec0', cursor: 'text', minWidth: '60px' }}>
                  {file.comment || '+ komentarz'}
                </span>
              )}
              <span style={{ fontSize: '10px', color: '#a0aec0', flexShrink: 0 }}>
                {CATEGORIES.find(c => c.id === file.category)?.icon}
              </span>
              {/* Удаление */}
              {confirmDeleteId === file.id ? (
                <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                  <button onClick={() => handleDeleteFile(file)} style={{ background: '#e53e3e', color: '#fff', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Tak</button>
                  <button onClick={() => setConfirmDeleteId(null)} style={{ background: '#e2e8f0', color: '#2d3748', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Nie</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteId(file.id)} style={{ background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', fontSize: '14px', flexShrink: 0, lineHeight: 1 }} onMouseEnter={e => e.target.style.color='#e53e3e'} onMouseLeave={e => e.target.style.color='#cbd5e0'}>✖</button>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px', color: '#a0aec0', fontSize: '13px', border: '2px dashed #e2e8f0', borderRadius: '8px' }}>
          Brak plików w tej kategorii.<br />Kliknij "+ Dodaj plik / zdjęcie" powyżej.
        </div>
      )}

      {/* Лайтбокс для полноэкранного просмотра фото */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: '4px' }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: '16px', right: '20px', background: 'none', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer' }}>✖</button>
        </div>
      )}
    </div>
  );
}
