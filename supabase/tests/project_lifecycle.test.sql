begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email)
values
  ('81111111-1111-1111-1111-111111111111', 'lifecycle-owner@example.test'),
  ('82222222-2222-2222-2222-222222222222', 'lifecycle-assembler@example.test'),
  ('83333333-3333-3333-3333-333333333333', 'lifecycle-designer@example.test'),
  ('84444444-4444-4444-4444-444444444444', 'lifecycle-installer@example.test');

insert into public.profiles (id, full_name, role)
values
  ('81111111-1111-1111-1111-111111111111', 'Lifecycle Owner', 'owner'),
  ('82222222-2222-2222-2222-222222222222', 'Lifecycle Assembler', 'assembler'),
  ('83333333-3333-3333-3333-333333333333', 'Lifecycle Designer', 'designer'),
  ('84444444-4444-4444-4444-444444444444', 'Lifecycle Installer', 'installer');

insert into public.clients (id, full_name, assigned_designer, assigned_installer, portal_token)
values
  (3101, 'Lifecycle active project', '83333333-3333-3333-3333-333333333333', '84444444-4444-4444-4444-444444444444', '91111111-1111-1111-1111-111111111111'),
  (3102, 'Lifecycle purge project', '83333333-3333-3333-3333-333333333333', null, '92222222-2222-2222-2222-222222222222');

insert into public.project_files (client_id, file_name, file_path, file_url)
values (3102, 'purge.pdf', '3102/purge.pdf', '');

insert into public.project_cash_transactions (project_id, direction, amount, description, created_by)
values (3102, 'inflow', 10, 'Purge cash', '81111111-1111-1111-1111-111111111111');

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do update set public = excluded.public;

insert into storage.objects (bucket_id, name)
values ('project-files', '3102/purge.pdf');

select is(
  (select lifecycle_status from public.clients where id = 3101),
  'active',
  'new projects start in the active lifecycle'
);
select throws_ok(
  $$update public.clients set lifecycle_status = 'deleted' where id = 3101$$,
  '23514',
  null,
  'lifecycle status accepts only known values'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_delete_owner_only'
  )
  and exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_delete_owner_trash_only'
      and cmd = 'DELETE'
  ),
  'client deletion is governed only by the owner trash policy'
);
select is(
  (select count(*) from public.get_portal_data('91111111-1111-1111-1111-111111111111')),
  1::bigint,
  'portal shows an active project'
);

-- Designer: may edit the assigned project, but not its lifecycle.
set local request.jwt.claims = '{"role":"authenticated","sub":"83333333-3333-3333-3333-333333333333"}';
set local role authenticated;
select throws_ok(
  $$update public.clients set lifecycle_status = 'archived' where id = 3101$$,
  '42501',
  null,
  'designer cannot archive an assigned project'
);
select results_eq(
  $$update public.clients set notes = 'Designer note' where id = 3101 returning id$$,
  'values (3101::bigint)',
  'designer can still edit other fields of an assigned project'
);
reset role;

-- Installer: same restriction.
set local request.jwt.claims = '{"role":"authenticated","sub":"84444444-4444-4444-4444-444444444444"}';
set local role authenticated;
select throws_ok(
  $$update public.clients set lifecycle_status = 'trash' where id = 3101$$,
  '42501',
  null,
  'installer cannot move an assigned project to the trash'
);
reset role;

-- Assembler: manages the lifecycle but never deletes physically.
set local request.jwt.claims = '{"role":"authenticated","sub":"82222222-2222-2222-2222-222222222222"}';
set local role authenticated;
select lives_ok(
  $$update public.clients set lifecycle_status = 'archived' where id = 3101$$,
  'assembler can archive a project'
);
select isnt(
  (select lifecycle_changed_at from public.clients where id = 3101),
  null,
  'archiving records the lifecycle change time'
);
select lives_ok(
  $$update public.clients set lifecycle_status = 'active' where id = 3101$$,
  'assembler can restore a project'
);
select lives_ok(
  $$update public.clients set lifecycle_status = 'trash' where id = 3102$$,
  'assembler can move a project to the trash'
);
select results_eq(
  'delete from public.clients where id = 3102 returning id',
  'select null::bigint where false',
  'assembler cannot permanently delete a trashed project'
);
reset role;

select is(
  (select count(*) from public.get_portal_data('92222222-2222-2222-2222-222222222222')),
  0::bigint,
  'portal hides a project in the trash'
);

-- Designer cannot delete the assigned trashed project either.
set local request.jwt.claims = '{"role":"authenticated","sub":"83333333-3333-3333-3333-333333333333"}';
set local role authenticated;
select results_eq(
  'delete from public.clients where id = 3102 returning id',
  'select null::bigint where false',
  'designer cannot permanently delete a trashed project'
);
reset role;

-- Owner: deletes only from the trash.
set local request.jwt.claims = '{"role":"authenticated","sub":"81111111-1111-1111-1111-111111111111"}';
set local role authenticated;
select results_eq(
  'delete from public.clients where id = 3101 returning id',
  'select null::bigint where false',
  'owner cannot permanently delete an active project'
);
select lives_ok(
  $$update public.clients set lifecycle_status = 'archived' where id = 3101$$,
  'owner can archive a project'
);
select results_eq(
  'delete from public.clients where id = 3101 returning id',
  'select null::bigint where false',
  'owner cannot permanently delete an archived project'
);
select lives_ok(
  $$update public.clients set lifecycle_changed_at = '2000-01-01' where id = 3101$$,
  'a plain update may carry the lifecycle timestamp'
);
select isnt(
  (select lifecycle_changed_at from public.clients where id = 3101),
  '2000-01-01'::timestamptz,
  'the lifecycle timestamp cannot be forged without a status change'
);
select results_eq(
  'delete from public.clients where id = 3102 returning id',
  'values (3102::bigint)',
  'owner can permanently delete a trashed project'
);
select is(
  (
    select (select count(*) from public.project_files where client_id = 3102)
      + (select count(*) from public.project_cash_transactions where project_id = 3102)
  ),
  0::bigint,
  'permanent deletion cascades to project files and cash'
);
select is(
  (select count(*) from public.audit_log where table_name = 'clients' and record_id = 3102 and action = 'DELETE'),
  1::bigint,
  'permanent deletion is recorded in the audit log'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'project-files' and name = '3102/purge.pdf'),
  1::bigint,
  'owner can see storage objects left by a deleted project'
);
reset role;

set local request.jwt.claims = '{"role":"authenticated","sub":"82222222-2222-2222-2222-222222222222"}';
set local role authenticated;
select is(
  (select count(*) from storage.objects where bucket_id = 'project-files' and name = '3102/purge.pdf'),
  0::bigint,
  'assembler cannot see storage objects left by a deleted project'
);
reset role;

select * from finish();
rollback;
