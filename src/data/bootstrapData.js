import clientsRepository from './clientsRepository';
import catalogRepository from './catalogRepository';
import suppliersRepository from './suppliersRepository';

export const BOOTSTRAP_RESOURCES = ['clients', 'materials', 'services', 'suppliers'];

export const loadBootstrapData = async ({
  clientSource = clientsRepository,
  catalogSource = catalogRepository,
  supplierSource = suppliersRepository,
  resources = BOOTSTRAP_RESOURCES,
} = {}) => {
  const loaders = {
    clients: () => clientSource.list(),
    materials: () => catalogSource.listMaterials(),
    services: () => catalogSource.listServices(),
    suppliers: () => supplierSource.list(),
  };
  const selectedResources = resources.filter(resource => loaders[resource]);
  const settledResults = await Promise.allSettled(
    selectedResources.map(resource => loaders[resource]()),
  );
  const data = { errors: {} };

  selectedResources.forEach((resource, index) => {
    const result = settledResults[index];
    if (result.status === 'fulfilled') {
      data[resource] = result.value;
    } else {
      data[resource] = null;
      data.errors[resource] = result.reason;
    }
  });

  return data;
};
