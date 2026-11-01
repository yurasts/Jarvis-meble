begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email)
values ('c1111111-1111-1111-1111-111111111111', 'kit-owner@example.test');
insert into public.profiles (id, full_name, role)
values ('c1111111-1111-1111-1111-111111111111', 'Kit Owner', 'owner');

insert into public.materials (id, name, category, unit, price, symbol)
values
  (9601, 'MERIVOBOX E wysoka szuflada zewnętrzna', 'Prowadnice', 'kpl', 300, null),
  (9602, 'Prowadnice Merivobox L-500 40kg (kpl L+P)', 'Prowadnice', 'kpl', 25, 'BL-450.5001B'),
  (9603, 'Boxcover Merivobox E biały do szkła (kpl L+P)', 'Prowadnice', 'kpl', 10, 'BL-ZL4M0030S SW');

select has_column('public', 'materials', 'is_kit_component', 'materials exposes is_kit_component');
select col_not_null('public', 'materials', 'is_kit_component', 'is_kit_component is not null');
select col_default_is('public', 'materials', 'is_kit_component', 'false', 'is_kit_component defaults to false');
select has_table('public', 'material_kit_items', 'material_kit_items exists');
select col_type_is('public', 'material_kit_items', 'kit_material_id', 'bigint', 'kit FK matches the live bigint materials key');
select col_type_is('public', 'material_kit_items', 'component_material_id', 'bigint', 'component FK matches the live bigint materials key');
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'material_kit_items'),
  1::bigint,
  'material_kit_items has an authenticated staff RLS policy'
);
select ok(not has_table_privilege('anon', 'public.material_kit_items', 'select'), 'anonymous cannot read kit composition');

set local role anon;
select throws_ok(
  $$select * from public.material_kit_items$$,
  '42501',
  null,
  'anonymous requests are rejected before kit composition can be exposed'
);
reset role;

set local request.jwt.claims = '{"role":"authenticated","sub":"c1111111-1111-1111-1111-111111111111"}';
set local role authenticated;

select lives_ok(
  $$insert into public.material_kit_items (kit_material_id, component_material_id, quantity)
    values (9601, 9602, 1), (9601, 9603, 1)$$,
  'owner links two components to a kit'
);
select is((select count(*) from public.material_kit_items where kit_material_id = 9601), 2::bigint, 'both component links are retained');
select throws_ok(
  $$insert into public.material_kit_items (kit_material_id, component_material_id, quantity) values (9601, 9601, 1)$$,
  '23514',
  null,
  'a material cannot be listed as its own kit component'
);
select throws_ok(
  $$insert into public.material_kit_items (kit_material_id, component_material_id, quantity) values (9601, 9602, 0)$$,
  '23514',
  null,
  'quantity must be positive'
);
select lives_ok(
  $$delete from public.materials where id = 9602$$,
  'deleting a component cascades its kit link instead of being blocked by the FK'
);
select is((select count(*) from public.material_kit_items where kit_material_id = 9601), 1::bigint, 'deleting a component removes only its own link');
reset role;

select * from finish();
rollback;
