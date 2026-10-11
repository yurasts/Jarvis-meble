# Supabase Edge Functions

These directories mirror the functions deployed to the `Jarvis-meble` Supabase project. Secrets
are never committed; production provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, while the
AI integrations additionally require `ANTHROPIC_API_KEY` and/or `VOYAGE_API_KEY` in Supabase
Secrets.

## Authorization

Every function keeps gateway JWT verification enabled and then validates the bearer token and
staff profile again in `_shared/authorizeStaff.js`. This second check is required before using a
service-role client, because that client bypasses Row Level Security.

- `create-employee`, `generate-embeddings`, and `backfill-materials-embeddings`: owner only.
- `scan-invoice`, `ask-jarvis`, and legacy `super-service`: any configured staff role.

`super-service` is retained because it is still deployed, but the frontend does not invoke it. It
should be retired from Supabase in a separate reviewed change after production logs confirm that no
external caller depends on it.

## Verification and deployment

Run the repository verification before deploying:

```bash
npm run verify
```

Deploy one reviewed function at a time:

```bash
npx supabase functions deploy <function-name> --project-ref <project-ref>
```

After deployment, verify an unauthenticated request is rejected and smoke-test the permitted role.
