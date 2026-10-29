const numberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const projectTotals = (client) => {
  const materialsItems = client?.calc_materials || [];
  const servicesItems = client?.calc_services || [];
  const expensesItems = client?.calc_expenses || [];

  const materials = materialsItems.reduce(
    (sum, item) => sum + numberOrZero(item.price) * numberOrZero(item.quantity),
    0,
  );
  const services = servicesItems.reduce(
    (sum, item) => sum + numberOrZero(item.price) * numberOrZero(item.quantity || 1),
    0,
  );
  const expenses = expensesItems.reduce(
    (sum, item) => sum + numberOrZero(item.price) * numberOrZero(item.quantity || 1),
    0,
  );

  return { materials, services, expenses, total: materials + services + expenses };
};

// The multiplier applies only to materials. Services are added once and expenses
// stay outside the customer estimate.
export const calculateProjectWycena = ({ materialsTotal, servicesTotal, multiplier }) => {
  const coefficient = Number(multiplier);
  const safeMultiplier = Number.isFinite(coefficient) && coefficient > 0 ? coefficient : 2;

  return numberOrZero(materialsTotal) * safeMultiplier + numberOrZero(servicesTotal);
};

export const calculateClientWycena = (client, multiplier = client?.budget_coefficient) => {
  const { materials, services } = projectTotals(client);
  return calculateProjectWycena({
    materialsTotal: materials,
    servicesTotal: services,
    multiplier,
  });
};
