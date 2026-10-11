export const STAFF_ROLES = Object.freeze([
  'owner',
  'assembler',
  'designer',
  'installer',
]);

export class AuthorizationError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AuthorizationError';
    this.status = status;
  }
}

const bearerToken = (request) => {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

export const authorizeStaff = async (
  request,
  supabaseAdmin,
  { allowedRoles = STAFF_ROLES } = {},
) => {
  const token = bearerToken(request);
  if (!token) throw new AuthorizationError(401, 'Brak autoryzacji');

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    throw new AuthorizationError(401, 'Nieprawidłowa sesja');
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || !STAFF_ROLES.includes(profile.role)) {
    throw new AuthorizationError(403, 'Brak profilu pracownika');
  }
  if (!allowedRoles.includes(profile.role)) {
    throw new AuthorizationError(403, 'Brak uprawnień');
  }

  return { user: userData.user, role: profile.role };
};

export const errorStatus = (error) => (
  error instanceof AuthorizationError ? error.status : 500
);

export const safeErrorMessage = (error, fallback) => (
  error instanceof AuthorizationError ? error.message : fallback
);
