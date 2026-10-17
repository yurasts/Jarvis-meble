import { describe, expect, it } from 'vitest';
import {
  PROJECT_LIFECYCLE,
  canManageProjectLifecycle,
  canPurgeProjects,
  filterProjectsByLifecycle,
  getProjectLifecycle,
  isActiveProject,
  isMissingLifecycleColumnError,
} from './projectLifecycle';

describe('projectLifecycle', () => {
  it('treats rows without a known lifecycle as active', () => {
    expect(getProjectLifecycle({})).toBe('active');
    expect(getProjectLifecycle({ lifecycle_status: 'deleted' })).toBe('active');
    expect(getProjectLifecycle(null)).toBe('active');
    expect(isActiveProject({ lifecycle_status: 'archived' })).toBe(false);
  });

  it('splits projects by lifecycle without changing their order', () => {
    const clients = [
      { id: 1 },
      { id: 2, lifecycle_status: 'trash' },
      { id: 3, lifecycle_status: 'archived' },
      { id: 4, lifecycle_status: 'trash' },
    ];
    expect(filterProjectsByLifecycle(clients, PROJECT_LIFECYCLE.ACTIVE).map((c) => c.id)).toEqual([1]);
    expect(filterProjectsByLifecycle(clients, PROJECT_LIFECYCLE.ARCHIVED).map((c) => c.id)).toEqual([3]);
    expect(filterProjectsByLifecycle(clients, PROJECT_LIFECYCLE.TRASH).map((c) => c.id)).toEqual([2, 4]);
    expect(filterProjectsByLifecycle(undefined, PROJECT_LIFECYCLE.TRASH)).toEqual([]);
  });

  it('lets only the owner purge and the owner or assembler manage the lifecycle', () => {
    expect(canPurgeProjects('owner')).toBe(true);
    ['assembler', 'designer', 'installer', undefined].forEach((role) => {
      expect(canPurgeProjects(role)).toBe(false);
    });
    expect(canManageProjectLifecycle('owner')).toBe(true);
    expect(canManageProjectLifecycle('assembler')).toBe(true);
    expect(canManageProjectLifecycle('designer')).toBe(false);
    expect(canManageProjectLifecycle('installer')).toBe(false);
  });

  it('recognises a database without the lifecycle column', () => {
    expect(isMissingLifecycleColumnError({ code: '42703' })).toBe(true);
    expect(isMissingLifecycleColumnError({ code: 'PGRST204' })).toBe(true);
    expect(isMissingLifecycleColumnError({ code: '42501' })).toBe(false);
    expect(isMissingLifecycleColumnError(null)).toBe(false);
  });
});
