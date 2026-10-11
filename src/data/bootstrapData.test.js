import { describe, expect, it, vi } from 'vitest';
import { loadBootstrapData } from './bootstrapData';

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
    });
  });

  it('keeps successful resources when another request fails', async () => {
    const clientSource = { list: vi.fn(async () => { throw new Error('network'); }) };
    const catalogSource = {
      listMaterials: vi.fn(async () => [{ id: 'material' }]),
      listServices: vi.fn(async () => [{ id: 'service' }]),
    };

    await expect(loadBootstrapData({ clientSource, catalogSource })).resolves.toEqual({
      clients: null,
      materials: [{ id: 'material' }],
      services: [{ id: 'service' }],
    });
  });
});
