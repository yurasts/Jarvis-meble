begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

select has_function(
  'public',
  'catalog_literary_material_name',
  array['text', 'text', 'text', 'boolean'],
  'catalog literary-name normalizer exists'
);

select is(
  public.catalog_literary_material_name('W960 SM NEW 2800x2070x18 Biały Klasyczny', 'Płyta', 'PL W960 SM', false),
  'Płyta meblowa W960 SM Biały Klasyczny — 2800×2070×18 mm',
  'board warehouse fragments are removed and dimensions use catalogue typography'
);

select is(
  public.catalog_literary_material_name('ABS W960 SM REHAU 23x0,8mm Biały Bazowy (76873)', 'Obrzeże', 'ABS W960 SM', false),
  'Obrzeże ABS W960 SM Biały — 23×0,8 mm',
  'edge supplier fragments are removed without losing the decor code'
);

select is(
  public.catalog_literary_material_name('BLUM Zawias 110'' nakładany ze spowalniaczem na wkręty 71B3550', 'Zawiasy', '71B3550', false),
  'Blum CLIP top BLUMOTION — zawias 110° nakładany, z cichym domykiem (71B3550)',
  'hinge is matched by its factory article'
);

select is(
  public.catalog_literary_material_name('BLUM Prowadnica TANDEM CW TIP-ON 500mm 30kg 550F5000B', 'Prowadnice', '550F5000B', false),
  'Blum TANDEM — prowadnica pełnego wysuwu L=500 mm, z TIP-ON, 30 kg (550F5000B)',
  'TANDEM family is normalized by article pattern'
);

select is(
  public.catalog_literary_material_name('HDF BIAŁY (1.0) 2850x2070x3mm', 'HDF', null, false),
  'Płyta HDF biała jednostronna — 2850×2070×3 mm',
  'HDF receives a literary catalogue name'
);

select is(
  public.catalog_literary_material_name('Nóżka Axilo HAFELE H-100 mm (90-120 mm) z główką mocującą', 'Akcesoria', 'Axilo HAFELE H-100', false),
  'Häfele AXILO — nóżka cokołowa regulowana H=100 mm (90–120 mm), z głowicą',
  'AXILO article remains searchable in the clean name'
);

select is(
  public.catalog_literary_material_name('ZAWIESZKA CAMAR 807 BIAŁA 240KG - 1 KOMPLET', 'Akcesoria', 'CAMAR 807', false),
  'Camar 807 — zawieszka meblowa ukryta 240 kg, biała (komplet)',
  'Camar kit is normalized by symbol'
);

select is(
  public.catalog_literary_material_name('Prowadnice Merivobox L-500 40kg (kpl L+P, SOLpłyt)', 'Prowadnice', '450.5001B', true),
  'Prowadnice Merivobox L-500 40kg (kpl L+P, SOLpłyt)',
  'existing MERIVOBOX component names are intentionally preserved'
);

select is(
  public.catalog_literary_material_name(
    'Płyta meblowa W960 SM Biały Klasyczny — 2800×2070×18 mm',
    'Płyta',
    'PL W960 SM',
    false
  ),
  'Płyta meblowa W960 SM Biały Klasyczny — 2800×2070×18 mm',
  'normalization is idempotent'
);

insert into public.materials (id, name, category, unit, price, symbol, is_kit_component)
values
  (9850, 'W960 SM NEW 2800x2070x18 Biały Klasyczny', 'Płyta', 'szt', 100, 'PL W960 SM', false),
  (9851, 'MERIVOBOX E wysoka szuflada zewnętrzna, L=500 mm, BOXCOVER ze szkłem, 40 kg', 'Prowadnice', 'kpl', 300, null, false),
  (9852, 'Prowadnice Merivobox L-500 40kg (kpl L+P, SOLpłyt)', 'Prowadnice', 'kpl', 80, '450.5001B', true);

insert into public.material_kit_items (kit_material_id, component_material_id, quantity)
values (9851, 9852, 1);

select lives_ok(
  $$update public.materials as material
    set name = public.catalog_literary_material_name(
      material.name,
      material.category,
      material.symbol,
      material.is_kit_component
    )
    where material.id between 9850 and 9852$$,
  'catalog update runs safely on fixture rows'
);

select is(
  (select id from public.materials where name = 'Płyta meblowa W960 SM Biały Klasyczny — 2800×2070×18 mm'),
  9850::bigint,
  'renaming preserves the material ID'
);

select is(
  (select count(*) from public.material_kit_items where kit_material_id = 9851 and component_material_id = 9852),
  1::bigint,
  'renaming preserves material_kit_items links'
);

select is(
  (select name from public.materials where id = 9852),
  'Prowadnice Merivobox L-500 40kg (kpl L+P, SOLpłyt)',
  'the MERIVOBOX component row remains unchanged after UPDATE'
);

select * from finish();
rollback;
