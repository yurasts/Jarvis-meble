import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProjectListPanel from './ProjectListPanel';

const project = (id, clientName, projectName, extra = {}) => ({
  id,
  client_name: clientName,
  project_name: projectName,
  status: 'new',
  project_scope: 'firma',
  tasks: [],
  ...extra,
});

const clients = [
  project(1, 'NEW_Szafa', 'fuha1'),
  project(2, 'CZERNIECHOWKA', 'Kuchnia'),
  project(3, 'CZERNIECHOWKA', 'Przedpokój'),
  project(4, 'YURA', 'Wzurniki'),
];

const renderPanel = (props = {}) => {
  const handlers = {
    onOpenProject: vi.fn(),
    onOpenBalance: vi.fn(),
    onEditClient: vi.fn(),
    onSelectFileCategory: vi.fn(),
    onUploadFile: vi.fn(),
  };
  const rendered = render(
    <ProjectListPanel
      clients={clients}
      scopeView="firma"
      canCreate
      onNewProject={vi.fn()}
      treeLayout
      activeFileCategory="usterki"
      {...handlers}
      {...props}
    />,
  );
  return { ...rendered, handlers };
};

describe('ProjectListPanel tree layout', () => {
  it('shows only collapsed client rows by default', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: /^CZERNIECHOWKA/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Kuchnia')).not.toBeInTheDocument();
    expect(screen.queryByText('fuha1')).not.toBeInTheDocument();
  });

  it('toggles a client accordion and opens a project', async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel();

    await user.click(screen.getByRole('button', { name: /^CZERNIECHOWKA/ }));
    expect(screen.getByRole('button', { name: /^CZERNIECHOWKA/ })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Przedpokój' }));
    expect(handlers.onOpenProject).toHaveBeenCalledWith(clients[2]);

    await user.click(screen.getByRole('button', { name: /^CZERNIECHOWKA/ }));
    expect(screen.queryByText('Przedpokój')).not.toBeInTheDocument();
  });

  it('expands the active project group and shows its file folders in order', async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ activeProjectId: 1, workspaceOpen: true });

    expect(screen.getByRole('button', { name: 'fuha1' })).toHaveAttribute('aria-current', 'page');
    const folders = screen.getByRole('group', { name: 'Foldery plików projektu' });
    expect(within(folders).getAllByRole('button').map(button => button.textContent)).toEqual([
      'Projekt', 'Zadanie', 'Krój', 'Montaż', 'Dodaj plik',
    ]);
    expect(within(folders).getByRole('button', { name: 'Projekt' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(folders).getByRole('button', { name: 'Krój' }));
    expect(handlers.onSelectFileCategory).toHaveBeenCalledWith('inne');
    await user.click(within(folders).getByRole('button', { name: /Dodaj plik/ }));
    expect(handlers.onUploadFile).toHaveBeenCalledOnce();
  });

  it('hides file folders when the project workspace is not shown', () => {
    renderPanel({ activeProjectId: 1, workspaceOpen: false });

    expect(screen.getByRole('button', { name: 'fuha1' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Foldery plików projektu' })).not.toBeInTheDocument();
  });

  it('opens client editing and balance without toggling the group', async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Edytuj dane: YURA' }));
    expect(handlers.onEditClient).toHaveBeenCalledWith('YURA', [clients[3]]);

    const yuraRow = screen.getByRole('button', { name: /^YURA/ }).parentElement;
    await user.click(within(yuraRow).getByRole('button', { name: 'Bilans' }));
    expect(handlers.onOpenBalance).toHaveBeenCalledWith('YURA');
    expect(screen.getByRole('button', { name: /^YURA/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands matching groups while searching', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('Szukaj projektu'), 'kuch');
    expect(screen.getByRole('button', { name: 'Kuchnia' })).toBeInTheDocument();
    expect(screen.queryByText('fuha1')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Szukaj projektu'));
    expect(screen.queryByText('Kuchnia')).not.toBeInTheDocument();
  });
});

describe('ProjectListPanel new projects', () => {
  it('expands the client group of a newly created project', () => {
    const { rerender } = renderPanel();
    expect(screen.queryByText('Garderoba')).not.toBeInTheDocument();

    const nextClients = [...clients, project(5, 'Jan Nowak', 'Garderoba')];
    rerender(
      <ProjectListPanel
        clients={nextClients}
        scopeView="firma"
        canCreate
        onNewProject={vi.fn()}
        onOpenProject={vi.fn()}
        treeLayout
      />,
    );

    expect(screen.getByRole('button', { name: 'Garderoba' })).toBeInTheDocument();
    expect(screen.queryByText('fuha1')).not.toBeInTheDocument();
  });
});

describe('ProjectListPanel without tree layout', () => {
  it('keeps the flat list for the mobile dropdown', () => {
    renderPanel({ treeLayout: false });

    expect(screen.getByText('Kuchnia')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edytuj dane/ })).not.toBeInTheDocument();
  });
});

describe('ProjectListPanel Archiwum and Kosz', () => {
  const archived = [
    project(20, 'ARCHIWALNY', 'Szafa 2024', { lifecycle_status: 'archived' }),
    project(21, 'YURA', 'Stara komoda', { lifecycle_status: 'archived' }),
  ];
  const trashed = [
    project(22, 'KOSZOWY', 'Regał', { lifecycle_status: 'trash' }),
    project(23, 'KOSZOWY', 'Biurko', { lifecycle_status: 'trash' }),
  ];
  const renderFolders = (props = {}) => renderPanel({
    archivedClients: archived,
    trashClients: trashed,
    canManageLifecycle: true,
    onChangeLifecycle: vi.fn(),
    onPurgeProjects: vi.fn(),
    ...props,
  });

  it('shows collapsed Archiwum and Kosz folders with counts and keeps their projects out of the tree', () => {
    renderFolders();

    const folders = screen.getByRole('group', { name: 'Foldery systemowe' });
    expect(within(folders).getAllByRole('button').map(button => button.textContent)).toEqual(['Archiwum2', 'Kosz2']);
    expect(within(folders).getByRole('button', { name: /^Archiwum/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Szafa 2024')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^KOSZOWY/ })).not.toBeInTheDocument();
  });

  it('expands Archiwum and opens an archived project', async () => {
    const user = userEvent.setup();
    const { handlers } = renderFolders();

    await user.click(screen.getByRole('button', { name: /^Archiwum/ }));
    await user.click(screen.getByRole('button', { name: /^ARCHIWALNY/ }));
    await user.click(screen.getByRole('button', { name: 'Szafa 2024' }));

    expect(handlers.onOpenProject).toHaveBeenCalledWith(archived[0]);
  });

  it('keeps the same client independently expanded in the tree and in Archiwum', async () => {
    const user = userEvent.setup();
    renderFolders();

    await user.click(screen.getByRole('button', { name: /^Archiwum/ }));
    const [treeYura, archiveYura] = screen.getAllByRole('button', { name: /^YURA/ });
    await user.click(archiveYura);

    expect(archiveYura).toHaveAttribute('aria-expanded', 'true');
    expect(treeYura).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Stara komoda' })).toBeInTheDocument();
    expect(screen.queryByText('Wzurniki')).not.toBeInTheDocument();
  });

  it('archives or trashes an active project from its menu', async () => {
    const user = userEvent.setup();
    const onChangeLifecycle = vi.fn();
    renderFolders({ onChangeLifecycle });

    await user.click(screen.getByRole('button', { name: /^CZERNIECHOWKA/ }));
    const row = screen.getByRole('button', { name: 'Kuchnia' }).parentElement;
    await user.click(within(row).getByRole('button', { name: 'Więcej działań' }));
    const menu = screen.getByRole('menu', { name: 'Działania: Kuchnia' });
    expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['W archiwum', 'Do kosza']);

    await user.click(within(menu).getByRole('menuitem', { name: 'Do kosza' }));
    expect(onChangeLifecycle).toHaveBeenCalledWith([clients[1]], 'trash');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('archives every active project of a client from the client menu', async () => {
    const user = userEvent.setup();
    const onChangeLifecycle = vi.fn();
    renderFolders({ onChangeLifecycle });

    await user.click(screen.getByRole('button', { name: 'Działania: CZERNIECHOWKA' }));
    await user.click(screen.getByRole('menuitem', { name: 'W archiwum' }));

    expect(onChangeLifecycle).toHaveBeenCalledWith([clients[1], clients[2]], 'archived');
  });

  it('restores an archived project from its menu', async () => {
    const user = userEvent.setup();
    const onChangeLifecycle = vi.fn();
    renderFolders({ onChangeLifecycle });

    await user.click(screen.getByRole('button', { name: /^Archiwum/ }));
    await user.click(screen.getByRole('button', { name: /^ARCHIWALNY/ }));
    const row = screen.getByRole('button', { name: 'Szafa 2024' }).parentElement;
    await user.click(within(row).getByRole('button', { name: 'Więcej działań' }));
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Przywróć', 'Do kosza']);
    await user.click(screen.getByRole('menuitem', { name: 'Przywróć' }));

    expect(onChangeLifecycle).toHaveBeenCalledWith([archived[0]], 'active');
  });

  it('lets the owner restore or permanently delete projects in Kosz', async () => {
    const user = userEvent.setup();
    const onChangeLifecycle = vi.fn();
    const onPurgeProjects = vi.fn();
    renderFolders({ canPurge: true, onChangeLifecycle, onPurgeProjects });

    await user.click(screen.getByRole('button', { name: /^Kosz/ }));
    await user.click(screen.getByRole('button', { name: /^KOSZOWY/ }));
    expect(screen.queryByRole('button', { name: 'Regał' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Przywróć: Regał' }));
    expect(onChangeLifecycle).toHaveBeenCalledWith([trashed[0]], 'active');
    await user.click(screen.getByRole('button', { name: 'Usuń trwale: Biurko' }));
    expect(onPurgeProjects).toHaveBeenCalledWith([trashed[1]]);

    await user.click(screen.getByRole('button', { name: 'Działania: KOSZOWY' }));
    await user.click(screen.getByRole('menuitem', { name: 'Usuń trwale' }));
    expect(onPurgeProjects).toHaveBeenLastCalledWith(trashed);
  });

  it('blocks permanent deletion for roles other than the owner', async () => {
    const user = userEvent.setup();
    const onPurgeProjects = vi.fn();
    renderFolders({ canPurge: false, onPurgeProjects });

    await user.click(screen.getByRole('button', { name: /^Kosz/ }));
    await user.click(screen.getByRole('button', { name: /^KOSZOWY/ }));

    expect(screen.getByRole('button', { name: 'Przywróć: Regał' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Usuń trwale: Regał' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Działania: KOSZOWY' }));
    expect(screen.getByRole('menuitem', { name: 'Usuń trwale' })).toBeDisabled();
    expect(onPurgeProjects).not.toHaveBeenCalled();
  });

  it('shows the folders read-only to roles that cannot manage the lifecycle', async () => {
    const user = userEvent.setup();
    renderFolders({ canManageLifecycle: false });

    expect(screen.queryByRole('button', { name: /^Działania:/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Kosz/ }));
    await user.click(screen.getByRole('button', { name: /^KOSZOWY/ }));

    expect(screen.getByText('Regał')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Przywróć|Usuń trwale/ })).not.toBeInTheDocument();
  });

  it('reveals the Archiwum group of an open archived project', () => {
    renderFolders({ activeProjectId: 20 });

    expect(screen.getByRole('button', { name: /^Archiwum/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Szafa 2024' })).toHaveAttribute('aria-current', 'page');
  });

  it('applies the search to the folder counts', async () => {
    const user = userEvent.setup();
    renderFolders();

    await user.type(screen.getByLabelText('Szukaj projektu'), 'regał');

    expect(screen.getByRole('button', { name: /^Archiwum/ })).toHaveTextContent('Archiwum0');
    expect(screen.getByRole('button', { name: /^Kosz/ })).toHaveTextContent('Kosz1');
  });
});

// feat/mobile-project-list-parity (2026-10): mobileLayout теперь рендерится тем же деревом
// клиент→проекты, что и desktop treeLayout (карандаш, Bilans, меню «⋯», Archiwum/Kosz) — кроме
// папок файлов, которые на mobile в списке сознательно не показываются (п.2 задания).
describe('ProjectListPanel mobile layout', () => {
  const renderMobile = (props = {}) => renderPanel({ treeLayout: false, mobileLayout: true, ...props });

  it('renders the same accordion tree as desktop, without file folders', () => {
    // workspaceOpen не передаётся: настоящий мобильный экран (MobileProjectsScreen) не управляет
    // открытой папкой файлов из списка — это сознательное исключение (п.2 задания).
    renderMobile({ activeProjectId: 1 });

    expect(screen.getByRole('button', { name: /^CZERNIECHOWKA/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'fuha1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('group', { name: 'Foldery plików projektu' })).not.toBeInTheDocument();
  });

  it('toggles a client accordion and opens a project, same as desktop', async () => {
    const user = userEvent.setup();
    const { handlers } = renderMobile();

    await user.click(screen.getByRole('button', { name: /^CZERNIECHOWKA/ }));
    expect(screen.getByRole('button', { name: /^CZERNIECHOWKA/ })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Przedpokój' }));
    expect(handlers.onOpenProject).toHaveBeenCalledWith(clients[2]);
  });

  it('edits a client and opens Bilans from the tree row, same actions as desktop', async () => {
    const user = userEvent.setup();
    const { handlers } = renderMobile();

    await user.click(screen.getByRole('button', { name: 'Edytuj dane: YURA' }));
    expect(handlers.onEditClient).toHaveBeenCalledWith('YURA', [clients[3]]);

    const yuraRow = screen.getByRole('button', { name: /^YURA/ }).parentElement;
    await user.click(within(yuraRow).getByRole('button', { name: 'Bilans' }));
    expect(handlers.onOpenBalance).toHaveBeenCalledWith('YURA');
  });

  it('shows Zakończone, Archiwum and Kosz with working lifecycle actions', async () => {
    const user = userEvent.setup();
    const onChangeLifecycle = vi.fn();
    const archived = [project(30, 'ARCH_M', 'Mobilny archiwalny', { lifecycle_status: 'archived' })];
    const { handlers } = renderMobile({ archivedClients: archived, canManageLifecycle: true, onChangeLifecycle });

    const folders = screen.getByRole('group', { name: 'Foldery systemowe' });
    expect(within(folders).getByRole('button', { name: /^Archiwum/ })).toHaveTextContent('Archiwum1');
    expect(within(folders).getByRole('button', { name: /^Kosz/ })).toHaveTextContent('Kosz0');

    await user.click(screen.getByRole('button', { name: /^CZERNIECHOWKA/ }));
    const row = screen.getByRole('button', { name: 'Kuchnia' }).parentElement;
    await user.click(within(row).getByRole('button', { name: 'Więcej działań' }));
    await user.click(screen.getByRole('menuitem', { name: 'Do kosza' }));
    expect(onChangeLifecycle).toHaveBeenCalledWith([clients[1]], 'trash');

    await user.click(within(folders).getByRole('button', { name: /^Archiwum/ }));
    await user.click(screen.getByRole('button', { name: /^ARCH_M/ }));
    await user.click(screen.getByRole('button', { name: 'Mobilny archiwalny' }));
    expect(handlers.onOpenProject).toHaveBeenLastCalledWith(archived[0]);
  });

  it('shows a lifecycle error banner inline, unlike desktop which relies on the App.jsx banner', () => {
    renderMobile({ lifecycleNotice: 'Nie udało się zmienić stanu projektu.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się zmienić stanu projektu.');
  });

  it('does not duplicate DOM ids when desktop and mobile trees are mounted at the same time', async () => {
    // Desktop (ProjectNav) и mobile (MobileProjectsScreen) рендерятся одновременно в App.jsx —
    // desktop скрыт только CSS-медиазапросом, не unmount (см. idPrefix в TreeClientGroups).
    const user = userEvent.setup();
    const archived = [project(31, 'CZERNIECHOWKA', 'W archiwum', { lifecycle_status: 'archived' })];
    render(
      <>
        <ProjectListPanel
          clients={clients}
          archivedClients={archived}
          scopeView="firma"
          canCreate
          onNewProject={vi.fn()}
          onOpenProject={vi.fn()}
          treeLayout
        />
        <ProjectListPanel
          clients={clients}
          archivedClients={archived}
          scopeView="firma"
          canCreate
          onNewProject={vi.fn()}
          onOpenProject={vi.fn()}
          mobileLayout
        />
      </>,
    );

    const [desktopToggle, mobileToggle] = screen.getAllByRole('button', { name: /^CZERNIECHOWKA/ });
    await user.click(desktopToggle);
    await user.click(mobileToggle);
    const [desktopArchive, mobileArchive] = screen.getAllByRole('button', { name: /^Archiwum/ });
    await user.click(desktopArchive);
    await user.click(mobileArchive);

    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
