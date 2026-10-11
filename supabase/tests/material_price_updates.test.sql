begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email)
values
  ('44444444-4444-4444-4444-444444444444', 'price-owner@example.test'),
  ('55555555-5555-5555-5555-555555555555', 'price-designer@example.test');

insert into public.profiles (id, full_name, role)
values
  ('44444444-4444-4444-4444-444444444444', 'Price Owner', 'owner'),
  ('55555555-5555-5555-5555-555555555555', 'Price Designer', 'designer');

insert into public.materials (id, name, price)
values
  (9001, 'Atomic material one', 10),
  (9002, 'Atomic material two', 20);

select ok(
  not has_function_privilege('anon', 'public.update_material_prices(jsonb)', 'execute'),
  'anon cannot execute material price update RPC'
);

set local request.jwt.claims = '{"role":"authenticated","sub":"44444444-4444-4444-4444-444444444444"}';
set local role authenticated;
select results_eq(
  $$select id, price from public.update_material_prices('[
    {"material_id":9001,"expected_price":10,"new_price":11},
    {"material_id":9002,"expected_price":20,"new_price":21}
  ]'::jsonb) order by id$$,
  'values (9001::bigint, 11::numeric), (9002::bigint, 21::numeric)',
  'owner updates a price batch'
);
select results_eq(
  'select id, price from public.materials where id in (9001, 9002) order by id',
  'values (9001::bigint, 11::numeric), (9002::bigint, 21::numeric)',
  'all batch prices are persisted'
);
select results_eq(
  'select id, jsonb_array_length(price_history) from public.materials where id in (9001, 9002) order by id',
  'values (9001::bigint, 1), (9002::bigint, 1)',
  'previous prices are appended to history'
);
reset role;

set local request.jwt.claims = '{"role":"authenticated","sub":"55555555-5555-5555-5555-555555555555"}';
set local role authenticated;
select throws_ok(
  $$select public.update_material_prices('[
    {"material_id":9001,"expected_price":11,"new_price":12},
    {"material_id":9999,"expected_price":1,"new_price":2}
  ]'::jsonb)$$,
  'P0001',
  'Material price update rejected for id 9999',
  'a rejected row aborts the entire batch'
);
select is(
  (select price from public.materials where id = 9001),
  11::numeric,
  'the earlier price update is rolled back'
);
select is(
  (select jsonb_array_length(price_history) from public.materials where id = 9001),
  1,
  'the earlier history update is rolled back'
);
select throws_ok(
  $$select public.update_material_prices('{"material_id":9001}'::jsonb)$$,
  '22023',
  'Material price updates must be a JSON array',
  'non-array payloads are rejected'
);
reset role;

select * from finish();
rollback;
