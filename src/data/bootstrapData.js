import clientsRepository from './clientsRepository';
import catalogRepository from './catalogRepository';

const settledValue = (result) => (
  result.status === 'fulfilled' ? result.value : null
);

export const loadBootstrapData = async ({
  clientSource = clientsRepository,
  catalogSource = catalogRepository,
} = {}) => {
  const [clientsResult, materialsResult, servicesResult] = await Promise.allSettled([
    clientSource.list(),
    catalogSource.listMaterials(),
    catalogSource.listServices(),
  ]);

  return {
    clients: settledValue(clientsResult),
    materials: settledValue(materialsResult),
    services: settledValue(servicesResult),
  };
};
