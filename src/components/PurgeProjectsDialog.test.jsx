import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PurgeProjectsDialog from './PurgeProjectsDialog';

const project = (id, clientName, projectName) => ({ id, client_name: clientName, project_name: projectName });

describe('PurgeProjectsDialog', () => {
  it('lists the projects and confirms the permanent deletion', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<PurgeProjectsDialog projects={[project(1, 'KOSZOWY', 'Regał')]} onConfirm={onConfirm} onCancel={onCancel} />);

    const dialog = screen.getByRole('alertdialog', { name: 'Usunąć projekt trwale?' });
    expect(within(dialog).getByRole('listitem')).toHaveTextContent('KOSZOWY — Regał');
    expect(dialog).toHaveTextContent('Tej operacji nie można cofnąć.');

    await user.click(within(dialog).getByRole('button', { name: 'Anuluj' }));
    expect(onCancel).toHaveBeenCalledOnce();
    await user.click(within(dialog).getByRole('button', { name: 'Usuń trwale' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('uses the Polish plural for several projects', () => {
    const { rerender } = render(
      <PurgeProjectsDialog projects={[project(1, 'A', 'x'), project(2, 'A', 'y')]} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('heading')).toHaveTextContent('Usunąć trwale 2 projekty?');

    const five = [1, 2, 3, 4, 5].map(id => project(id, 'A', `p${id}`));
    rerender(<PurgeProjectsDialog projects={five} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Usunąć trwale 5 projektów?');
  });

  it('locks both buttons while the deletion runs', () => {
    render(<PurgeProjectsDialog projects={[project(1, 'A', 'x')]} busy onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Anuluj' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Usuwanie…' })).toBeDisabled();
  });
});
