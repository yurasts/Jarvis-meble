import { describe, expect, it } from 'vitest';
import { clientGroupName, planClientGroupRename } from './clientGroupRename';

const project = (id, clientName, extra = {}) => ({ id, client_name: clientName, full_name: clientName, project_scope: 'firma', ...extra });

describe('planClientGroupRename', () => {
  const clients = [
    project(1, 'Czerniechowka'),
    project(2, 'Czerniechowka'),
    project(3, 'Czerniechowka', { lifecycle_status: 'archived', full_name: 'Jan Czerniechowski' }),
    project(4, 'Czerniechowka', { project_scope: 'personal' }),
    project(5, 'Nowak'),
  ];

  it('renames every project of the old client group in the same scope', () => {
    const plan = planClientGroupRename({
      clients,
      original: clients[0],
      draft: { ...clients[0], client_name: '  Czerniechówka ' },
    });

    expect(plan).toEqual({
      previousName: 'Czerniechowka',
      nextName: 'Czerniechówka',
      ids: [1, 2, 3],
      fullNameIds: [1, 2],
      siblingCount: 2,
    });
  });

  it('does nothing when the client name did not change', () => {
    expect(planClientGroupRename({ clients, original: clients[0], draft: { ...clients[0], project_name: 'Inny' } })).toBeNull();
    expect(planClientGroupRename({ clients, original: clients[0], draft: { ...clients[0], client_name: 'Czerniechowka ' } })).toBeNull();
    expect(planClientGroupRename({ clients, original: clients[0], draft: { ...clients[0], client_name: '' } })).toBeNull();
  });

  it('groups by full_name when client_name is empty', () => {
    const legacy = { id: 9, client_name: '', full_name: 'Stary klient', project_scope: 'firma' };
    const sibling = { id: 10, client_name: null, full_name: 'Stary klient' };
    expect(clientGroupName(legacy)).toBe('Stary klient');

    const plan = planClientGroupRename({ clients: [legacy, sibling], original: legacy, draft: { ...legacy, client_name: 'Nowy klient' } });
    expect(plan.ids).toEqual([9, 10]);
    expect(plan.fullNameIds).toEqual([9, 10]);
  });
});
