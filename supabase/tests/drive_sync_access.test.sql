begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email)
values
  ('d1111111-1111-4111-8111-111111111111', 'drive-owner@example.test'),
  ('d2222222-2222-4222-8222-222222222222', 'drive-designer@example.test');

insert into public.profiles (id, full_name, role)
values
  ('d1111111-1111-4111-8111-111111111111', 'Drive Owner', 'owner'),
  ('d2222222-2222-4222-8222-222222222222', 'Drive Designer', 'designer');

insert into public.clients (id, full_name, client_name, project_name)
values (4101, 'Drive Test', 'Drive Client', 'Drive Project');

insert into public.project_files (
  id, client_id, category, file_name, file_path, file_url
)
values (
  4201, 4101, 'usterki', 'drawing.pdf', '4101/drawing.pdf', 'https://example.test/drawing.pdf'
);

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('drive_sync_state', 'drive_file_sync_entries')
      and c.relrowsecurity
  ),
  2::bigint,
  'both drive sync tables enforce RLS'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('drive_sync_state', 'drive_file_sync_entries')
      and cmd = 'SELECT'
      and policyname in ('drive_sync_state_select_owner', 'drive_file_sync_entries_select_owner')
  ),
  2::bigint,
  'drive sync tables expose only owner select policies'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('drive_sync_state', 'drive_file_sync_entries')
      and grantee = 'authenticated'
      and privilege_type <> 'SELECT'
  ),
  0::bigint,
  'authenticated users have no direct mutation grants'
);

select ok(
  has_table_privilege('service_role', 'public.drive_sync_state', 'INSERT'),
  'service role can write leader state'
);

select ok(
  has_table_privilege('service_role', 'public.drive_file_sync_entries', 'INSERT'),
  'service role can write file sync metadata'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.acquire_drive_sync_lease(text,text,integer)',
    'EXECUTE'
  ),
  'authenticated users cannot execute the leader lease RPC'
);

set local role service_role;

select is(
  public.acquire_drive_sync_lease('PC-A', 'G:\Mój dysk\_Jarvis\Projekty', 45),
  true,
  'service role acquires the empty leader lease'
);

select lives_ok(
  $$
    insert into public.drive_file_sync_entries (
      project_id, project_file_id, category, relative_path, file_name,
      content_sha256, size_bytes, storage_path
    ) values (
      4101, 4201, 'projekt', 'drawing.pdf', 'drawing.pdf',
      repeat('a', 64), 128, '4101/drawing.pdf'
    )
  $$,
  'service role can store sync metadata'
);

reset role;
set local request.jwt.claims = '{"role":"authenticated","sub":"d1111111-1111-4111-8111-111111111111"}';
set local role authenticated;

select is((select count(*) from public.drive_sync_state), 1::bigint, 'owner sees leader state');
select is((select count(*) from public.drive_file_sync_entries), 1::bigint, 'owner sees file sync metadata');

select throws_ok(
  $$update public.drive_sync_state set last_error = 'owner write' where singleton_id = 1$$,
  '42501',
  null,
  'owner cannot mutate leader state directly'
);

select throws_ok(
  $$
    insert into public.drive_file_sync_entries (
      project_id, category, relative_path, file_name, content_sha256, size_bytes, storage_path
    ) values (
      4101, 'projekt', 'owner.pdf', 'owner.pdf', repeat('b', 64), 1, '4101/owner.pdf'
    )
  $$,
  '42501',
  null,
  'owner cannot mutate file sync metadata directly'
);

reset role;
set local request.jwt.claims = '{"role":"authenticated","sub":"d2222222-2222-4222-8222-222222222222"}';
set local role authenticated;

select is((select count(*) from public.drive_sync_state), 0::bigint, 'non-owner sees no leader state');
select is((select count(*) from public.drive_file_sync_entries), 0::bigint, 'non-owner sees no file sync metadata');

reset role;
set local role service_role;

select is(
  public.acquire_drive_sync_lease('PC-B', 'G:\Mój dysk\_Jarvis\Projekty', 45),
  false,
  'a second host cannot steal a live lease'
);

select is(
  public.acquire_drive_sync_lease('PC-A', 'G:\Mój dysk\_Jarvis\Projekty', 45),
  true,
  'the leader can renew its own lease'
);

select is(
  public.report_drive_sync_result('PC-A', '{"projects":1,"files":1}'::jsonb, null),
  true,
  'the leader can report a successful sync'
);

select is(
  (select last_sync_summary ->> 'projects' from public.drive_sync_state where singleton_id = 1),
  '1',
  'sync summary is stored for the owner status panel'
);

select throws_ok(
  $$select public.report_drive_sync_result('PC-A', '[]'::jsonb, null)$$,
  '22023',
  null,
  'sync result rejects a non-object summary'
);

select is(public.release_drive_sync_lease('PC-A'), true, 'the leader can release its lease');

select is(
  public.acquire_drive_sync_lease('PC-B', 'G:\Mój dysk\_Jarvis\Projekty', 45),
  true,
  'another host can acquire a released lease'
);

select throws_ok(
  $$
    insert into public.drive_file_sync_entries (
      project_id, category, relative_path, file_name, content_sha256, size_bytes, storage_path
    ) values (
      4101, 'projekt', '../escape.pdf', 'escape.pdf', repeat('c', 64), 1, '4101/escape.pdf'
    )
  $$,
  '23514',
  null,
  'sync metadata rejects path traversal'
);

select * from finish();
rollback;
