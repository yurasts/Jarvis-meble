import { describe, expect, it, vi } from 'vitest';
import { BOOTSTRAP_RESOURCES, loadBootstrapData } from './bootstrapData';

vi.mock('../supabase', () => ({ supabase: {} }));

describe('loadBootstrapData', () => {
  it('starts all independent requests before waiting for any result', async () => {
    let resolveClients;
    const clientSource = {
      list: vi.fn(() => new Promise((resolve) => { resolveClients = resolve; })),
    };
    const catalogSource = {
      listMaterials: vi.fn(async () => [{ id: 'material' }]),
      listServices: vi.fn(async () => [{ id: 'service' }]),
    };

    const pending = loadBootstrapData({ clientSource, catalogSource });

    expect(clientSource.list).toHaveBeenCalledOnce();
    expect(catalogSource.listMaterials).toHaveBeenCalledOnce();
    expect(catalogSource.listServices).toHaveBeenCalledOnce();

    resolveClients([{ id: 'client' }]);
    await expect(pending).resolves.toEqual({
      clients: [{ id: 'client' }],
      materials: [{ id: 'material' }],
      services: [{ id: 'service' }],
      errors: {},
    });
  });

  it('keeps successful resources when another request fails', async () => {
    const networkError = new Error('network');
    const clientSource = { list: vi.fn(async () => { throw networkError; }) };
    const catalogSource = {
      listMaterials: vi.fn(async () => [{ id: 'material' }]),
      listServices: vi.fn(async () => [{ id: 'service' }]),
    };

    await expect(loadBootstrapData({ clientSource, catalogSource })).resolves.toEqual({
      clients: null,
      materials: [{ id: 'material' }],
      services: [{ id: 'service' }],
      errors: { clients: networkError },
    });
  });

  it('retries only selected failed resources', async () => {
    const clientSource = { list: vi.fn(async () => [{ id: 'client' }]) };
    const catalogSource = {
      listMaterials: vi.fn(async () => [{ id: 'material' }]),
      listServices: vi.fn(async () => [{ id: 'service' }]),
    };

    await expect(loadBootstrapData({
      clientSource,
      catalogSource,
      resources: ['materials'],
    })).resolves.toEqual({
      materials: [{ id: 'material' }],
      errors: {},
    });
    expect(clientSource.list).not.toHaveBeenCalled();
    expect(catalogSource.listServices).not.toHaveBeenCalled();
  });

  it('exports the complete resource list used by initial loading', () => {
    expect(BOOTSTRAP_RESOURCES).toEqual(['clients', 'materials', 'services']);
  });
});
