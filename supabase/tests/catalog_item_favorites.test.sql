begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

select has_column('public', 'materials', 'is_favorite', 'materials exposes is_favorite');
select has_column('public', 'services', 'is_favorite', 'services exposes is_favorite');
select col_not_null('public', 'materials', 'is_favorite', 'material favorite is not null');
select col_not_null('public', 'services', 'is_favorite', 'service favorite is not null');
select col_default_is('public', 'materials', 'is_favorite', 'false', 'material favorite defaults to false');
select col_default_is('public', 'services', 'is_favorite', 'false', 'service favorite defaults to false');

insert into auth.users (id, email)
values ('81111111-1111-1111-1111-111111111111', 'favorites-designer@example.test');
insert into public.profiles (id, full_name, role)
values ('81111111-1111-1111-1111-111111111111', 'Favorites Designer', 'designer');
insert into public.materials (id, name, price) values (9801, 'Favorite material', 10);
insert into public.services (id, name, price) values (9802, 'Favorite service', 20);

set local request.jwt.claims = '{"role":"authenticated","sub":"81111111-1111-1111-1111-111111111111"}';
set local role authenticated;
select lives_ok(
  $$update public.materials set is_favorite = true where id = 9801$$,
  'authenticated staff can favorite a material'
);
select lives_ok(
  $$update public.services set is_favorite = true where id = 9802$$,
  'authenticated staff can favorite a service'
);
select ok((select is_favorite from public.materials where id = 9801), 'material favorite persisted');
select ok((select is_favorite from public.services where id = 9802), 'service favorite persisted');
reset role;

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select is(
  (select count(*) from public.materials where id = 9801)
    + (select count(*) from public.services where id = 9802),
  0::bigint,
  'anonymous users cannot read favorite catalog rows'
);
reset role;

select * from finish();
rollback;
