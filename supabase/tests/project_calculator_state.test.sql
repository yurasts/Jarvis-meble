begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

select has_column('public', 'clients', 'calculator_state', 'clients (projects) exposes calculator_state');
select col_not_null('public', 'clients', 'calculator_state', 'calculator_state is not null');
select col_type_is('public', 'clients', 'calculator_state', 'jsonb', 'calculator_state is jsonb');
select col_default_is('public', 'clients', 'calculator_state', '{}', 'calculator_state defaults to {}');

insert into auth.users (id, email)
values ('91111111-1111-1111-1111-111111111111', 'calc-state-owner@example.test');
insert into public.profiles (id, full_name, role)
values ('91111111-1111-1111-1111-111111111111', 'Calc State Owner', 'owner');
insert into public.clients (id, full_name) values (9901, 'Calc state test project');

set local request.jwt.claims = '{"role":"authenticated","sub":"91111111-1111-1111-1111-111111111111"}';
set local role authenticated;
select lives_ok(
  $$update public.clients
    set calculator_state = '{"modules":[{"type":"base_doors","qty":1}],"selection":{},"settings":{"bodyFromFrontBoard":true}}'::jsonb
    where id = 9901$$,
  'owner can autosave the calculator state'
);
select is(
  (select calculator_state -> 'settings' -> 'bodyFromFrontBoard' from public.clients where id = 9901),
  'true'::jsonb,
  'calculator_state round-trips through update/select unchanged'
);
reset role;

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select is(
  (select count(*) from public.clients where id = 9901),
  0::bigint,
  'anonymous users cannot read the project (and so cannot read calculator_state either)'
);
reset role;

select * from finish();
rollback;
