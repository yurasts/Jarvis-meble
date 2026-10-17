import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Ellipsis,
  Folder,
  FolderOpen,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { groupByClient } from './dashboardHelpers';
import { PROJECT_FILE_CATEGORIES } from '../utils/projectFileCategories';
import { PROJECT_LIFECYCLE, PROJECT_LIFECYCLE_ACTION_LABELS } from '../utils/projectLifecycle';
import { COMPLETED_STATUSES, resolveDisplayStatus, statusColorVar } from '../utils/projectStatuses';
import s from './ProjectListPanel.module.css';

// Цвета статусов — CSS-переменные из src/index.css через utils/projectStatuses.js (тот же набор,
// что в «Legenda statusów projektów»). Устаревшие «завершённые» значения ('Zrealizowane',
// 'Zakończone') — COMPLETED_STATUSES оттуда же.

function ProjectRow({ client, onRowClick, isActive, mobileLayout }) {
  const projectName = client.project_name || client.full_name || '—';
  const openTasks = (client.tasks || []).filter((t) => !t.isDone).length;

  if (mobileLayout) {
    // Mobile Project List v1: та же логика открытия/подсветки, что и в desktop-строке ниже, но
    // COMPLETED_STATUSES здесь трактуется явно (в отличие от desktop-фолбэка ниже, который для
    // устаревших "завершённых" значений вроде 'Zrealizowane' попадает в STATUS_COLOR.new/красный) —
    // требование "status dot зелёный" для завершённых проектов на mobile обязано выполняться для
    // ЛЮБОГО значения из COMPLETED_STATUSES, не только 'done'. Desktop-ветка ниже не тронута.
    const mobileColor = statusColorVar(resolveDisplayStatus(client.status));
    return (
      <div
        className={`${s.mobileRow} ${isActive ? s.mobileRowActive : ''}`}
        role="button"
        tabIndex={0}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => onRowClick(client)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(client); }
        }}
      >
        <span className={s.mobileRowName}>{projectName}</span>
        {openTasks > 0 && <span className={s.mobileRowTasks}>{openTasks}</span>}
        <span className={s.mobileStatusDot} style={{ background: mobileColor }} />
      </div>
    );
  }

  const color = statusColorVar(client.status);

  return (
    <div
      className={`${s.row} ${isActive ? s.rowActive : ''}`}
      role="button"
      tabIndex={0}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onRowClick(client)}
      onKeyDown={(e) => { if (e.key === 'Enter') onRowClick(client); }}
    >
      <div className={s.rowText}>
        <div className={s.rowProject}>{projectName}</div>
      </div>
      <div className={s.rowMeta}>
        {openTasks > 0 && <span className={s.rowTasks}>{openTasks}</span>}
      </div>
      <span className={s.statusDot} style={{ background: color }} />
    </div>
  );
}

const clientGroupKey = (client) => client?.client_name || client?.full_name || '—';
const sectionGroupKey = (section, clientName) => (section ? `${section}::${clientName}` : clientName);
const NO_PROJECTS = Object.freeze([]);

// Desktop sidebar 2026-10: подменю папок файлов под активным проектом. Выбор папки и "+"
// уходят в App → ProjectModal → FilesTab; сам FilesTab справа больше не рисует эти кнопки.
function ProjectFileFolders({ activeCategory, onSelectCategory, onUploadFile, uploading }) {
  return (
    <div className={s.folderList} role="group" aria-label="Foldery plików projektu">
      {PROJECT_FILE_CATEGORIES.map((category) => {
        const isActive = category.id === activeCategory;
        const Icon = isActive ? FolderOpen : Folder;
        return (
          <button
            key={category.id}
            type="button"
            className={`${s.folderBtn} ${isActive ? s.folderBtnActive : ''}`}
            aria-pressed={isActive}
            disabled={uploading}
            onClick={() => onSelectCategory(category.id)}
          >
            <Icon size={13} strokeWidth={2} aria-hidden="true" />
            <span>{category.label}</span>
          </button>
        );
      })}
      {onUploadFile && (
        <button
          type="button"
          className={s.folderUploadBtn}
          disabled={uploading}
          onClick={onUploadFile}
          aria-label="Dodaj plik lub zdjęcie do wybranego folderu"
          title="Dodaj plik lub zdjęcie do wybranego folderu"
        >
          <Plus size={13} strokeWidth={2.5} aria-hidden="true" />
          <span>{uploading ? 'Wysyłanie…' : 'Dodaj plik'}</span>
        </button>
      )}
    </div>
  );
}

// Меню «⋯» строки дерева (W archiwum / Do kosza / Przywróć / Usuń trwale). Список рендерится
// в портал с position: fixed — иначе его обрезал бы прокручиваемый список проектов.
// label — доступное имя кнопки, menuLabel — имя самого меню (по умолчанию то же).
function RowMenu({ label, menuLabel = label, actions }) {
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const open = position !== null;

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setPosition(null);
    const handlePointer = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      close();
    };
    const handleKey = (event) => {
      if (event.key !== 'Escape') return;
      close();
      buttonRef.current?.focus();
    };
    const handleScroll = (event) => {
      if (!menuRef.current?.contains(event.target)) close();
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', close);
    menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (actions.length === 0) return null;

  const toggle = (event) => {
    event.stopPropagation();
    if (open) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${s.rowMenuBtn} ${open ? s.rowMenuBtnOpen : ''}`}
        aria-label={label}
        title="Więcej działań"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <Ellipsis size={14} strokeWidth={2.25} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div ref={menuRef} role="menu" aria-label={menuLabel} className={s.rowMenu} style={position}>
          {actions.map(({ id, label: actionLabel, Icon, onSelect, disabled, title, danger }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className={`${s.rowMenuItem} ${danger ? s.rowMenuItemDanger : ''}`}
              disabled={disabled}
              title={title}
              onClick={() => {
                setPosition(null);
                onSelect();
              }}
            >
              <Icon size={13} strokeWidth={2} aria-hidden="true" />
              <span>{actionLabel}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

const PURGE_FORBIDDEN_TITLE = 'Trwale usuwać projekty może tylko właściciel (owner).';

// Проект в корзине не открывается: его можно только восстановить или (owner) удалить навсегда.
function TrashProjectRow({ client, canRestore, canPurge, busy, onRestore, onPurge }) {
  const projectName = client.project_name || client.full_name || '—';
  return (
    <div className={s.treeItem}>
      <div className={`${s.treeRow} ${s.trashRow}`}>
        <span className={s.treeRowName} title={projectName}>{projectName}</span>
        {(canRestore || onPurge) && (
          <div className={s.trashActions}>
            {canRestore && (
              <button
                type="button"
                className={s.trashActionBtn}
                disabled={busy}
                onClick={() => onRestore([client])}
                aria-label={`Przywróć: ${projectName}`}
                title="Przywróć do aktywnych projektów"
              >
                <RotateCcw size={12} strokeWidth={2.25} aria-hidden="true" />
                <span>Przywróć</span>
              </button>
            )}
            {onPurge && (
              <button
                type="button"
                className={`${s.trashActionBtn} ${s.trashActionDanger}`}
                disabled={busy || !canPurge}
                onClick={() => onPurge([client])}
                aria-label={`Usuń trwale: ${projectName}`}
                title={canPurge ? 'Usuń projekt trwale (bez możliwości przywrócenia)' : PURGE_FORBIDDEN_TITLE}
              >
                <Trash2 size={12} strokeWidth={2.25} aria-hidden="true" />
                <span>Usuń trwale</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TreeProjectRow({ client, onRowClick, isActive, folders, menuActions = [] }) {
  const projectName = client.project_name || client.full_name || '—';
  const openTasks = (client.tasks || []).filter((t) => !t.isDone).length;
  const color = statusColorVar(client.status);
  const hasMenu = menuActions.length > 0;

  return (
    <div className={`${s.treeItem} ${hasMenu ? s.treeItemWithMenu : ''}`}>
      <div
        className={`${s.treeRow} ${isActive ? s.treeRowActive : ''}`}
        role="button"
        tabIndex={0}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => onRowClick(client)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(client); }
        }}
      >
        <span className={s.treeRowName}>{projectName}</span>
        {openTasks > 0 && <span className={s.rowTasks} title="Zadania do wykonania">{openTasks}</span>}
        <span className={s.statusDot} style={{ background: color }} aria-hidden="true" />
      </div>
      {hasMenu && (
        <div className={s.treeRowMenu}>
          {/* Имя кнопки без названия проекта — иначе поиск строки проекта по имени
              (getByRole('button', { name: /Kuchnia/ })) находил бы две кнопки. */}
          <RowMenu label="Więcej działań" menuLabel={`Działania: ${projectName}`} actions={menuActions} />
        </div>
      )}
      {folders}
    </div>
  );
}

// Desktop-дерево «клиент → проекты»: по умолчанию видны только клиенты, проекты раскрываются
// кликом по строке клиента (аккордеон). Справа на строке клиента — карандаш (окно «Klient i
// projekt») и Bilans.
//
// section: null — активные/завершённые проекты; 'archived' / 'trash' — системные папки.
// Ключи раскрытых групп в папках имеют префикс секции, чтобы клиент в «Archiwum» раскрывался
// независимо от того же клиента в основном списке.
function TreeClientGroups({
  projects,
  section = null,
  onRowClick,
  activeProjectId,
  isGroupOpen,
  onToggleGroup,
  onOpenBalance,
  onEditClient,
  renderFolders,
  clientMenuActions,
  projectMenuActions,
  trashRowProps,
}) {
  return groupByClient(projects).map(([clientName, group]) => {
    const groupKey = sectionGroupKey(section, clientName);
    const open = isGroupOpen(groupKey);
    const containsActive = group.some((c) => c.id === activeProjectId);
    const listId = `project-tree-${section ? `${section}-` : ''}${encodeURIComponent(clientName)}`;
    const clientActions = clientMenuActions?.(group) || [];
    return (
      <div key={clientName} className={s.treeGroup}>
        <div className={`${s.treeClient} ${containsActive ? s.treeClientCurrent : ''}`}>
          <button
            type="button"
            className={s.treeClientToggle}
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            onClick={() => onToggleGroup(groupKey)}
            title={clientName}
          >
            <ChevronRight
              size={14}
              strokeWidth={2.5}
              className={`${s.treeChevron} ${open ? s.treeChevronOpen : ''}`}
              aria-hidden="true"
            />
            <span className={s.treeClientName}>{clientName}</span>
          </button>
          {onEditClient && (
            <button
              type="button"
              className={s.treeIconBtn}
              onClick={(e) => { e.stopPropagation(); onEditClient(clientName, group); }}
              aria-label={`Edytuj dane: ${clientName}`}
              title="Edytuj dane klienta i projektu"
            >
              <Pencil size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          {onOpenBalance && (
            <button
              type="button"
              className={s.desktopBalanceBtn}
              onClick={(e) => { e.stopPropagation(); onOpenBalance(clientName); }}
            >
              Bilans
            </button>
          )}
          {clientActions.length > 0 && (
            <RowMenu label={`Działania: ${clientName}`} actions={clientActions} />
          )}
        </div>
        {open && (
          <div id={listId} className={s.treeChildren}>
            {group.map((c) => {
              if (trashRowProps) return <TrashProjectRow key={c.id} client={c} {...trashRowProps} />;
              const isActive = c.id === activeProjectId;
              return (
                <TreeProjectRow
                  key={c.id}
                  client={c}
                  onRowClick={onRowClick}
                  isActive={isActive}
                  folders={isActive ? renderFolders?.() : null}
                  menuActions={projectMenuActions?.([c]) || []}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  });
}

// Постоянная системная папка под «Zakończone» (Archiwum / Kosz). Счётчик учитывает поиск и
// выбранную группу (Firma / Moje), как и основной список.
function SystemFolder({ id, label, Icon, count, open, onToggle, emptyText, children }) {
  return (
    <div className={s.systemFolder}>
      <button
        type="button"
        className={s.systemFolderToggle}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
      >
        <ChevronRight
          size={12}
          strokeWidth={2.5}
          className={`${s.treeChevron} ${open ? s.treeChevronOpen : ''}`}
          aria-hidden="true"
        />
        <Icon size={13} strokeWidth={2} aria-hidden="true" />
        <span className={s.systemFolderLabel}>{label}</span>
        <span className={s.systemFolderCount}>{count}</span>
      </button>
      {open && (
        <div id={id} className={`${s.systemFolderList} ${s.treeList}`}>
          {count === 0 ? <div className={s.empty}>{emptyText}</div> : children}
        </div>
      )}
    </div>
  );
}

// Группы «клиент → проекты» — временное представление поверх текущих данных clients
// (тот же group-by, что уже используется в Dashboard.jsx через dashboardHelpers.groupByClient).
// Никакой новой сущности «клиент» не создаётся.
function ClientGroups({ projects, onRowClick, activeProjectId, mobileLayout, onOpenBalance }) {
  return groupByClient(projects).map(([clientName, group]) => (
    <div key={clientName} className={mobileLayout ? s.mobileClientGroup : s.clientGroup}>
      {mobileLayout ? (
        <div className={s.mobileClientGroupHeader}>
          <span className={s.mobileClientGroupName}>{clientName}</span>
          {onOpenBalance && (
            <button
              type="button"
              className={s.mobileBalanceBtn}
              onClick={(e) => { e.stopPropagation(); onOpenBalance(clientName); }}
            >
              Bilans
            </button>
          )}
        </div>
      ) : (
        <div className={s.clientGroupHeaderRow}>
          <div className={s.clientGroupHeader}>{clientName}</div>
          {onOpenBalance && (
            <button
              type="button"
              className={s.desktopBalanceBtn}
              onClick={(e) => { e.stopPropagation(); onOpenBalance(clientName); }}
            >
              Bilans
            </button>
          )}
        </div>
      )}
      {group.map((c) => (
        <ProjectRow key={c.id} client={c} onRowClick={onRowClick} isActive={c.id === activeProjectId} mobileLayout={mobileLayout} />
      ))}
    </div>
  ));
}

export default function ProjectListPanel({
  clients = [],
  scopeView,
  canCreate,
  onNewProject,
  onOpenProject,
  activeProjectId,
  // Доп. отступ снизу у списка — нужен только для мобильного экрана Projekty (ADR-003),
  // где список перекрывался бы закреплённой нижней навигацией. На desktop/в мобильном
  // dropdown (существующие вызовы) не передаётся — поведение там не меняется.
  extraBottomPadding = false,
  // Mobile Project List v1 — явный вариант разметки только для полноэкранного мобильного
  // экрана Projekty (MobileProjectsScreen). Desktop (ProjectNav) и мобильный dropdown
  // (App.jsx) продолжают вызывать компонент без этого пропа — их разметка не затронута.
  mobileLayout = false,
  // Mobile / Client Balance / Expanded v1 — кнопка "Bilans" в заголовке группы клиента (только
  // mobileLayout). Не передаётся desktop (ProjectNav) и мобильным dropdown — там кнопки нет.
  onOpenBalance,
  onOpenLibrary,
  libraryActive = false,
  // Desktop sidebar (ProjectNav) 2026-10: дерево-аккордеон клиентов, карандаш редактирования и
  // папки файлов под активным проектом. Мобильный dropdown и mobileLayout его не используют.
  treeLayout = false,
  onEditClient,
  workspaceOpen = false,
  activeFileCategory,
  onSelectFileCategory,
  onUploadFile,
  filesUploading = false,
  // Системные папки «Archiwum» и «Kosz» (только treeLayout). `clients` — только активные
  // проекты; архив и корзину App передаёт отдельно (utils/projectLifecycle.js).
  archivedClients = NO_PROJECTS,
  trashClients = NO_PROJECTS,
  canManageLifecycle = false,
  canPurge = false,
  lifecycleBusy = false,
  onChangeLifecycle,
  onPurgeProjects,
}) {
  const [searchText, setSearchText] = useState('');
  const [completedOpen, setCompletedOpen] = useState(false);
  // Открытый архивный проект при монтировании — папка «Archiwum» сразу раскрыта.
  const [archiveOpen, setArchiveOpen] = useState(() => activeProjectId != null
    && !clients.some((c) => c.id === activeProjectId)
    && archivedClients.some((c) => c.id === activeProjectId));
  const [trashOpen, setTrashOpen] = useState(false);

  const handleOpen = (client) => {
    onOpenProject(client);
  };

  // Аккордеон (treeLayout): по умолчанию все клиенты свёрнуты. Группа активного проекта
  // раскрывается автоматически, когда проект открывают (из дерева, доски, поиска) — в том
  // числе внутри папки «Archiwum», если открыт архивный проект.
  const activeListProject = clients.find((c) => c.id === activeProjectId) || null;
  const activeArchivedProject = activeListProject
    ? null
    : archivedClients.find((c) => c.id === activeProjectId) || null;
  const activeProject = activeListProject || activeArchivedProject;
  const activeGroupKey = activeProject
    ? sectionGroupKey(activeArchivedProject ? PROJECT_LIFECYCLE.ARCHIVED : null, clientGroupKey(activeProject))
    : null;
  const [openGroups, setOpenGroups] = useState(() => new Set(activeGroupKey ? [activeGroupKey] : []));
  const [revealedProjectId, setRevealedProjectId] = useState(activeProjectId ?? null);
  // Пока идёт поиск, совпавшие группы показаны раскрытыми; здесь — те, что пользователь
  // свернул вручную во время текущего поиска.
  const [searchClosedGroups, setSearchClosedGroups] = useState(() => new Set());

  if ((activeProjectId ?? null) !== revealedProjectId) {
    setRevealedProjectId(activeProjectId ?? null);
    if (treeLayout && activeGroupKey) {
      if (!openGroups.has(activeGroupKey)) setOpenGroups(new Set(openGroups).add(activeGroupKey));
      if (activeArchivedProject) setArchiveOpen(true);
      else if (COMPLETED_STATUSES.has(activeProject.status)) setCompletedOpen(true);
    }
  }

  // Только что созданный проект (появился в clients после первой загрузки) — раскрываем его
  // группу, чтобы новый проект сразу был виден в дереве.
  const [seenClients, setSeenClients] = useState(clients);
  if (clients !== seenClients) {
    setSeenClients(clients);
    if (treeLayout && seenClients.length > 0) {
      const seenIds = new Set(seenClients.map((c) => c.id));
      const addedKeys = clients.filter((c) => !seenIds.has(c.id)).map(clientGroupKey);
      if (addedKeys.some((key) => !openGroups.has(key))) setOpenGroups(new Set([...openGroups, ...addedKeys]));
    }
  }

  const isSearching = searchText.trim().length > 0;
  const isGroupOpen = (key) => (isSearching ? !searchClosedGroups.has(key) : openGroups.has(key));
  const toggleGroup = (key) => {
    const toggle = (current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    };
    if (isSearching) setSearchClosedGroups(toggle);
    else setOpenGroups(toggle);
  };
  const handleSearchChange = (value) => {
    setSearchText(value);
    setSearchClosedGroups(new Set());
  };

  const renderFolders = workspaceOpen && onSelectFileCategory
    ? () => (
      <ProjectFileFolders
        activeCategory={activeFileCategory}
        onSelectCategory={onSelectFileCategory}
        onUploadFile={onUploadFile}
        uploading={filesUploading}
      />
    )
    : null;

  // Действия меню «⋯». Для клиента действие применяется ко всем его проектам в этом разделе.
  const lifecycleAction = (target, projects) => ({
    id: target,
    label: PROJECT_LIFECYCLE_ACTION_LABELS[target],
    Icon: target === PROJECT_LIFECYCLE.ARCHIVED
      ? Archive
      : target === PROJECT_LIFECYCLE.TRASH ? Trash2 : ArchiveRestore,
    disabled: lifecycleBusy,
    onSelect: () => onChangeLifecycle(projects, target),
  });
  const lifecycleEnabled = treeLayout && canManageLifecycle && !!onChangeLifecycle;
  const activeMenuActions = lifecycleEnabled
    ? (projects) => [
      lifecycleAction(PROJECT_LIFECYCLE.ARCHIVED, projects),
      lifecycleAction(PROJECT_LIFECYCLE.TRASH, projects),
    ]
    : null;
  const archivedMenuActions = lifecycleEnabled
    ? (projects) => [
      lifecycleAction(PROJECT_LIFECYCLE.ACTIVE, projects),
      lifecycleAction(PROJECT_LIFECYCLE.TRASH, projects),
    ]
    : null;
  // «Usuń trwale» показываем всем, кто управляет корзиной, но активна кнопка только у owner;
  // окончательная проверка — RLS-политика clients_delete_owner_trash_only.
  const purgeHandler = lifecycleEnabled && onPurgeProjects ? onPurgeProjects : null;
  const trashClientMenuActions = lifecycleEnabled
    ? (projects) => [
      { ...lifecycleAction(PROJECT_LIFECYCLE.ACTIVE, projects), Icon: RotateCcw },
      ...(purgeHandler ? [{
        id: 'purge',
        label: 'Usuń trwale',
        Icon: Trash2,
        danger: true,
        disabled: lifecycleBusy || !canPurge,
        title: canPurge ? undefined : PURGE_FORBIDDEN_TITLE,
        onSelect: () => purgeHandler(projects),
      }] : []),
    ]
    : null;
  const trashRowProps = {
    canRestore: lifecycleEnabled,
    canPurge,
    busy: lifecycleBusy,
    onRestore: (projects) => onChangeLifecycle(projects, PROJECT_LIFECYCLE.ACTIVE),
    onPurge: purgeHandler,
  };

  const renderGroups = (projects, section = null) => (treeLayout ? (
    <TreeClientGroups
      projects={projects}
      section={section}
      onRowClick={handleOpen}
      activeProjectId={activeProjectId}
      isGroupOpen={isGroupOpen}
      onToggleGroup={toggleGroup}
      onOpenBalance={section === PROJECT_LIFECYCLE.TRASH ? undefined : onOpenBalance}
      onEditClient={section ? undefined : onEditClient}
      renderFolders={section === PROJECT_LIFECYCLE.TRASH ? null : renderFolders}
      clientMenuActions={section === PROJECT_LIFECYCLE.TRASH
        ? trashClientMenuActions
        : section === PROJECT_LIFECYCLE.ARCHIVED ? archivedMenuActions : activeMenuActions}
      projectMenuActions={section === PROJECT_LIFECYCLE.ARCHIVED ? archivedMenuActions : activeMenuActions}
      trashRowProps={section === PROJECT_LIFECYCLE.TRASH ? trashRowProps : null}
    />
  ) : (
    <ClientGroups projects={projects} onRowClick={handleOpen} activeProjectId={activeProjectId} onOpenBalance={onOpenBalance} />
  ));

  // Защитный fallback: если обёртка не передала вычисленную группу, показываем GGS.
  const effectiveScope = scopeView || 'firma';

  const { active, completed, archived, trashed } = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const visible = (list) => list.filter((c) => {
      if ((c.project_scope || 'firma') !== effectiveScope) return false;
      if (!q) return true;
      const project = (c.project_name || '').toLowerCase();
      const client = (c.client_name || c.full_name || '').toLowerCase();
      return project.includes(q) || client.includes(q);
    });
    const matched = visible(clients);

    return {
      // Выбор проекта меняет только подсветку и рабочую область. Исходный порядок clients
      // сохраняется: строка не перескакивает вверх ни на desktop, ни на mobile.
      active: matched.filter((c) => !COMPLETED_STATUSES.has(c.status)),
      completed: matched.filter((c) => COMPLETED_STATUSES.has(c.status)),
      archived: visible(archivedClients),
      trashed: visible(trashClients),
    };
  }, [clients, archivedClients, trashClients, effectiveScope, searchText]);

  // Mobile Project List v1 (ADR-003) — отдельная, явная ветка разметки только для полноэкранного
  // мобильного экрана Projekty. Ниже, после этого блока, идёт ПОЛНОСТЬЮ НЕТРОНУТАЯ разметка для
  // desktop (ProjectNav) и мобильного dropdown (App.jsx) — эта ветка её не переиспользует и не
  // затрагивает, чтобы гарантированно не менять их визуально/функционально.
  if (mobileLayout) {
    // Отдельный корень (не s.panel — у него общий padding:12px, из-за которого App Bar не был бы
    // полноширинным): mobileAppBar сам управляет своим горизонтальным padding (16px) и border-bottom
    // на всю ширину экрана; поиск и список — во вложенной mobileBody со своим padding (12px).
    return (
      <div className={s.mobileRoot}>
        <div className={s.mobileAppBar}>
          <span className={s.mobileTitle}>Projekty</span>
          {canCreate && (
            <button type="button" className={s.mobileAddBtn} onClick={onNewProject}>
              + Nowy
            </button>
          )}
        </div>

        <div className={s.mobileBody}>
          <input
            type="text"
            className={s.search}
            placeholder="Szukaj projektu…"
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Szukaj projektu"
          />

          <div className={`${s.list} ${s.listExtraBottom}`}>
            {active.length === 0 && completed.length === 0 && <div className={s.empty}>Brak projektów.</div>}
            <ClientGroups projects={active} onRowClick={handleOpen} activeProjectId={activeProjectId} mobileLayout onOpenBalance={onOpenBalance} />
            <ClientGroups projects={completed} onRowClick={handleOpen} activeProjectId={activeProjectId} mobileLayout onOpenBalance={onOpenBalance} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.panel}>
      <div className={s.header}>
        <span className={s.title}>Projekty</span>
        {canCreate && (
          <button
            type="button"
            className={s.addBtn}
            onClick={onNewProject}
            aria-label="Dodaj projekt"
            title="Dodaj projekt"
          >
            +
          </button>
        )}
      </div>

      <input
        type="text"
        className={s.search}
        placeholder="Szukaj projektu…"
        value={searchText}
        onChange={(e) => handleSearchChange(e.target.value)}
        aria-label="Szukaj projektu"
      />

      <div className={`${s.list} ${treeLayout ? s.treeList : ''} ${extraBottomPadding ? s.listExtraBottom : ''}`}>
        {active.length === 0 && <div className={s.empty}>Brak projektów.</div>}
        {renderGroups(active)}
      </div>

      {completed.length > 0 && (
        <div className={s.completedSection}>
          <button
            type="button"
            className={s.completedToggle}
            onClick={() => setCompletedOpen((v) => !v)}
            aria-expanded={completedOpen}
          >
            {completedOpen ? '▾' : '▸'} Zakończone ({completed.length})
          </button>
          {completedOpen && (
            <div className={`${s.completedList} ${treeLayout ? s.treeList : ''}`}>
              {renderGroups(completed)}
            </div>
          )}
        </div>
      )}

      {treeLayout && (
        <div className={s.systemFolders} role="group" aria-label="Foldery systemowe">
          <SystemFolder
            id="project-folder-archive"
            label="Archiwum"
            Icon={Archive}
            count={archived.length}
            open={archiveOpen}
            onToggle={() => setArchiveOpen((v) => !v)}
            emptyText="Brak projektów w archiwum."
          >
            {renderGroups(archived, PROJECT_LIFECYCLE.ARCHIVED)}
          </SystemFolder>
          <SystemFolder
            id="project-folder-trash"
            label="Kosz"
            Icon={Trash2}
            count={trashed.length}
            open={trashOpen}
            onToggle={() => setTrashOpen((v) => !v)}
            emptyText="Kosz jest pusty."
          >
            {renderGroups(trashed, PROJECT_LIFECYCLE.TRASH)}
          </SystemFolder>
        </div>
      )}

      {onOpenLibrary && (
        <div className={s.librarySection}>
          <button
            type="button"
            className={`${s.libraryButton} ${libraryActive ? s.libraryButtonActive : ''}`}
            onClick={onOpenLibrary}
            aria-current={libraryActive ? 'page' : undefined}
          >
            Biblioteka
          </button>
        </div>
      )}
    </div>
  );
}
