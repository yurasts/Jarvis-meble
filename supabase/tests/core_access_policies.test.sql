begin;

create extension if not exists pgtap with schema extensions;
select plan(45);

insert into auth.users (id, email)
values
  ('61111111-1111-1111-1111-111111111111', 'matrix-owner@example.test'),
  ('62222222-2222-2222-2222-222222222222', 'matrix-assembler@example.test'),
  ('63333333-3333-3333-3333-333333333333', 'matrix-designer@example.test'),
  ('64444444-4444-4444-4444-444444444444', 'matrix-installer@example.test');

insert into public.profiles (id, full_name, role)
values
  ('61111111-1111-1111-1111-111111111111', 'Matrix Owner', 'owner'),
  ('62222222-2222-2222-2222-222222222222', 'Matrix Assembler', 'assembler'),
  ('63333333-3333-3333-3333-333333333333', 'Matrix Designer', 'designer'),
  ('64444444-4444-4444-4444-444444444444', 'Matrix Installer', 'installer');

insert into public.clients (id, full_name, assigned_designer, assigned_installer)
values
  (2101, 'Designer matrix project', '63333333-3333-3333-3333-333333333333', null),
  (2102, 'Installer matrix project', null, '64444444-4444-4444-4444-444444444444'),
  (2103, 'Unassigned matrix project', null, null);

insert into public.project_cash_transactions
  (id, project_id, direction, amount, description, created_by)
values
  ('71111111-1111-1111-1111-111111111111', 2101, 'inflow', 100, 'Designer project cash', '61111111-1111-1111-1111-111111111111'),
  ('72222222-2222-2222-2222-222222222222', 2102, 'outflow', 50, 'Installer project cash', '61111111-1111-1111-1111-111111111111'),
  ('73333333-3333-3333-3333-333333333333', 2103, 'inflow', 25, 'Unassigned project cash', '61111111-1111-1111-1111-111111111111');

insert into public.materials (id, name, price)
values (9101, 'Matrix material', 10);

insert into public.services (id, name, price)
values (9201, 'Matrix service', 20);

insert into public.suppliers (id, name)
values (9301, 'Matrix supplier');

insert into public.knowledge_base (id, source_table, source_id, content)
values ('74444444-4444-4444-4444-444444444444', 'materials', '9101', 'Matrix knowledge');

insert into public.pro100_library_categories (id, slug, name)
values ('75555555-5555-5555-5555-555555555555', 'matrix-category', 'Matrix category');

insert into public.pro100_library_files
  (id, category_id, title, storage_path, original_filename, file_size, created_by, updated_by)
values
  (
    '76666666-6666-6666-6666-666666666666',
    '75555555-5555-5555-5555-555555555555',
    'Matrix PRO100 file',
    'matrix/file.sto',
    'file.sto',
    1024,
    '61111111-1111-1111-1111-111111111111',
    '61111111-1111-1111-1111-111111111111'
  );

insert into storage.buckets (id, name, public)
values ('pro100-library', 'pro100-library', false)
on conflict (id) do update set public = excluded.public;

insert into storage.objects (bucket_id, name)
values ('pro100-library', 'matrix/file.sto');

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'audit_log', 'clients', 'hardware', 'knowledge_base', 'materials',
        'media', 'pro100_library_categories', 'pro100_library_files',
        'profiles', 'project_cash_transactions', 'project_files', 'projects',
        'services', 'suppliers', 'tasks'
      ])
      and c.relrowsecurity
  ),
  15::bigint,
  'all exposed public tables have RLS enabled'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array['hardware', 'media', 'projects', 'tasks'])
  ),
  0::bigint,
  'unused legacy tables remain deny-by-default'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_cash_transactions'
  ),
  4::bigint,
  'cash transactions define policies for every mutation type'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'pro100_library_storage_%'
  ),
  4::bigint,
  'PRO100 storage defines authenticated CRUD policies'
);

set local request.jwt.claims = '{"role":"authenticated","sub":"61111111-1111-1111-1111-111111111111"}';
set local role authenticated;

select is((select count(*) from public.clients), 3::bigint, 'owner sees every client');
select is((select count(*) from public.project_cash_transactions), 3::bigint, 'owner sees cash for every client');
select is((select count(*) from public.audit_log where table_name = 'clients'), 3::bigint, 'owner sees client audit events');
select is((select count(*) from public.profiles), 4::bigint, 'owner sees all staff profiles');

select lives_ok(
  $$update public.profiles set color = '#111111' where id = '63333333-3333-3333-3333-333333333333'$$,
  'owner can update another profile without recursive RLS'
);
select is(
  (select color from public.profiles where id = '63333333-3333-3333-3333-333333333333'),
  '#111111',
  'owner profile update is persisted'
);
select lives_ok(
  $$insert into public.clients (id, full_name) values (2190, 'Temporary owner project')$$,
  'owner can create a client'
);
select lives_ok(
  $$delete from public.clients where id = 2190$$,
  'owner can delete a client'
);
select is((select count(*) from public.clients where id = 2190), 0::bigint, 'owner deletion removes the client');
select results_eq(
  $$
    select resource, item_count
    from (
      values
        ('knowledge'::text, (select count(*) from public.knowledge_base)),
        ('materials', (select count(*) from public.materials)),
        ('pro100-categories', (select count(*) from public.pro100_library_categories)),
        ('pro100-files', (select count(*) from public.pro100_library_files)),
        ('services', (select count(*) from public.services)),
        ('suppliers', (select count(*) from public.suppliers))
    ) as resources(resource, item_count)
    order by resource
  $$,
  $$values
    ('knowledge'::text, 1::bigint),
    ('materials', 1::bigint),
    ('pro100-categories', 1::bigint),
    ('pro100-files', 1::bigint),
    ('services', 1::bigint),
    ('suppliers', 1::bigint)
  $$,
  'owner can read shared staff resources'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'pro100-library'),
  1::bigint,
  'owner can read PRO100 storage'
);
reset role;

set local request.jwt.claims = '{"role":"authenticated","sub":"62222222-2222-2222-2222-222222222222"}';
set local role authenticated;
select is((select count(*) from public.clients), 3::bigint, 'assembler sees every client');
select lives_ok(
  $$insert into public.clients (id, full_name) values (2191, 'Temporary assembler project')$$,
  'assembler can create a client'
);
select results_eq(
  'delete from public.clients where id = 2191 returning id',
  'select null::bigint where false',
  'assembler cannot delete a client'
);
reset role;

set local request.jwt.claims = '{"role":"authenticated","sub":"63333333-3333-3333-3333-333333333333"}';
set local role authenticated;
select results_eq('select id from public.clients order by id', 'values (2101::bigint)', 'designer sees only the assigned client');
select results_eq(
  'select project_id from public.project_cash_transactions order by project_id',
  'values (2101::bigint)',
  'designer sees cash only for the assigned client'
);
select results_eq(
  $$update public.clients set status = 'design' where id = 2101 returning id$$,
  'values (2101::bigint)',
  'designer can update the assigned client'
);
select results_eq(
  $$update public.clients set status = 'blocked' where id = 2102 returning id$$,
  'select null::bigint where false',
  'designer cannot update a hidden client'
);
select throws_ok(
  $$insert into public.clients (id, full_name) values (2192, 'Forbidden designer project')$$,
  '42501',
  null,
  'designer cannot create a client'
);
select results_eq(
  'delete from public.clients where id = 2101 returning id',
  'select null::bigint where false',
  'designer cannot delete the assigned client'
);
select lives_ok(
  $$update public.profiles set theme = 'dark' where id = '63333333-3333-3333-3333-333333333333'$$,
  'designer can update the own profile'
);
select throws_ok(
  $$update public.profiles set role = 'owner' where id = '63333333-3333-3333-3333-333333333333'$$,
  'P0001',
  null,
  'designer cannot elevate the own role'
);
select is(
  (select role from public.profiles where id = '63333333-3333-3333-3333-333333333333'),
  'designer',
  'designer role remains unchanged'
);
select is((select count(*) from public.audit_log), 0::bigint, 'designer cannot read the audit log');
select is(
  (
    select
      (select count(*) from public.materials)
      + (select count(*) from public.services)
      + (select count(*) from public.suppliers)
      + (select count(*) from public.knowledge_base)
      + (select count(*) from public.pro100_library_categories)
      + (select count(*) from public.pro100_library_files)
  ),
  6::bigint,
  'designer can read all shared staff resources'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'pro100-library'),
  1::bigint,
  'designer can read PRO100 storage'
);
select is(
  (
    select
      (select count(*) from public.hardware)
      + (select count(*) from public.media)
      + (select count(*) from public.projects)
      + (select count(*) from public.tasks)
  ),
  0::bigint,
  'designer cannot read deny-by-default legacy tables'
);
reset role;

set local request.jwt.claims = '{"role":"authenticated","sub":"64444444-4444-4444-4444-444444444444"}';
set local role authenticated;
select results_eq('select id from public.clients order by id', 'values (2102::bigint)', 'installer sees only the assigned client');
select results_eq(
  'select project_id from public.project_cash_transactions order by project_id',
  'values (2102::bigint)',
  'installer sees cash only for the assigned client'
);
select results_eq(
  $$
    update public.project_cash_transactions
    set description = 'Updated by installer'
    where project_id = 2102
    returning project_id
  $$,
  'values (2102::bigint)',
  'installer can update cash for the assigned client'
);
select results_eq(
  $$
    update public.project_cash_transactions
    set description = 'Forbidden update'
    where project_id = 2101
    returning project_id
  $$,
  'select null::bigint where false',
  'installer cannot update cash for a hidden client'
);
select is((select count(*) from public.audit_log), 0::bigint, 'installer cannot read the audit log');
select is(
  (
    select
      (select count(*) from public.materials)
      + (select count(*) from public.services)
      + (select count(*) from public.suppliers)
      + (select count(*) from public.knowledge_base)
      + (select count(*) from public.pro100_library_categories)
      + (select count(*) from public.pro100_library_files)
  ),
  6::bigint,
  'installer can read all shared staff resources'
);
select is(
  (
    select
      (select count(*) from public.hardware)
      + (select count(*) from public.media)
      + (select count(*) from public.projects)
      + (select count(*) from public.tasks)
  ),
  0::bigint,
  'installer cannot read deny-by-default legacy tables'
);
reset role;

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select ok(not has_table_privilege('anon', 'public.clients', 'select'), 'anonymous cannot select clients');
select is((select count(*) from public.profiles), 0::bigint, 'anonymous sees no profiles');
select is(
  (
    select
      (select count(*) from public.materials)
      + (select count(*) from public.services)
      + (select count(*) from public.suppliers)
      + (select count(*) from public.knowledge_base)
      + (select count(*) from public.audit_log)
  ),
  0::bigint,
  'anonymous sees no protected business data'
);
select throws_ok(
  'select * from public.project_cash_transactions',
  '42501',
  null,
  'anonymous cash access is rejected because clients are private'
);
select ok(
  not has_table_privilege('anon', 'public.pro100_library_categories', 'select')
    and not has_table_privilege('anon', 'public.pro100_library_files', 'select'),
  'anonymous has no PRO100 metadata privileges'
);
select is(
  (select count(*) from storage.objects where bucket_id in ('project-files', 'pro100-library')),
  0::bigint,
  'anonymous sees no private storage objects'
);
select is(
  (
    select
      (select count(*) from public.hardware)
      + (select count(*) from public.media)
      + (select count(*) from public.projects)
      + (select count(*) from public.tasks)
  ),
  0::bigint,
  'anonymous cannot read deny-by-default legacy tables'
);
reset role;

select * from finish();
rollback;
