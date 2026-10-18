import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import WorkspaceSection from './WorkspaceSection';
import { workspaceSectionButtons } from './workspaceSectionButtons';
import s from './ProjectImportantPoints.module.css';

const nextPointId = (points) => {
  const numericIds = points.map(point => Number(point.id)).filter(Number.isFinite);
  return numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1;
};

// layout='workspace' — сворачиваемая секция desktop-рабочей области (как ProjectTasksPanel).
const ProjectImportantPoints = ({ points = [], onChange, currentProfile = null, layout, open = true, onToggle }) => {
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newText, setNewText] = useState('');

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewText('');
  };

  const addPoint = (event) => {
    event.preventDefault();
    const text = newText.trim();
    if (!text) return;
    const id = nextPointId(points);
    onChange([...points, {
      id,
      text,
      createdAt: new Date().toISOString(),
      createdById: currentProfile?.id || null,
      createdByName: currentProfile?.full_name || null,
    }]);
    setExpandedId(id);
    closeAddModal();
  };

  const startEditing = (point) => {
    setEditingId(point.id);
    setExpandedId(point.id);
    setEditText(point.text || '');
    setConfirmDeleteId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveEditing = () => {
    const text = editText.trim();
    if (!text) return;
    onChange(points.map(point => point.id === editingId ? { ...point, text } : point));
    cancelEditing();
  };

  const deletePoint = (pointId) => {
    onChange(points.filter(point => point.id !== pointId));
    setConfirmDeleteId(null);
    setExpandedId(current => current === pointId ? null : current);
    if (editingId === pointId) cancelEditing();
  };

  const addButton = layout === 'workspace' ? (
    <button
      type="button"
      className={workspaceSectionButtons.iconAdd}
      onClick={() => setShowAddModal(true)}
      aria-label="Dodaj ważną informację"
      title="Dodaj ważną informację"
    >
      <Plus size={13} strokeWidth={2.75} aria-hidden="true" />
    </button>
  ) : (
    <button type="button" className={s.addOpenButton} onClick={() => setShowAddModal(true)} aria-label="Dodaj ważną informację">
      <span aria-hidden="true">+</span>
      <span>Dodaj</span>
    </button>
  );

  const content = (
    <>
      {/* Без записей остаётся только шапка с «+ Dodaj» — пустую рамку-заглушку не рисуем. */}
      {points.length > 0 && (
        <div className={s.list}>
          {points.map(point => {
            const expanded = expandedId === point.id;
            const editing = editingId === point.id;
            const confirming = confirmDeleteId === point.id;
            return (
              <div key={point.id} className={[s.row, expanded ? s.rowExpanded : ''].filter(Boolean).join(' ')}>
                <span className={s.marker} aria-hidden="true">!</span>
                {editing ? (
                  <textarea autoFocus className={s.editInput} value={editText} onChange={event => setEditText(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Escape') cancelEditing();
                      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) saveEditing();
                    }}
                    aria-label="Treść ważnej informacji"
                  />
                ) : (
                  <button type="button" className={s.text}
                    onClick={() => setExpandedId(current => current === point.id ? null : point.id)}
                    aria-expanded={expanded} title={point.text}
                  >
                    {point.text}
                  </button>
                )}
                {confirming ? (
                  <div className={s.actions}>
                    <span className={s.confirmLabel}>Usunąć?</span>
                    <button type="button" className={s.confirmYes} onClick={() => deletePoint(point.id)}>Tak</button>
                    <button type="button" className={s.secondaryButton} onClick={() => setConfirmDeleteId(null)}>Nie</button>
                  </div>
                ) : editing ? (
                  <div className={s.actions}>
                    <button type="button" className={s.saveButton} onClick={saveEditing} disabled={!editText.trim()}>Zapisz</button>
                    <button type="button" className={s.secondaryButton} onClick={cancelEditing}>Anuluj</button>
                  </div>
                ) : expanded ? (
                  <div className={s.actions}>
                    <button type="button" className={s.secondaryButton} onClick={() => startEditing(point)}>Edytuj</button>
                    <button type="button" className={s.deleteButton} onClick={() => setConfirmDeleteId(point.id)}>Usuń</button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {showAddModal && createPortal(
        <div className={s.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) closeAddModal(); }}>
          <form className={s.modal} onSubmit={addPoint}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                closeAddModal();
              }
            }}
            role="dialog" aria-modal="true" aria-labelledby="important-point-title"
          >
            <div className={s.modalHeader}>
              <h3 id="important-point-title">Ważna informacja projektu</h3>
              <button type="button" className={s.modalClose} onClick={closeAddModal} aria-label="Zamknij">×</button>
            </div>
            <textarea autoFocus className={s.newInput} value={newText}
              onChange={event => setNewText(event.target.value)}
              placeholder="Np. fronty wymagają dodatkowego pomiaru" aria-label="Nowa ważna informacja"
            />
            <div className={s.modalActions}>
              <button type="button" className={s.modalCancel} onClick={closeAddModal}>Anuluj</button>
              <button type="submit" className={s.modalSave} disabled={!newText.trim()}>Dodaj</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );

  if (layout === 'workspace') {
    return (
      <WorkspaceSection
        title="Informacje"
        meta={points.length}
        actions={addButton}
        open={open}
        onToggle={onToggle}
        flush
      >
        {content}
      </WorkspaceSection>
    );
  }

  return (
    <section className={s.panel} aria-label="Informacje">
      <div className={s.header}>
        <div className={s.heading}>
          <h3>Informacje</h3>
          <span>{points.length}</span>
        </div>
        {addButton}
      </div>
      {content}
    </section>
  );
};

export default ProjectImportantPoints;
