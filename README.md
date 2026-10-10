# Jarvis

Internal project-management application for furniture projects. The frontend uses React, Vite,
and Supabase. Database objects and access policies are tracked under `supabase/`.

## Requirements

- Node.js 22
- npm 10+
- Docker-compatible runtime for the local Supabase stack

## Frontend setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`. These values are exposed to
the browser by design. Never place a Supabase service-role key in any `VITE_*` variable.

Before opening a pull request, run:

```bash
npm run verify
```

The command runs ESLint, all Vitest tests, and the production build. GitHub runs the same checks
for every pull request and for pushes to `main`.

## Supabase workflow

The committed declarative schema in `supabase/schemas/` is a read-only snapshot imported from the
Jarvis-meble project. It includes tables, functions, triggers, grants, RLS policies, and Storage
object policies. Production rows and secrets are not committed.

Start the local stack:

```bash
npm run supabase:start
npm run supabase:status
```

Copy the local API URL and anon key reported by `supabase status` into `.env.local`, then reset the
local database whenever migrations or seed data change:

```bash
npm run supabase:db:reset
```

To refresh the declarative snapshot from the linked remote project:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npm run supabase:schema:pull
```

`supabase:schema:pull` does not update remote migration history. Review every schema diff before
committing it. Generate and test an explicit migration before changing production; never run
`supabase db reset --linked` against the production project.

## Repository structure

- `src/components/` — React views and feature hooks
- `src/data/` — Supabase-backed repositories
- `src/utils/` — framework-independent helpers
- `src/test/` — shared test setup
- `supabase/schemas/` — declarative database and RLS source
- `supabase/migrations/` — reviewed forward-only database changes
- `.github/workflows/ci.yml` — pull-request and `main` verification
