import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import OwnerUserActivityPanel, { UserPresenceBadge } from './OwnerUserActivityPanel';

const profiles = [
  { id: 'owner', full_name: 'Jan Właściciel' },
  { id: 'designer', full_name: 'Anna Projektant' },
];

const logs = [
  {
    id: 'log-owner',
    user_id: 'owner',
    user_email: 'owner@example.test',
    user_name: 'Jan Właściciel',
    event_type: 'sign_in',
    device_type: 'desktop',
    created_at: '2026-10-22T09:00:00.000Z',
  },
  {
    id: 'log-designer',
    user_id: 'designer',
    user_email: 'designer@example.test',
    user_name: 'Anna Projektant',
    event_type: 'session_start',
    device_type: 'mobile',
    created_at: '2026-10-22T08:00:00.000Z',
  },
];

describe('OwnerUserActivityPanel', () => {
  it('shows online device status and filters immutable activity rows', async () => {
    const user = userEvent.setup();
    render(
      <OwnerUserActivityPanel
        profiles={profiles}
        presenceByUserId={{
          designer: {
            last_seen_at: new Date().toISOString(),
            last_device_type: 'mobile',
          },
        }}
        logs={logs}
        status="ready"
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Brak danych')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Historia logowań i sesji' });
    expect(within(table).getByText('Logowanie')).toBeInTheDocument();
    expect(within(table).getByText('Otwarcie aplikacji')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtr aktywności według pracownika'), 'designer');
    expect(within(table).getByText('Anna Projektant')).toBeInTheDocument();
    expect(within(table).queryByText('Jan Właściciel')).not.toBeInTheDocument();
  });

  it('renders a retryable owner-only loading error', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <OwnerUserActivityPanel
        profiles={profiles}
        presenceByUserId={{}}
        logs={[]}
        status="error"
        error={new Error('Brak połączenia')}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Brak połączenia');
    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('marks stale presence as last seen instead of online', () => {
    render(
      <UserPresenceBadge
        presence={{ last_seen_at: '2026-10-22T10:00:00.000Z', last_device_type: 'desktop' }}
        now={new Date('2026-10-22T10:07:00.000Z').getTime()}
      />,
    );
    expect(screen.getByText(/Ostatnio:/)).toHaveTextContent('💻');
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
  });
});
