import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProjectCashLedger from './ProjectCashLedger';

const client = {
  id: 42,
  client_name: 'Nowak',
  project_name: 'Kuchnia',
  status: 'new',
  budget: 5000,
  budget_coefficient: 2,
  calc_materials: [],
  calc_services: [],
  calc_expenses: [],
};

const transaction = {
  id: 'cash-1',
  project_id: 42,
  direction: 'inflow',
  amount: 300,
  occurred_on: '2026-10-01',
  description: 'Zaliczka',
  created_at: '2026-10-01T10:00:00Z',
};

const renderLedger = (overrides = {}) => {
  const props = {
    client,
    transactions: [transaction],
    onSaveTransaction: vi.fn(async () => ({ error: null })),
    onDeleteTransaction: vi.fn(async () => ({ error: null })),
    onRetry: vi.fn(),
    ...overrides,
  };
  return { ...render(<ProjectCashLedger {...props} />), props };
};

describe('ProjectCashLedger integration', () => {
  it('creates an inflow from the visible editor', async () => {
    const user = userEvent.setup();
    const { props } = renderLedger({ transactions: [] });

    await user.click(screen.getByRole('button', { name: /Wpłata/ }));
    await user.type(screen.getByLabelText('Opis'), 'Zaliczka etap 1');
    await user.type(screen.getByLabelText(/Kwota/), '1250.50');
    await user.click(screen.getByRole('button', { name: 'Zapisz' }));

    await waitFor(() => expect(props.onSaveTransaction).toHaveBeenCalledWith(42, {
      direction: 'inflow',
      amount: 1250.5,
      occurred_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      description: 'Zaliczka etap 1',
    }));
    expect(screen.queryByLabelText('Opis')).not.toBeInTheDocument();
  });

  it('edits an existing transaction without changing its direction', async () => {
    const user = userEvent.setup();
    const { props } = renderLedger();

    await user.click(screen.getByText('Zaliczka'));
    const description = screen.getByLabelText('Opis');
    const amount = screen.getByLabelText(/Kwota/);
    await user.clear(description);
    await user.type(description, 'Druga zaliczka');
    await user.clear(amount);
    await user.type(amount, '450');
    await user.click(screen.getByRole('button', { name: 'Zapisz' }));

    await waitFor(() => expect(props.onSaveTransaction).toHaveBeenCalledWith(42, {
      id: 'cash-1',
      direction: 'inflow',
      amount: 450,
      occurred_on: '2026-10-01',
      description: 'Druga zaliczka',
    }));
  });

  it('keeps the editor open and shows a persistence error', async () => {
    const user = userEvent.setup();
    const saveError = new Error('RLS denied');
    renderLedger({ onSaveTransaction: vi.fn(async () => ({ error: saveError })) });

    await user.click(screen.getByText('Zaliczka'));
    await user.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(await screen.findByText(/Nie udało się zapisać/)).toBeInTheDocument();
    expect(screen.getByLabelText('Opis')).toHaveValue('Zaliczka');
  });

  it('requires confirmation and reports delete failures', async () => {
    const user = userEvent.setup();
    const onDeleteTransaction = vi.fn(async () => ({ error: new Error('RLS denied') }));
    renderLedger({ onDeleteTransaction });

    await user.click(screen.getByRole('button', { name: 'Usuń operację' }));
    expect(screen.getByText(/Usunąć „Zaliczka”/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tak' }));

    await waitFor(() => expect(onDeleteTransaction).toHaveBeenCalledWith('cash-1'));
    expect(await screen.findByText(/Nie udało się usunąć/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tak' })).toBeInTheDocument();
  });

  it('closes delete confirmation after success and exposes load retry', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderLedger();

    await user.click(screen.getByRole('button', { name: 'Usuń operację' }));
    await user.click(screen.getByRole('button', { name: 'Tak' }));
    await waitFor(() => expect(props.onDeleteTransaction).toHaveBeenCalledWith('cash-1'));
    expect(screen.queryByRole('button', { name: 'Tak' })).not.toBeInTheDocument();

    rerender(<ProjectCashLedger {...props} status="error" />);
    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  });
});
