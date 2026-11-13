-- Merge the four catalog duplicates confirmed by a read-only production audit on 2026-11-13.
--
-- Deliberately NOT unique by symbol: 137 ABS pairs legitimately share a decor symbol while using
-- different cross-sections, and two laminate formats may also share a symbol. Exact normalized
-- names are unique after this merge and are the safe database-level guard against invoice repeats.

begin;

create temporary table _material_merge_map (
  winner_id bigint primary key,
  duplicate_id bigint not null unique,
  canonical_symbol text,
  canonical_category text not null,
  canonical_price numeric not null,
  canonical_supplier text
) on commit drop;

insert into _material_merge_map (
  winner_id,
  duplicate_id,
  canonical_symbol,
  canonical_category,
  canonical_price,
  canonical_supplier
)
values
  (168, 283, 'WE14.1821.05.049', 'Akcesoria', 111.50, 'ABO'),
  (177, 284, 'BL-T51.7601',       'Akcesoria',  11.41, 'ABO'),
  (186, 246, '71B3550',            'Zawiasy',    11.70, 'ABO'),
  (290, 313, '70T3550.TL',         'Zawiasy',    13.50, 'ABO');

-- Replace only material-bearing JSON keys. A blind replacement of every matching number is unsafe:
-- calculator_state also contains dimensions and quantities that can equal a material ID.
create or replace function pg_temp.replace_material_reference(
  p_value jsonb,
  p_duplicate_id bigint,
  p_winner_id bigint,
  p_allow_item_id boolean default false,
  p_key text default null
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  replaced jsonb;
  normalized_key text := lower(coalesce(p_key, ''));
  is_material_key boolean;
begin
  if p_value is null then
    return null;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    select coalesce(
      jsonb_object_agg(
        entry.key,
        pg_temp.replace_material_reference(
          entry.value,
          p_duplicate_id,
          p_winner_id,
          p_allow_item_id,
          entry.key
        )
      ),
      '{}'::jsonb
    )
    into replaced
    from jsonb_each(p_value) as entry;
    return replaced;
  end if;

  if jsonb_typeof(p_value) = 'array' then
    select coalesce(
      jsonb_agg(
        pg_temp.replace_material_reference(
          element.value,
          p_duplicate_id,
          p_winner_id,
          p_allow_item_id,
          p_key
        )
        order by element.ordinality
      ),
      '[]'::jsonb
    )
    into replaced
    from jsonb_array_elements(p_value) with ordinality as element(value, ordinality);
    return replaced;
  end if;

  is_material_key :=
    (p_allow_item_id and normalized_key = 'id')
    or normalized_key = any (array[
      'bodymaterial',
      'frontmaterial',
      'frontmaterialtop',
      'edgematerialbody',
      'edgematerialfront',
      'edgematerialtop',
      'hinge',
      'hingesoftclose',
      'hingespring',
      'drawerrunnerexternal',
      'drawerrunnerinternal',
      'drawerexternalhigh',
      'drawerexternallow',
      'drawerinternalhigh',
      'drawerinternallow',
      'legfront',
      'legrearaxilo',
      'hdfmaterial',
      'hangermaterial',
      'tiponmaterial',
      'countertop',
      'material_id'
    ])
    or normalized_key like '%materialid'
    or normalized_key like '%hingeid'
    or normalized_key like '%runnerid';

  if not is_material_key then
    return p_value;
  end if;

  if jsonb_typeof(p_value) = 'number' and p_value = to_jsonb(p_duplicate_id) then
    return to_jsonb(p_winner_id);
  end if;

  if jsonb_typeof(p_value) = 'string' and p_value #>> '{}' = p_duplicate_id::text then
    return to_jsonb(p_winner_id::text);
  end if;

  return p_value;
end;
$function$;

do $migration$
declare
  merge_row record;
  unexpected_foreign_keys text;
begin
  -- A future FK must be explicitly merged before the duplicate can be deleted. Abort instead of
  -- relying on ON DELETE CASCADE and silently losing data.
  select string_agg(
    format('%I.%I(%I)', reference_namespace.nspname, reference_table.relname, reference_column.attname),
    ', '
  )
  into unexpected_foreign_keys
  from pg_constraint as constraint_row
  join pg_class as referenced_table
    on referenced_table.oid = constraint_row.confrelid
  join pg_namespace as referenced_namespace
    on referenced_namespace.oid = referenced_table.relnamespace
  join pg_class as reference_table
    on reference_table.oid = constraint_row.conrelid
  join pg_namespace as reference_namespace
    on reference_namespace.oid = reference_table.relnamespace
  join lateral unnest(constraint_row.conkey) as key_column(attnum)
    on true
  join pg_attribute as reference_column
    on reference_column.attrelid = reference_table.oid
   and reference_column.attnum = key_column.attnum
  where constraint_row.contype = 'f'
    and referenced_namespace.nspname = 'public'
    and referenced_table.relname = 'materials'
    and not (
      reference_namespace.nspname = 'public'
      and (
        (reference_table.relname = 'material_kit_items'
          and reference_column.attname in ('kit_material_id', 'component_material_id'))
        or (reference_table.relname = 'material_suppliers'
          and reference_column.attname = 'material_id')
      )
    );

  if unexpected_foreign_keys is not null then
    raise exception
      'Refusing material deduplication: unhandled foreign keys reference public.materials: %',
      unexpected_foreign_keys;
  end if;

  for merge_row in
    select
      merge_map.*,
      winner.name as winner_name,
      winner.unit as winner_unit,
      winner.price_history as winner_price_history,
      winner.is_favorite as winner_is_favorite,
      winner.is_kit_component as winner_is_kit_component,
      duplicate.name as duplicate_name,
      duplicate.unit as duplicate_unit,
      duplicate.price as duplicate_price,
      duplicate.supplier as duplicate_supplier,
      duplicate.created_at as duplicate_created_at,
      duplicate.price_history as duplicate_price_history,
      duplicate.is_favorite as duplicate_is_favorite,
      duplicate.is_kit_component as duplicate_is_kit_component
    from _material_merge_map as merge_map
    left join public.materials as winner on winner.id = merge_map.winner_id
    left join public.materials as duplicate on duplicate.id = merge_map.duplicate_id
    order by merge_map.winner_id
  loop
    if merge_row.duplicate_name is null then
      -- Already merged: this is the idempotent path.
      continue;
    end if;

    if merge_row.winner_name is null then
      raise exception 'Cannot merge material %: winner % does not exist',
        merge_row.duplicate_id, merge_row.winner_id;
    end if;

    if lower(btrim(merge_row.winner_name)) <> lower(btrim(merge_row.duplicate_name)) then
      raise exception 'Cannot merge material % into %: audited names no longer match (% <> %)',
        merge_row.duplicate_id,
        merge_row.winner_id,
        merge_row.duplicate_name,
        merge_row.winner_name;
    end if;

    -- Preserve both sides of kit composition. If the mapped pair already exists, quantities are
    -- added; a relationship that would become self-referential is discarded.
    with affected as (
      select
        case
          when kit_material_id = merge_row.duplicate_id then merge_row.winner_id
          else kit_material_id
        end as kit_material_id,
        case
          when component_material_id = merge_row.duplicate_id then merge_row.winner_id
          else component_material_id
        end as component_material_id,
        quantity
      from public.material_kit_items
      where kit_material_id = merge_row.duplicate_id
         or component_material_id = merge_row.duplicate_id
    ), removed as (
      delete from public.material_kit_items
      where kit_material_id = merge_row.duplicate_id
         or component_material_id = merge_row.duplicate_id
    ), consolidated as (
      select kit_material_id, component_material_id, sum(quantity) as quantity
      from affected
      where kit_material_id <> component_material_id
      group by kit_material_id, component_material_id
    )
    insert into public.material_kit_items (kit_material_id, component_material_id, quantity)
    select kit_material_id, component_material_id, quantity
    from consolidated
    on conflict (kit_material_id, component_material_id) do update
    set quantity = public.material_kit_items.quantity + excluded.quantity;

    -- Keep the preferred winner offer and retain every alternative supplier/price as a secondary
    -- offer. The legacy materials.supplier trigger continues to resolve to the preferred supplier.
    update public.material_suppliers
    set supplier_price = coalesce(supplier_price, merge_row.canonical_price)
    where material_id = merge_row.winner_id;

    insert into public.material_suppliers (
      material_id,
      supplier_id,
      supplier_sku,
      supplier_price,
      is_preferred,
      created_at
    )
    select
      merge_row.winner_id,
      duplicate_link.supplier_id,
      duplicate_link.supplier_sku,
      coalesce(duplicate_link.supplier_price, merge_row.duplicate_price),
      false,
      duplicate_link.created_at
    from public.material_suppliers as duplicate_link
    where duplicate_link.material_id = merge_row.duplicate_id
    on conflict (material_id, supplier_id) do update
    set
      supplier_sku = case
        when btrim(public.material_suppliers.supplier_sku) <> ''
          then public.material_suppliers.supplier_sku
        else excluded.supplier_sku
      end,
      supplier_price = coalesce(public.material_suppliers.supplier_price, excluded.supplier_price),
      created_at = least(public.material_suppliers.created_at, excluded.created_at);

    update public.materials as winner
    set
      category = merge_row.canonical_category,
      unit = coalesce(nullif(btrim(winner.unit), ''), merge_row.duplicate_unit, 'szt'),
      price = merge_row.canonical_price,
      supplier = coalesce(nullif(btrim(merge_row.canonical_supplier), ''), winner.supplier, merge_row.duplicate_supplier),
      symbol = coalesce(nullif(btrim(merge_row.canonical_symbol), ''), nullif(btrim(winner.symbol), '')),
      is_favorite = coalesce(merge_row.winner_is_favorite, false)
        or coalesce(merge_row.duplicate_is_favorite, false),
      is_kit_component = coalesce(merge_row.winner_is_kit_component, false)
        or coalesce(merge_row.duplicate_is_kit_component, false),
      price_history = coalesce(merge_row.winner_price_history, '[]'::jsonb)
        || coalesce(merge_row.duplicate_price_history, '[]'::jsonb)
        || case
          when merge_row.duplicate_price is distinct from merge_row.canonical_price then
            jsonb_build_array(jsonb_build_object(
              'price', merge_row.duplicate_price,
              'date', merge_row.duplicate_created_at,
              'supplier', merge_row.duplicate_supplier,
              'source', 'catalog_deduplication'
            ))
          else '[]'::jsonb
        end
    where winner.id = merge_row.winner_id;

    update public.clients
    set calc_materials = pg_temp.replace_material_reference(
      calc_materials,
      merge_row.duplicate_id,
      merge_row.winner_id,
      true
    )
    where calc_materials is not null
      and calc_materials::text like '%' || merge_row.duplicate_id::text || '%';

    update public.clients
    set calculator_state = pg_temp.replace_material_reference(
      calculator_state,
      merge_row.duplicate_id,
      merge_row.winner_id,
      false
    )
    where calculator_state is not null
      and calculator_state::text like '%' || merge_row.duplicate_id::text || '%';

    delete from public.materials
    where id = merge_row.duplicate_id;
  end loop;

  if exists (
    select 1
    from public.materials
    group by lower(btrim(name))
    having count(*) > 1
  ) then
    raise exception 'Normalized material-name duplicates remain after the audited merge';
  end if;
end;
$migration$;

create unique index if not exists materials_name_normalized_unique_idx
  on public.materials (lower(btrim(name)));

commit;
