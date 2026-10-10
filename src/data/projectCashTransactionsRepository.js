import { supabase } from '../supabase';

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
  async list() {
    return unwrap(await client.from('project_cash_transactions').select('*')) || [];
  },

  async save(projectId, draft) {
    const payload = transactionPayload(draft);
    const query = draft.id
      ? client.from('project_cash_transactions').update(payload).eq('id', draft.id)
      : client.from('project_cash_transactions').insert([{ project_id: projectId, ...payload }]);

    return unwrap(await query.select().single());
  },

  async remove(id) {
    unwrap(await client.from('project_cash_transactions').delete().eq('id', id));
  },
});

const projectCashTransactionsRepository = createProjectCashTransactionsRepository();

export default projectCashTransactionsRepository;
