import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import OwnerUserActivityPanel, { UserPresenceBadge } from './OwnerUserActivityPanel';

const NOW = new Date(2026, 9, 25, 14, 0).getTime();
const at = (day, hour, minute) => new Date(2026, 9, day, hour, minute).toISOString();

const profiles = [
  { id: 'owner', full_name: 'Jan Właściciel' },
  { id: 'designer', full_name: 'Anna Projektant' },
];

const ownerLog = (id, createdAt, extra = {}) => ({
  id,
  user_id: 'owner',
  user_email: 'owner@example.test',
  user_name: 'Jan Właściciel',
  event_type: 'sign_in',
  device_type: 'desktop',
  created_at: createdAt,
  ...extra,
});

const logs = [
  ownerLog('log-owner', at(25, 12, 25)),
  ownerLog('log-owner-duplicate', at(25, 12, 24)),
  ownerLog('log-owner-yesterday', at(24, 9, 10)),
  {
    id: 'log-designer',
    user_id: 'designer',
    user_email: 'designer@example.test',
    user_name: 'Anna Projektant',
    event_type: 'session_start',
    device_type: 'mobile',
    created_at: at(25, 11, 0),
  },
];

const renderPanel = (props = {}) => render(
  <OwnerUserActivityPanel
    profiles={profiles}
    presenceByUserId={{
      designer: { last_seen_at: new Date(NOW - 60 * 1000).toISOString(), last_device_type: 'mobile' },
      owner: { last_seen_at: at(24, 14, 12), last_device_type: 'desktop' },
    }}
    logs={logs}
    status="ready"
    error={null}
    onRetry={vi.fn()}
    now={NOW}
    {...props}
  />,
);

describe('OwnerUserActivityPanel', () => {
  it('shows compact presence chips, a 7-day heatmap and a day-grouped feed without duplicates', () => {
    renderPanel();

    const chips = screen.getByRole('group', { name: 'Filtr aktywności według pracownika' });
    expect(within(chips).getByRole('button', { name: /Wszyscy/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(chips).getByText('Online')).toBeInTheDocument();
    expect(within(chips).getByText(/24\.10, 14:12/)).toBeInTheDocument();

    const heatmap = screen.getByRole('table', { name: 'Aktywność z ostatnich 7 dni' });
    expect(within(heatmap).getAllByRole('columnheader')).toHaveLength(8);
    expect(within(heatmap).getAllByRole('row')).toHaveLength(3);
    const todayCell = within(heatmap).getByRole('cell', { name: /Jan Właściciel · .* 25\.10: 12:25/ });
    expect(todayCell).toHaveTextContent('💻');

    const feed = screen.getByRole('region', { name: 'Historia logowań i sesji' });
    expect(within(feed).getByRole('heading', { name: 'Dziś (25.10)' })).toBeInTheDocument();
    expect(within(feed).getByRole('heading', { name: 'Wczoraj (24.10)' })).toBeInTheDocument();
    expect(within(feed).getAllByRole('listitem')).toHaveLength(3);
    expect(within(feed).getByText('12:25')).toBeInTheDocument();
    expect(within(feed).queryByText('12:24')).not.toBeInTheDocument();
    expect(within(feed).getByTitle(/Scalono 2 wpisy/)).toHaveTextContent('×2');
    expect(within(feed).getByText('Otwarcie aplikacji')).toBeInTheDocument();
    expect(within(feed).getAllByTitle('owner@example.test')).toHaveLength(2);
  });

  it('filters by an employee chip, switches to the hourly timeline and resets on a second click', async () => {
    const user = userEvent.setup();
    renderPanel();

    const designerChip = screen.getByRole('button', { name: 'Filtruj aktywność: Anna Projektant' });
    await user.click(designerChip);
    expect(designerChip).toHaveAttribute('aria-pressed', 'true');

    const feed = screen.getByRole('region', { name: 'Historia logowań i sesji' });
    expect(within(feed).getByText('Anna Projektant')).toBeInTheDocument();
    expect(within(feed).queryByText('Jan Właściciel')).not.toBeInTheDocument();

    const timeline = screen.getByRole('table', { name: 'Aktywność godzinowa: Anna Projektant' });
    expect(within(timeline).getAllByRole('row')).toHaveLength(7);
    expect(within(timeline).getByRole('cell', { name: /25\.10, 11:00: 11:00 📱/ })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Aktywność z ostatnich 7 dni' })).not.toBeInTheDocument();

    await user.click(designerChip);
    expect(designerChip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('table', { name: 'Aktywność z ostatnich 7 dni' })).toBeInTheDocument();

    await user.click(designerChip);
    await user.click(screen.getByRole('button', { name: /Wszyscy/ }));
    expect(within(feed).getAllByText('Jan Właściciel')).toHaveLength(2);
  });

  it('renders a retryable owner-only loading error', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderPanel({ logs: [], status: 'error', error: new Error('Brak połączenia'), onRetry });

    expect(screen.getByRole('alert')).toHaveTextContent('Brak połączenia');
    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows an empty state when there is no history', () => {
    renderPanel({ logs: [] });
    expect(screen.getByText('Brak zapisanej aktywności.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Historia logowań i sesji' })).not.toBeInTheDocument();
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
