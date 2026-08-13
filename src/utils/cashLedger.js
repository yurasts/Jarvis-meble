// Чистые функции над плоским массивом project_cash_transactions — общие для ProjectCashLedger
// (одна карточка проекта) и MobileClientBalanceScreen (агрегация по клиенту). Один и тот же массив
// (App.jsx, единый fetch) фильтруется/суммируется здесь без копирования данных между экранами.
// direction: 'inflow' (Wpłata) | 'outflow' (Wydatek); amount всегда положительный — знак задаёт
// direction, не число.

export const transactionsForProject = (transactions, projectId) =>
  (transactions || []).filter((t) => t.project_id === projectId);

export const transactionsForProjects = (transactions, projectIds) => {
  const idSet = new Set(projectIds);
  return (transactions || []).filter((t) => idSet.has(t.project_id));
};

// Wpłaty/Wydatki/Saldo — Wpłaty = sum(inflow), Wydatki = sum(outflow), Saldo = Wpłaty − Wydatki.
export const summarizeCash = (transactions) => {
  const list = transactions || [];
  const wplaty = list
    .filter((t) => t.direction === 'inflow')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const wydatki = list
    .filter((t) => t.direction === 'outflow')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  return { wplaty, wydatki, saldo: wplaty - wydatki };
};

// Новые сверху: occurred_on desc, тай-брейк — created_at desc (совпадает с индексом
// project_id, occurred_on desc в миграции — тот же порядок сортировки, что использует БД).
export const sortCashDesc = (transactions) =>
  [...(transactions || [])].sort((a, b) => {
    const byDate = (b.occurred_on || '').localeCompare(a.occurred_on || '');
    if (byDate !== 0) return byDate;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

// Плановая смета проекта (не денежный поток) — Wycena: сохранённый client.budget, а при его
// отсутствии/0 — fallback из действующей формулы (totalCost × budget_coefficient), та же формула,
// что и в ProjectModal/ProjectListPanel FinancePanel.
export const plannedWycena = (client, totalCost) => {
  const saved = Number(client?.budget);
  if (Number.isFinite(saved) && saved > 0) return saved;
  const coef = Number(client?.budget_coefficient) || 2;
  return totalCost * coef;
};
