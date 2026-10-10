-- Project-specific important information shown in the project workspace.
-- Each entry is a small JSON object (id, text and optional author/timestamp metadata).
alter table public.clients
  add column if not exists important_points jsonb not null default '[]'::jsonb

alter table public.clients
  drop constraint if exists clients_important_points_is_array

alter table public.clients
  add constraint clients_important_points_is_array
  check (jsonb_typeof(important_points) = 'array')

