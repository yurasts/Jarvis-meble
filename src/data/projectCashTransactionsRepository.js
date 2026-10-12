import { supabase } from '../supabase';

export const CASH_TRANSACTION_COLUMNS = [
  'id',
  'project_id',
  'direction',
  'amount',
  'occurred_on',
  'description',
].join(',');

const CASH_TRANSACTION_SCOPE_SELECT = `${CASH_TRANSACTION_COLUMNS},clients!inner(project_scope)`;

const transactionPayload = (draft) => ({
  direction: draft.direction,
  amount: draft.amount,
  occurred_on: draft.occurred_on,
  description: draft.description,
});

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const createProjectCashTransactionsRepository = ({ client = supabase } = {}) => ({
  async list(projectScope) {
    const rows = unwrap(await client
      .from('project_cash_transactions')
      .select(CASH_TRANSACTION_SCOPE_SELECT)
      .eq('clients.project_scope', projectScope)) || [];

    return rows.map(row => {
      const transaction = { ...row };
      delete transaction.clients;
      return transaction;
    });
  },

  async save(projectId, draft) {
    const payload = transactionPayload(draft);
    const query = draft.id
      ? client.from('project_cash_transactions').update(payload).eq('id', draft.id)
      : client.from('project_cash_transactions').insert([{ project_id: projectId, ...payload }]);

    return unwrap(await query.select(CASH_TRANSACTION_COLUMNS).single());
  },

  async remove(id) {
    unwrap(await client.from('project_cash_transactions').delete().eq('id', id));
  },
});

const projectCashTransactionsRepository = createProjectCashTransactionsRepository();

export default projectCashTransactionsRepository;
