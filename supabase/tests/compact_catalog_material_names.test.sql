begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

select has_function(
  'public',
  'compact_catalog_material_symbol',
  array['text', 'text'],
  'compact symbol extractor exists'
);

select has_function(
  'public',
  'compact_catalog_material_name',
  array['text', 'text', 'text', 'boolean'],
  'compact material-name normalizer exists'
);

select is(
  public.compact_catalog_material_symbol('Uchwyt meblowy LKW-5 (30/059)', null),
  '30/059',
  'a final manufacturer article is extracted into an empty symbol'
);

select is(
  public.compact_catalog_material_symbol('Produkt (71B3550)', 'EXISTING'),
  'EXISTING',
  'an existing non-empty symbol is authoritative'
);

select is(
  public.compact_catalog_material_symbol('Nóżka standardowa (czarna)', null),
  null,
  'a descriptive parenthesis is not mistaken for an article'
);

select is(
  public.compact_catalog_material_name(
    'Blum CLIP top BLUMOTION — zawias 110° nakładany, z cichym domykiem (71B3550)',
    'Zawiasy', '71B3550', false
  ),
  'Zawias 110° nakładany, z cichym domykiem Blum CLIP top BLUMOTION',
  'hinge features precede the Blum series and the article is omitted'
);

select is(
  public.compact_catalog_material_name(
    'Blum CLIP top — zawias 110° nakładany, bez sprężyny do TIP-ON (70T3550.TL)',
    'Zawiasy', '70T3550.TL', false
  ),
  'Zawias 110° nakładany, bez sprężyny (TIP-ON) Blum CLIP top',
  'TIP-ON hinge wording is compact and consistent'
);

select is(
  public.compact_catalog_material_name(
    'Blum TANDEM — prowadnica pełnego wysuwu L=500 mm, z TIP-ON, 30 kg (550F5000B)',
    'Prowadnice', '550F5000B', false
  ),
  'Prowadnica pełnego wysuwu L=500 mm, z TIP-ON, 30 kg Blum TANDEM',
  'runner features precede the Blum family'
);

select is(
  public.compact_catalog_material_name(
    'Płyta meblowa H3157 ST12 Dąb Vicenza — 2800×2070×18 mm',
    'Płyta', 'PL H3157 ST12', false
  ),
  'PL H3157 ST12 Dąb Vicenza',
  'standard board dimensions are implicit'
);

select is(
  public.compact_catalog_material_name(
    'Płyta HDF biała jednostronna — 2850×2070×3 mm',
    'HDF', null, false
  ),
  'HDF Biała (3 mm)',
  'HDF keeps only its meaningful thickness'
);

select is(
  public.compact_catalog_material_name(
    'Obrzeże ABS U702 ST9 Kaszmir — 43×2,0 mm',
    'Obrzeże', 'ABS U702 ST9', false
  ),
  'ABS U702 ST9 Kaszmir (43×2,0)',
  'ABS keeps its cross-section in compact parentheses'
);

select is(
  public.compact_catalog_material_name(
    'Camar 807 — zawieszka meblowa ukryta 240 kg, biała (komplet)',
    'Akcesoria', 'CAMAR 807', false
  ),
  'Zawieszka meblowa ukryta 240 kg, biała Camar 807',
  'Camar model remains after the component description'
);

select is(
  public.compact_catalog_material_name(
    'Häfele AXILO — nóżka cokołowa regulowana H=100 mm (90–120 mm), z głowicą',
    'Akcesoria', 'Axilo HAFELE H-100', false
  ),
  'Nóżka cokołowa regulowana H=100 mm Häfele AXILO',
  'AXILO keeps height and removes warehouse detail'
);

select is(
  public.compact_catalog_material_name(
    'Blum TIP-ON do drzwi — wersja długa z magnesem, biała (956A1004)',
    'Akcesoria', '956A1004', false
  ),
  'Odbojnik TIP-ON długi z magnesem, biały Blum',
  'TIP-ON accessory uses the requested compact wording'
);

select is(
  public.compact_catalog_material_name(
    'Nóżka meblowa cokołowa H=100 mm, standardowa (czarna)',
    'Akcesoria', null, false
  ),
  'Nóżka meblowa cokołowa H=100 mm, standardowa',
  'ordinary leg omits redundant colour'
);

select is(
  public.compact_catalog_material_name(
    'Prowadnice Merivobox L-500 40kg (kpl L+P, SOLpłyt)',
    'Prowadnice', '450.5001B', true
  ),
  'Prowadnice Merivobox L-500 40kg (kpl L+P, SOLpłyt)',
  'MERIVOBOX component wording is preserved'
);

select is(
  public.compact_catalog_material_name('PL H3157 ST12 Dąb Vicenza', 'Płyta', 'PL H3157 ST12', false),
  'PL H3157 ST12 Dąb Vicenza',
  'board normalization is idempotent'
);

select is(
  public.compact_catalog_material_name('ABS U702 ST9 Kaszmir (43×2,0)', 'Obrzeże', 'ABS U702 ST9', false),
  'ABS U702 ST9 Kaszmir (43×2,0)',
  'edge normalization is idempotent'
);

insert into public.materials (id, name, category, unit, price, supplier, symbol, is_kit_component)
values
  (9960, 'Uchwyt meblowy LKW-5 (30/059)', 'Akcesoria', 'szt', 33.97, 'POLTAR II', null, false),
  (9961, 'MERIVOBOX E wysoka szuflada zewnętrzna, L=500 mm, 40 kg', 'Prowadnice', 'kpl', 300, 'ABO', null, false),
  (9962, 'Prowadnice Merivobox L-500 40kg (kpl L+P)', 'Prowadnice', 'kpl', 80, 'ABO', 'BL-450.5001B', true),
  (9963, 'Produkt testowy (12345)', 'Akcesoria', 'szt', 10, 'ABO', 'KEEP-ME', false);

insert into public.material_kit_items (kit_material_id, component_material_id, quantity)
values (9961, 9962, 1);

select lives_ok(
  $$update public.materials as material
    set
      symbol = public.compact_catalog_material_symbol(material.name, material.symbol),
      name = public.compact_catalog_material_name(
        material.name,
        material.category,
        material.symbol,
        material.is_kit_component
      )
    where material.id between 9960 and 9963$$,
  'compact update runs safely on fixture rows'
);

select is((select id from public.materials where id = 9960), 9960::bigint, 'material ID is preserved');
select is((select price from public.materials where id = 9960), 33.97::numeric, 'price is preserved');
select is((select unit from public.materials where id = 9960), 'szt', 'unit is preserved');
select is((select supplier from public.materials where id = 9960), 'POLTAR II', 'supplier is preserved');
select is(
  (select count(*) from public.material_kit_items where kit_material_id = 9961 and component_material_id = 9962),
  1::bigint,
  'material_kit_items relation is preserved'
);
select is((select symbol from public.materials where id = 9960), '30/059', 'missing symbol receives the article');
select is((select name from public.materials where id = 9960), 'Uchwyt meblowy LKW-5', 'moved article is removed from name');
select is((select symbol from public.materials where id = 9963), 'KEEP-ME', 'existing symbol is not overwritten');

select * from finish();
rollback;
