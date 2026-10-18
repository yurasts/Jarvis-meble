import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceSection from './WorkspaceSection';
import useWorkspaceSections, { WORKSPACE_SECTIONS_STORAGE_KEY } from './useWorkspaceSections';
import ProjectTasksPanel from './ProjectTasksPanel';
import ProjectImportantPoints from './ProjectImportantPoints';

function SectionsHarness() {
  const { isOpen, toggle } = useWorkspaceSections();
  return (
    <>
      <WorkspaceSection title="Materiały" summary="961.80 zł" open={isOpen('materials')} onToggle={() => toggle('materials')}>
        <p>Tabela materiałów</p>
      </WorkspaceSection>
      <WorkspaceSection title="Usługi" open={isOpen('services')} onToggle={() => toggle('services')}>
        <p>Tabela usług</p>
      </WorkspaceSection>
    </>
  );
}

describe('WorkspaceSection', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders a collapsible region with the title, summary and actions in one header', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onAdd = vi.fn();
    render(
      <WorkspaceSection
        title="Zadania"
        meta="0 do wykonania"
        open
        onToggle={onToggle}
        actions={<button type="button" onClick={onAdd}>Dodaj zadanie</button>}
      >
        <p>Lista</p>
      </WorkspaceSection>,
    );

    const region = screen.getByRole('region', { name: 'Zadania' });
    const toggle = within(region).getByRole('button', { name: /^Zadania/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(region).getByRole('heading', { name: /Zadania/ })).toBeInTheDocument();
    expect(screen.getByText('Lista')).toBeInTheDocument();

    await user.click(within(region).getByRole('button', { name: 'Dodaj zadanie' }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onToggle).not.toHaveBeenCalled();
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('keeps a collapsed body mounted but hidden', () => {
    render(<WorkspaceSection title="Rozliczenia" open={false} onToggle={vi.fn()}><input aria-label="Szkic" defaultValue="Zaliczka" /></WorkspaceSection>);

    expect(screen.getByRole('button', { name: /^Rozliczenia/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('textbox', { name: 'Szkic' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Szkic', hidden: true })).toHaveValue('Zaliczka');
  });

  it('remembers collapsed sections across remounts', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SectionsHarness />);

    await user.click(screen.getByRole('button', { name: /^Materiały/ }));
    expect(screen.getByText('Tabela materiałów')).not.toBeVisible();
    expect(JSON.parse(window.localStorage.getItem(WORKSPACE_SECTIONS_STORAGE_KEY))).toMatchObject({ materials: false, services: true });

    unmount();
    render(<SectionsHarness />);
    expect(screen.getByRole('button', { name: /^Materiały/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /^Usługi/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('works without browser storage', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<SectionsHarness />);

    expect(screen.getByRole('button', { name: /^Materiały/ })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: /^Materiały/ }));
    expect(screen.getByRole('button', { name: /^Materiały/ })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Zadania and Informacje in the workspace layout', () => {
  it('render as collapsible sections with the add button in the header', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <>
        <ProjectTasksPanel layout="workspace" open={false} onToggle={onToggle} tasks={[{ id: 1, text: 'Zamówić fronty', isDone: false }]} onChange={vi.fn()} />
        <ProjectImportantPoints layout="workspace" open onToggle={vi.fn()} points={[{ id: 1, text: 'Blenda 200 mm' }]} onChange={vi.fn()} />
      </>,
    );

    const tasks = screen.getByRole('region', { name: 'Zadania projektu' });
    expect(within(tasks).getByRole('button', { name: /^Zadania/ })).toHaveTextContent('1 do wykonania');
    expect(screen.getByText('Zamówić fronty')).not.toBeVisible();
    await user.click(within(tasks).getByRole('button', { name: /^Zadania/ }));
    expect(onToggle).toHaveBeenCalledOnce();

    await user.click(within(tasks).getByRole('button', { name: 'Dodaj zadanie' }));
    expect(screen.getByRole('dialog', { name: 'Dodaj zadanie' })).toBeInTheDocument();
    await act(async () => { screen.getByRole('button', { name: 'Anuluj' }).click(); });

    const info = screen.getByRole('region', { name: 'Informacje' });
    expect(within(info).getByRole('button', { name: 'Dodaj ważną informację' })).toBeInTheDocument();
    expect(within(info).getByText('Blenda 200 mm')).toBeInTheDocument();
  });
});
