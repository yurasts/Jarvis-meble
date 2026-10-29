begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email)
values
  ('a1111111-1111-1111-1111-111111111111', 'supplier-owner@example.test'),
  ('a2222222-2222-2222-2222-222222222222', 'supplier-designer@example.test');

insert into public.profiles (id, full_name, role)
values
  ('a1111111-1111-1111-1111-111111111111', 'Supplier Owner', 'owner'),
  ('a2222222-2222-2222-2222-222222222222', 'Supplier Designer', 'designer');

insert into public.materials (id, name, price, supplier)
values (9701, 'Supplier test board', 100, null);

insert into public.suppliers (id, name, address)
values
  ('b1111111-1111-1111-1111-111111111111', 'Alfa', 'Gdańsk'),
  ('b2222222-2222-2222-2222-222222222222', 'Beta', 'Warszawa');

select has_table('public', 'suppliers', 'supplier directory exists');
select has_table('public', 'material_suppliers', 'material supplier join table exists');
select col_type_is('public', 'suppliers', 'id', 'uuid', 'supplier identifiers are UUIDs');
select col_type_is('public', 'material_suppliers', 'material_id', 'bigint', 'material FK matches the live bigint materials key');
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'suppliers'),
  1::bigint,
  'suppliers has an authenticated staff RLS policy'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'material_suppliers'),
  1::bigint,
  'material_suppliers has an authenticated staff RLS policy'
);
select ok(not has_table_privilege('anon', 'public.suppliers', 'select'), 'anonymous cannot read suppliers');
select ok(not has_table_privilege('anon', 'public.material_suppliers', 'select'), 'anonymous cannot read material links');

set local role anon;
select throws_ok(
  $$select * from public.suppliers$$,
  '42501',
  null,
  'anonymous requests are rejected before supplier data can be exposed'
);
reset role;

set local request.jwt.claims = '{"role":"authenticated","sub":"a1111111-1111-1111-1111-111111111111"}';
set local role authenticated;

select lives_ok(
  $$insert into public.material_suppliers (material_id, supplier_id, is_preferred)
    values (9701, 'b1111111-1111-1111-1111-111111111111', true)$$,
  'owner links a preferred supplier'
);
select is((select supplier from public.materials where id = 9701), 'Alfa', 'preferred link backfills the legacy supplier name');
select lives_ok(
  $$insert into public.material_suppliers (material_id, supplier_id, is_preferred)
    values (9701, 'b2222222-2222-2222-2222-222222222222', false)$$,
  'one material accepts a second supplier'
);
select is((select count(*) from public.material_suppliers where material_id = 9701), 2::bigint, 'both supplier links are retained');
select lives_ok(
  $$select * from public.set_material_suppliers(
    9701,
    '[{"supplier_id":"b1111111-1111-1111-1111-111111111111","is_preferred":false},{"supplier_id":"b2222222-2222-2222-2222-222222222222","is_preferred":true}]'::jsonb
  )$$,
  'atomic link replacement changes the preferred supplier'
);
select is((select supplier from public.materials where id = 9701), 'Beta', 'legacy supplier follows the new preferred link');
select lives_ok(
  $$update public.suppliers set name = 'Beta Nowa' where id = 'b2222222-2222-2222-2222-222222222222'$$,
  'staff may rename a supplier'
);
select is((select supplier from public.materials where id = 9701), 'Beta Nowa', 'renaming the preferred supplier updates legacy materials.supplier');
select throws_ok(
  $$insert into public.suppliers (name) values ('  beta nowa  ')$$,
  '23505',
  null,
  'supplier names are unique without case or surrounding whitespace'
);
reset role;

set local request.jwt.claims = '{"role":"authenticated","sub":"a2222222-2222-2222-2222-222222222222"}';
set local role authenticated;
select results_eq(
  $$update public.suppliers
      set contact_person = 'Jan', updated_at = '2000-01-01 00:00:00+00'
      where id = 'b1111111-1111-1111-1111-111111111111'
      returning contact_person$$,
  $$values ('Jan'::text)$$,
  'another authenticated staff role may update the shared directory'
);
select ok(
  (select updated_at > '2000-01-01 00:00:00+00'::timestamptz
   from public.suppliers
   where id = 'b1111111-1111-1111-1111-111111111111'),
  'supplier updates refresh updated_at without requiring an updated_by column'
);
reset role;

select * from finish();
rollback;
