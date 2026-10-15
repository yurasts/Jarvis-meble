import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProjectImportantPoints from './ProjectImportantPoints';
import ProjectTasksPanel from './ProjectTasksPanel';

describe('project workspace sections without entries', () => {
  it('renders only the tasks header when there is nothing to do', () => {
    render(<ProjectTasksPanel tasks={[]} onChange={vi.fn()} />);

    expect(screen.getByText('0 do wykonania')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dodaj zadanie' })).toBeInTheDocument();
    expect(screen.queryByText('Brak zadań do wykonania.')).not.toBeInTheDocument();
  });

  it('still lists open tasks', () => {
    render(<ProjectTasksPanel tasks={[{ id: 1, text: 'Zamówić fronty', isDone: false }]} onChange={vi.fn()} />);

    expect(screen.getByText('1 do wykonania')).toBeInTheDocument();
    expect(screen.getByText('Zamówić fronty')).toBeInTheDocument();
  });

  it('renders only the Informacje header when there are no points', () => {
    render(<ProjectImportantPoints points={[]} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Dodaj ważną informację' })).toBeInTheDocument();
    expect(screen.queryByText('Brak ważnych informacji.')).not.toBeInTheDocument();
  });

  it('still lists existing points', () => {
    render(<ProjectImportantPoints points={[{ id: 1, text: 'Blenda 200 mm' }]} onChange={vi.fn()} />);

    expect(screen.getByText('Blenda 200 mm')).toBeInTheDocument();
  });
});
