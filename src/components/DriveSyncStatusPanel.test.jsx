import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DriveSyncStatusPanel from './DriveSyncStatusPanel';

const activeState = {
  locked_by_host: 'WORKSHOP-PC-1',
  sync_root_path: String.raw`G:\Mój dysk\_Jarvis\Projekty`,
  last_heartbeat_at: '2026-10-25T11:59:30.000Z',
  lease_until: '2026-10-25T12:00:30.000Z',
  last_sync_at: '2026-10-25T11:59:40.000Z',
  last_sync_summary: { projects: 8, files: 42 },
  last_error: null,
};

describe('DriveSyncStatusPanel', () => {
  it('shows the active leader, root and last counters', () => {
    render(
      <DriveSyncStatusPanel
        state={activeState}
        status="ready"
        error={null}
        onRetry={vi.fn()}
        now={new Date('2026-10-25T12:00:00.000Z').getTime()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Aktywna');
    expect(screen.getByText('WORKSHOP-PC-1')).toBeInTheDocument();
    expect(screen.getByText(activeState.sync_root_path)).toBeInTheDocument();
    expect(screen.getByLabelText('Podsumowanie synchronizacji')).toHaveTextContent('8 projektów');
    expect(screen.getByLabelText('Podsumowanie synchronizacji')).toHaveTextContent('42 plików');
  });

  it('renders an offline retryable error', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <DriveSyncStatusPanel
        state={null}
        status="error"
        error={new Error('Brak połączenia')}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Offline');
    expect(screen.getByRole('alert')).toHaveTextContent('Brak połączenia');
    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
