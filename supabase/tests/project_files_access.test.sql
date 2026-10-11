begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'designer@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'installer@example.test');

insert into public.profiles (id, full_name, role)
values
  ('11111111-1111-1111-1111-111111111111', 'Test Owner', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'Test Designer', 'designer'),
  ('33333333-3333-3333-3333-333333333333', 'Test Installer', 'installer');

insert into public.clients (id, full_name, assigned_designer, assigned_installer)
values
  (1001, 'Designer project', '22222222-2222-2222-2222-222222222222', null),
  (1002, 'Installer project', null, '33333333-3333-3333-3333-333333333333');

insert into public.project_files (client_id, file_name, file_path, file_url)
values
  (1001, 'designer.pdf', '1001/designer.pdf', 'https://example.test/designer.pdf'),
  (1002, 'installer.pdf', '1002/installer.pdf', 'https://example.test/installer.pdf');

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do update set public = excluded.public;

insert into storage.objects (bucket_id, name)
values
  ('project-files', '1001/designer.pdf'),
  ('project-files', '1002/installer.pdf');

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_files'
      and policyname = 'project_files_visible_project_access'
  ),
  'project_files visibility policy exists'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_storage_visible_project_access'
  ),
  'project-files storage visibility policy exists'
);

select ok(
  not has_table_privilege('anon', 'public.project_files', 'select'),
  'anon has no project_files table privilege'
);

select has_index(
  'public',
  'project_files',
  'project_files_client_id_idx',
  'project_files has an index for grouped client counts'
);

select ok(
  not has_function_privilege('anon', 'public.get_project_file_counts()', 'execute'),
  'anon cannot execute project file counts RPC'
);

select is(
  (select public from storage.buckets where id = 'project-files'),
  false,
  'project-files bucket is private'
);

set local request.jwt.claims = '{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}';
set local role authenticated;
select is((select count(*) from public.project_files), 2::bigint, 'owner sees all project files');
select is((select count(*) from storage.objects where bucket_id = 'project-files'), 2::bigint, 'owner sees all project storage objects');
select results_eq(
  'select client_id, file_count from public.get_project_file_counts() order by client_id',
  'values (1001::bigint, 1::bigint), (1002::bigint, 1::bigint)',
  'owner receives counts for all visible projects'
);
reset role;

set local request.jwt.claims = '{"role":"authenticated","sub":"22222222-2222-2222-2222-222222222222"}';
set local role authenticated;
select is((select count(*) from public.project_files), 1::bigint, 'designer sees assigned project files only');
select is((select count(*) from storage.objects where bucket_id = 'project-files'), 1::bigint, 'designer sees assigned project storage only');
select results_eq(
  'select client_id, file_count from public.get_project_file_counts() order by client_id',
  'values (1001::bigint, 1::bigint)',
  'designer receives counts for assigned projects only'
);
reset role;

set local request.jwt.claims = '{"role":"authenticated","sub":"33333333-3333-3333-3333-333333333333"}';
set local role authenticated;
select is((select count(*) from public.project_files), 1::bigint, 'installer sees assigned project files only');
select is((select count(*) from storage.objects where bucket_id = 'project-files'), 1::bigint, 'installer sees assigned project storage only');
select results_eq(
  'select client_id, file_count from public.get_project_file_counts() order by client_id',
  'values (1002::bigint, 1::bigint)',
  'installer receives counts for assigned projects only'
);
reset role;

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'project-files'), 0::bigint, 'anon sees no project storage objects');
reset role;

select ok(
  not has_sequence_privilege('anon', 'public.project_files_id_seq', 'usage'),
  'anon cannot allocate project file ids'
);

select * from finish();
rollback;
