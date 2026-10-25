begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email)
values
  ('a1111111-1111-4111-8111-111111111111', 'activity-owner@example.test'),
  ('a2222222-2222-4222-8222-222222222222', 'activity-designer@example.test');

insert into public.profiles (id, full_name, role)
values
  ('a1111111-1111-4111-8111-111111111111', 'Activity Owner', 'owner'),
  ('a2222222-2222-4222-8222-222222222222', 'Activity Designer', 'designer');

insert into public.user_presence (user_id, last_seen_at, last_device_type, last_user_agent)
values
  ('a1111111-1111-4111-8111-111111111111', now(), 'desktop', 'Chrome · Windows'),
  ('a2222222-2222-4222-8222-222222222222', now(), 'desktop', 'Firefox · Windows');

insert into public.user_activity_logs (
  id, user_id, user_email, user_name, event_type, device_type, user_agent, created_at
)
values
  (
    'a3111111-1111-4311-8311-111111111111',
    'a1111111-1111-4111-8111-111111111111',
    'activity-owner@example.test',
    'Activity Owner',
    'sign_in',
    'desktop',
    'Chrome · Windows',
    now()
  ),
  (
    'a3222222-2222-4322-8322-222222222222',
    'a2222222-2222-4222-8222-222222222222',
    'activity-designer@example.test',
    'Activity Designer',
    'session_start',
    'desktop',
    'Firefox · Windows',
    now()
  );

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('user_activity_logs', 'user_presence')
      and c.relrowsecurity
  ),
  2::bigint,
  'both activity tables enforce RLS'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('user_activity_logs', 'user_presence')
      and cmd = 'SELECT'
      and policyname in ('user_activity_logs_select_owner', 'user_presence_select_owner')
  ),
  2::bigint,
  'activity tables expose only their owner select policies'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.record_user_activity(text,text,text)'::regprocedure
  ),
  'activity RPC is SECURITY DEFINER'
);

set local request.jwt.claims = '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111"}';
set local role authenticated;

select is((select count(*) from public.user_activity_logs), 2::bigint, 'owner sees all activity logs');
select is((select count(*) from public.user_presence), 2::bigint, 'owner sees every last-seen row');

reset role;
set local request.jwt.claims = '{"role":"authenticated","sub":"a2222222-2222-4222-8222-222222222222"}';
set local role authenticated;

select is((select count(*) from public.user_activity_logs), 0::bigint, 'non-owner sees no activity logs');
select is((select count(*) from public.user_presence), 0::bigint, 'non-owner sees no last-seen rows');

select throws_ok(
  $$
    insert into public.user_activity_logs (
      user_id, event_type, device_type
    ) values (
      'a2222222-2222-4222-8222-222222222222', 'sign_in', 'mobile'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot insert activity rows directly'
);

select throws_ok(
  $$select public.record_user_activity('invalid', 'mobile', 'Safari · iOS')$$,
  '22023',
  null,
  'activity RPC rejects unknown event types'
);

select lives_ok(
  $$select public.record_user_activity('session_start', 'mobile', 'Safari · iOS')$$,
  'authenticated user can update own activity through the RPC'
);

reset role;

select is(
  (select last_device_type from public.user_presence where user_id = 'a2222222-2222-4222-8222-222222222222'),
  'mobile',
  'RPC updates the caller device type'
);
select is(
  (select last_user_agent from public.user_presence where user_id = 'a2222222-2222-4222-8222-222222222222'),
  'Safari · iOS',
  'RPC updates the caller user agent'
);
select is(
  (select count(*) from public.user_activity_logs where user_id = 'a2222222-2222-4222-8222-222222222222'),
  1::bigint,
  'recent activity suppresses a duplicate session-start log'
);

update public.user_activity_logs
set created_at = now() - interval '31 minutes'
where user_id = 'a2222222-2222-4222-8222-222222222222';

set local request.jwt.claims = '{"role":"authenticated","sub":"a2222222-2222-4222-8222-222222222222"}';
set local role authenticated;
select lives_ok(
  $$select public.record_user_activity('session_start', 'mobile', 'Safari · iOS')$$,
  'session-start is logged again after thirty minutes'
);
reset role;

select is(
  (select count(*) from public.user_activity_logs where user_id = 'a2222222-2222-4222-8222-222222222222'),
  2::bigint,
  'session-start history contains the new thirty-minute entry'
);

set local request.jwt.claims = '{"role":"authenticated","sub":"a2222222-2222-4222-8222-222222222222"}';
set local role authenticated;
select lives_ok(
  $$select public.record_user_activity('sign_in', 'desktop', 'Chrome · Linux')$$,
  'sign-in is always recorded even after recent activity'
);
reset role;

select is(
  (select count(*) from public.user_activity_logs where user_id = 'a2222222-2222-4222-8222-222222222222'),
  3::bigint,
  'sign-in adds an immutable history row'
);
select is(
  (
    select user_email
    from public.user_activity_logs
    where user_id = 'a2222222-2222-4222-8222-222222222222'
    order by created_at desc
    limit 1
  ),
  'activity-designer@example.test',
  'RPC snapshots the authenticated email'
);
select is(
  (
    select user_name
    from public.user_activity_logs
    where user_id = 'a2222222-2222-4222-8222-222222222222'
    order by created_at desc
    limit 1
  ),
  'Activity Designer',
  'RPC snapshots the profile name'
);

set local request.jwt.claims = '{"role":"authenticated","sub":"a2222222-2222-4222-8222-222222222222"}';
set local role authenticated;
select lives_ok(
  $$select public.record_user_activity('sign_in', 'desktop', 'Chrome · Linux')$$,
  'a repeated sign-in on the same device is accepted'
);
reset role;

select is(
  (select count(*) from public.user_activity_logs where user_id = 'a2222222-2222-4222-8222-222222222222'),
  3::bigint,
  'a repeated sign-in within five minutes on the same device is not logged twice'
);

update public.user_activity_logs
set created_at = now() - interval '6 minutes'
where user_id = 'a2222222-2222-4222-8222-222222222222'
  and event_type = 'sign_in';

set local request.jwt.claims = '{"role":"authenticated","sub":"a2222222-2222-4222-8222-222222222222"}';
set local role authenticated;
select lives_ok(
  $$select public.record_user_activity('sign_in', 'desktop', 'Chrome · Linux')$$,
  'a later sign-in on the same device is accepted'
);
reset role;

select is(
  (select count(*) from public.user_activity_logs where user_id = 'a2222222-2222-4222-8222-222222222222'),
  4::bigint,
  'a sign-in after the five-minute window adds a new history row'
);

select throws_ok(
  $$select public.record_user_activity('session_start', 'tablet', 'Unknown')$$,
  '22023',
  null,
  'activity RPC rejects unknown device types'
);

select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'user_activity_logs' and grantee = 'authenticated' and privilege_type <> 'SELECT'),
  0::bigint,
  'authenticated role has no direct mutation grants on activity logs'
);

select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'user_presence' and grantee = 'authenticated' and privilege_type <> 'SELECT'),
  0::bigint,
  'authenticated role has no direct mutation grants on presence data'
);

select * from finish();
rollback;
