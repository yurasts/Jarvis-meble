begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

select has_index(
  'public',
  'materials',
  'materials_name_normalized_unique_idx',
  'normalized material names are protected by a unique index'
);

select is(
  (
    select count(*)
    from (
      select lower(btrim(name))
      from public.materials
      group by lower(btrim(name))
      having count(*) > 1
    ) as duplicates
  ),
  0::bigint,
  'catalog has no duplicate normalized names'
);

select is(
  (
    select count(*)
    from (
      select category, upper(btrim(symbol))
      from public.materials
      where nullif(btrim(symbol), '') is not null
        and category not in ('Obrzeże', 'Laminat')
      group by category, upper(btrim(symbol))
      having count(*) > 1
    ) as duplicates
  ),
  0::bigint,
  'non-dimensional categories have no duplicate normalized symbols inside a category'
);

select is(
  (
    select count(*)
    from (
      select
        category,
        upper(btrim(symbol)),
        coalesce(
          (regexp_match(
            lower(translate(name, '×,', 'x.')),
            '([0-9]+(?:\.[0-9]+)?\s*x\s*[0-9]+(?:\.[0-9]+)?)'
          ))[1],
          lower(btrim(name))
        ) as dimension_or_name
      from public.materials
      where nullif(btrim(symbol), '') is not null
        and category in ('Obrzeże', 'Laminat')
      group by
        category,
        upper(btrim(symbol)),
        coalesce(
          (regexp_match(
            lower(translate(name, '×,', 'x.')),
            '([0-9]+(?:\.[0-9]+)?\s*x\s*[0-9]+(?:\.[0-9]+)?)'
          ))[1],
          lower(btrim(name))
        )
      having count(*) > 1
    ) as duplicates
  ),
  0::bigint,
  'ABS and laminate symbols remain unique per physical dimension'
);

select lives_ok(
  $$insert into public.materials (id, name, category, unit, price, symbol)
    values
      (9970, 'MERIVOBOX testowy komplet deduplikacji', 'Prowadnice', 'kpl', 300, 'KIT-DEDUP-1'),
      (9971, 'MERIVOBOX testowy komponent A', 'Prowadnice', 'szt', 20, 'PART-DEDUP-A'),
      (9972, 'MERIVOBOX testowy komponent B', 'Prowadnice', 'szt', 30, 'PART-DEDUP-B')$$,
  'MERIVOBOX integrity fixtures can be inserted'
);

select throws_ok(
  $$insert into public.materials (id, name, category, unit, price)
    values (9973, '  merivobox TESTOWY komplet deduplikacji  ', 'Prowadnice', 'kpl', 310)$$,
  '23505',
  null,
  'case and surrounding whitespace cannot create another catalog row'
);

select lives_ok(
  $$insert into public.materials (id, name, category, unit, price, symbol)
    values
      (9974, 'ABS U702 ST9 Kaszmir (23×0,8)', 'Obrzeże', 'mb', 2, 'ABS U702 ST9'),
      (9975, 'ABS U702 ST9 Kaszmir (43×2,0)', 'Obrzeże', 'mb', 4, 'ABS U702 ST9')$$,
  'two ABS cross-sections may safely share one decor symbol'
);

select is(
  (select count(*) from public.materials where upper(btrim(symbol)) = 'ABS U702 ST9'),
  2::bigint,
  'the symbol guard does not collapse distinct ABS dimensions'
);

select lives_ok(
  $$insert into public.material_kit_items (kit_material_id, component_material_id, quantity)
    values (9970, 9971, 1), (9970, 9972, 2)$$,
  'MERIVOBOX kit keeps both component links'
);

select is(
  (select count(*) from public.material_kit_items where kit_material_id = 9970),
  2::bigint,
  'MERIVOBOX kit component count is intact'
);

select is(
  (select sum(quantity) from public.material_kit_items where kit_material_id = 9970),
  3.00::numeric,
  'MERIVOBOX kit component quantities are intact'
);

select is(
  (
    select count(*)
    from public.material_kit_items as item
    left join public.materials as kit on kit.id = item.kit_material_id
    left join public.materials as component on component.id = item.component_material_id
    where kit.id is null or component.id is null
  ),
  0::bigint,
  'all kit references resolve to existing materials'
);

select is(
  (select count(*) from public.material_kit_items where kit_material_id = component_material_id),
  0::bigint,
  'no kit references itself after deduplication'
);

select is(
  (select count(*) from public.material_kit_items where quantity <= 0),
  0::bigint,
  'all consolidated kit quantities stay positive'
);

select * from finish();
rollback;
