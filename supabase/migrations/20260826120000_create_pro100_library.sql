
create table public.pro100_library_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9-]+$'),
  name text not null unique
    check (char_length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.pro100_library_categories (slug, name, sort_order)
values
  ('kuchnia', 'Kuchnia', 10),
  ('szafa', 'Szafa', 20),
  ('garderoba', 'Garderoba', 30),
  ('przedpokoj', U&'Przedpok\00F3j', 40),
  ('rtv', 'RTV', 50),
  ('inne', 'Inne', 60);

update public.pro100_library_categories
set name = U&'Przedpok\00F3j' where slug = 'przedpokoj';

create table public.pro100_library_files (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.pro100_library_categories(id),
  title text not null
    check (char_length(trim(title)) between 1 and 140),
  description text
    check (description is null or char_length(description) <= 1500),
  tags text[] not null default '{}',
  storage_path text not null unique,
  original_filename text not null
    check (lower(original_filename) like '%.sto'),
  file_size bigint not null check (file_size > 0),
  content_type text,
  version integer not null default 1 check (version > 0),
  created_by uuid not null default auth.uid() references public.profiles(id),
  updated_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pro100_library_files_category_id_idx
  on public.pro100_library_files (category_id);

create index pro100_library_files_updated_at_idx
  on public.pro100_library_files (updated_at desc);

create or replace function public.pro100_library_files_guard_update()
returns trigger
language plpgsql
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger pro100_library_files_guard_update
  before update on public.pro100_library_files
  for each row
  execute function public.pro100_library_files_guard_update();

alter table public.pro100_library_categories enable row level security;
alter table public.pro100_library_files enable row level security;

revoke all on public.pro100_library_categories from anon;
revoke all on public.pro100_library_files from anon;

grant select on public.pro100_library_categories to authenticated;
grant select, insert, update, delete
  on public.pro100_library_files to authenticated;

create policy pro100_library_categories_select_authenticated
  on public.pro100_library_categories
  for select to authenticated
  using (true);

create policy pro100_library_files_select_authenticated
  on public.pro100_library_files
  for select to authenticated
  using (true);

create policy pro100_library_files_insert_authenticated
  on public.pro100_library_files
  for insert to authenticated
  with check (created_by = auth.uid() and updated_by = auth.uid());

create policy pro100_library_files_update_authenticated
  on public.pro100_library_files
  for update to authenticated
  using (true)
  with check (true);

create policy pro100_library_files_delete_authenticated
  on public.pro100_library_files
  for delete to authenticated
  using (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('pro100-library', 'pro100-library', false, 104857600)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

create policy pro100_library_storage_select_authenticated
  on storage.objects
  for select to authenticated
  using (bucket_id = 'pro100-library');

create policy pro100_library_storage_insert_authenticated
  on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pro100-library');

create policy pro100_library_storage_update_authenticated
  on storage.objects
  for update to authenticated
  using (bucket_id = 'pro100-library')
  with check (bucket_id = 'pro100-library');

create policy pro100_library_storage_delete_authenticated
  on storage.objects
  for delete to authenticated
  using (bucket_id = 'pro100-library');

