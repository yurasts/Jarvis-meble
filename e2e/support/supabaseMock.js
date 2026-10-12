import { Buffer } from 'node:buffer';

const USER_ID = '00000000-0000-4000-8000-000000000001';

const base64Url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const createAccessToken = () => [
  base64Url({ alg: 'HS256', typ: 'JWT' }),
  base64Url({
    aud: 'authenticated',
    exp: 2_000_000_000,
    iat: 1_900_000_000,
    role: 'authenticated',
    sub: USER_ID,
  }),
  'e2e-signature',
].join('.');

const createSession = () => ({
  access_token: createAccessToken(),
  expires_at: 2_000_000_000,
  expires_in: 3_600,
  refresh_token: 'e2e-refresh-token',
  token_type: 'bearer',
  user: {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
  },
});

const jsonResponse = (route, body, status = 200) => route.fulfill({
  status,
  headers: {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
});

const emptyProject = {
  phone: '',
  address: '',
  budget: 0,
  deadline: null,
  status: 'new',
  notes: '',
  calc_materials: [],
  calc_services: [],
  calc_expenses: [],
  tasks: [],
  production_steps: [],
  assigned_designer: null,
  assigned_installer: null,
  budget_coefficient: 2,
  cover_url: null,
  important_points: [],
};

const requestBody = (request) => {
  const body = request.postDataJSON();
  return Array.isArray(body) ? body[0] : body;
};

const idFilter = (url) => url.searchParams.get('id')?.replace(/^eq\./, '');

export async function installAuthenticatedSupabaseMock(page, initialProjects = [], {
  role = 'owner',
  failures = {},
} = {}) {
  const remainingFailures = { ...failures };
  const state = {
    failures: remainingFailures,
    projects: initialProjects.map(project => ({ ...emptyProject, ...project })),
    transactions: [],
    requests: {},
  };

  await page.addInitScript(({ session }) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
  }, { session: createSession() });

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-headers': 'authorization,apikey,content-profile,content-type,prefer,x-client-info',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'access-control-allow-origin': '*',
        },
      });
      return;
    }

    const url = new URL(request.url());
    const resource = url.pathname.split('/').pop();
    state.requests[resource] = (state.requests[resource] || 0) + 1;

    if (remainingFailures[resource] > 0) {
      remainingFailures[resource] -= 1;
      await jsonResponse(route, {
        code: 'E2E_RESOURCE_FAILURE',
        details: null,
        hint: null,
        message: `Temporary E2E failure for ${resource}`,
      }, 400);
      return;
    }

    if (resource === 'profiles') {
      await jsonResponse(route, [{
        id: USER_ID,
        full_name: 'Właściciel E2E',
        role,
        color: '#3182ce',
        theme: 'light',
        default_scope: 'firma',
      }]);
      return;
    }

    if (resource === 'clients') {
      if (request.method() === 'GET') {
        await jsonResponse(route, state.projects);
        return;
      }

      if (request.method() === 'POST') {
        const saved = {
          ...emptyProject,
          ...requestBody(request),
          id: '00000000-0000-4000-8000-000000000101',
        };
        state.projects.push(saved);
        await jsonResponse(route, saved, 201);
        return;
      }

      if (request.method() === 'PATCH') {
        const id = idFilter(url);
        const index = state.projects.findIndex(project => project.id === id);
        state.projects[index] = { ...state.projects[index], ...requestBody(request) };
        await jsonResponse(route, state.projects[index]);
        return;
      }
    }

    if (resource === 'project_cash_transactions') {
      if (request.method() === 'GET') {
        await jsonResponse(route, state.transactions.map(transaction => ({
          ...transaction,
          clients: { project_scope: 'firma' },
        })));
        return;
      }

      if (request.method() === 'POST') {
        const saved = {
          ...requestBody(request),
          id: '00000000-0000-4000-8000-000000000201',
        };
        state.transactions.unshift(saved);
        await jsonResponse(route, saved, 201);
        return;
      }
    }

    if (resource === 'materials' || resource === 'services' || resource === 'project_files') {
      await jsonResponse(route, []);
      return;
    }

    if (url.pathname.includes('/rpc/')) {
      await jsonResponse(route, []);
      return;
    }

    await jsonResponse(route, { message: `Unhandled E2E REST request: ${request.method()} ${url.pathname}` }, 501);
  });

  await page.route('**/storage/v1/**', route => jsonResponse(route, []));

  return state;
}

export const existingProject = {
  id: '00000000-0000-4000-8000-000000000100',
  full_name: 'Anna Kowalska',
  client_name: 'Anna Kowalska',
  project_name: 'Szafa istniejąca',
  project_scope: 'firma',
};
