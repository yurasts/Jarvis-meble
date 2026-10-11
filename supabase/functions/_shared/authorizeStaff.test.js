import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizationError,
  authorizeStaff,
  errorStatus,
  safeErrorMessage,
} from './authorizeStaff';

const requestWithToken = (token = 'valid-token') => ({
  headers: { get: vi.fn(() => `Bearer ${token}`) },
});

const createAdminClient = ({
  user = { id: 'user-1' },
  userError = null,
  profile = { role: 'designer' },
  profileError = null,
} = {}) => {
  const single = vi.fn(async () => ({ data: profile, error: profileError }));
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: userError })) },
    from: vi.fn(() => ({ select })),
  };
};

describe('authorizeStaff', () => {
  it('rejects requests without a bearer token', async () => {
    const request = { headers: { get: vi.fn(() => null) } };

    await expect(authorizeStaff(request, createAdminClient())).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rejects invalid user sessions', async () => {
    const client = createAdminClient({ user: null, userError: new Error('invalid JWT') });

    await expect(authorizeStaff(requestWithToken(), client)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rejects authenticated users without a staff profile', async () => {
    const client = createAdminClient({ profile: null, profileError: new Error('not found') });

    await expect(authorizeStaff(requestWithToken(), client)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('enforces restricted administrative roles', async () => {
    const client = createAdminClient({ profile: { role: 'designer' } });

    await expect(authorizeStaff(requestWithToken(), client, { allowedRoles: ['owner'] }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('returns the authenticated staff identity', async () => {
    const client = createAdminClient({ profile: { role: 'owner' } });

    await expect(authorizeStaff(requestWithToken(), client, { allowedRoles: ['owner'] }))
      .resolves.toEqual({ user: { id: 'user-1' }, role: 'owner' });
    expect(client.auth.getUser).toHaveBeenCalledWith('valid-token');
    expect(client.from).toHaveBeenCalledWith('profiles');
  });

  it('maps only authorization errors to their HTTP status', () => {
    expect(errorStatus(new AuthorizationError(401, 'unauthorized'))).toBe(401);
    expect(errorStatus(new Error('unexpected'))).toBe(500);
  });

  it('does not expose unexpected internal error details', () => {
    expect(safeErrorMessage(new AuthorizationError(403, 'forbidden'), 'failed')).toBe('forbidden');
    expect(safeErrorMessage(new Error('database host and stack trace'), 'failed')).toBe('failed');
  });
});
