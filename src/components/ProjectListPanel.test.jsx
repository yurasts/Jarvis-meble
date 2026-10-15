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
