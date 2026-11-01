-- Komplety MERIVOBOX i skład zestawu (material_kit_items).
--
-- Dziś katalog ma 4 gotowe komplety MERIVOBOX do kupienia jako jedna pozycja (3 istniejące + 1
-- dopisywany tu), i 29 drobnych komponentów z faktur ABO (białe) i SOLpłyt (szare) — boczki,
-- prowadnice, mocowania, zaślepki, szkło, relingi — w tej samej kategorii Prowadnice co gotowe
-- komplety, bez rozróżnienia nie da się w niej zorientować. is_kit_component oddziela "do wyboru
-- w kalkulatorze/projekcie" od "część składowa, widoczna tylko na żądanie"; material_kit_items
-- dokumentuje z czego faktycznie składa się każdy gotowy komplet (zgodnie ze specyfikacją Blum
-- dla zestawów L=500mm — patrz ADR-010).

alter table public.materials
  add column if not exists is_kit_component boolean not null default false;

comment on column public.materials.is_kit_component is
  'True dla drobnych komponentów (boczki, prowadnice, mocowania, zaślepki...) kupowanych tylko '
  'jako część gotowego zestawu (patrz material_kit_items) — domyślnie ukryte w Materiały/pickerach, '
  'nigdy nie proponowane jako samodzielna pozycja w Kalkulator szafek.';

create table if not exists public.material_kit_items (
  kit_material_id       bigint        not null references public.materials(id) on delete cascade,
  component_material_id bigint        not null references public.materials(id) on delete cascade,
  quantity               numeric(10,2) not null default 1,
  primary key (kit_material_id, component_material_id),
  constraint material_kit_items_quantity_check check (quantity > 0),
  constraint material_kit_items_not_self_check check (kit_material_id <> component_material_id)
);

create index if not exists material_kit_items_component_material_id_idx
  on public.material_kit_items (component_material_id);

alter table public.material_kit_items enable row level security;

drop policy if exists material_kit_items_staff_all on public.material_kit_items;
create policy material_kit_items_staff_all on public.material_kit_items
  for all
  to authenticated
  using (public.current_role_name() is not null)
  with check (public.current_role_name() is not null);

revoke all on table public.material_kit_items from anon;
grant select, insert, update, delete, references, trigger on table public.material_kit_items to authenticated;
grant all on table public.material_kit_items to service_role, postgres;

-- 1) Gotowe komplety MERIVOBOX: Inne -> Prowadnice, jm -> kpl (to są kupowane/wyceniane pozycje,
--    tak samo jak zwykła Prowadnica w Kalkulator szafek, nie "Inne"). Dopasowanie po nazwie, bez
--    zakładania konkretnych id — ta sama metoda co wcześniejsza migracja
--    20260927120000_classify_hinges_and_drawer_runners.sql.
update public.materials
set category = 'Prowadnice', unit = 'kpl'
where category = 'Inne'
  and name ilike 'MERIVOBOX %';

-- Czwarty komplet (M niska szuflada wewnętrzna) może jeszcze nie istnieć w katalogu — dopisywany
-- tylko gdy naprawdę go nie ma (po nazwie, nie po id).
insert into public.materials (name, category, unit, price)
select 'MERIVOBOX M niska szuflada wewnętrzna, L=500 mm, 40 kg', 'Prowadnice', 'kpl', 210.00
where not exists (
  select 1 from public.materials where name ilike 'MERIVOBOX M niska szuflada wewnętrzna%'
);

-- 2) Pełna lista 29 komponentów z faktur ABO (białe) i SOLpłyt (szare) — dokładne mapowanie
--    symbol (Artykuł, niezmieniony — skaner faktur dalej go rozpoznaje) -> czytelna nazwa, plus
--    is_kit_component = true (domyślnie ukryte w Materiały/pickerach/Kalkulator szafek).
--    Dopasowanie WYŁĄCZNIE po dokładnym symbol — bez zgadywania po wzorcu nazwy.
update public.materials m set is_kit_component = true, name = v.clean_name
from (values
  -- ABO (białe)
  ('BL-470M4502S SW',       'Boki Merivobox M L-450 białe (kpl L+P)'),
  ('BL-470M5002S SW',       'Boki Merivobox M L-500 białe (kpl L+P)'),
  ('BL-470N5002S SW',       'Boki Merivobox N L-500 białe (kpl L+P)'),
  ('BL-ZL4.450S.E. SW',     'Boxcap Merivobox E L-450 biały (kpl L+P)'),
  ('BL-ZL4M0030S SW',       'Boxcover Merivobox E biały do szkła (kpl L+P)'),
  ('BL-ZV4.1042M.SW',       'Front wewnętrzny Merivobox M biały (do docięcia)'),
  ('BL-ZI4.2ES1.SW',        'Mocowanie frontu wewnętrznego Merivobox E białe (kpl)'),
  ('BL-ZF4.1002',           'Mocowanie frontu Merivobox dolne na wkręt'),
  ('BL-ZF4.5002',           'Mocowanie frontu Merivobox górne na wkręt'),
  ('BL-450.4501B',          'Prowadnice Merivobox L-450 40kg (kpl L+P)'),
  ('BL-450.5001B',          'Prowadnice Merivobox L-500 40kg (kpl L+P)'),
  ('BL-ZR4.450RS SW',       'Reling podłużny Merivobox L-450 biały (kpl L+P)'),
  ('BL-ZR4.1059U.SW',       'Reling poprzeczny Merivobox biały (do docięcia)'),
  ('BL-ZB4E000S SW',        'Uchwyt ścianki tylnej Merivobox E biały (kpl L+P)'),
  ('BL-ZB4M000S SW',        'Uchwyt ścianki tylnej Merivobox M biały (kpl L+P)'),
  ('BL-ZB4N000S SW',        'Uchwyt ścianki tylnej Merivobox N biały (kpl L+P)'),
  ('BL-ZA4.5400.BTABD.S W', 'Zaślepka Merivobox wewnętrzna biała'),
  ('BL-ABD.1000.BTABD.SW',  'Zaślepka Merivobox zewnętrzna M biała'),
  ('BL-ZE4M410G',           'Szkło boczne Merivobox L-500 przezroczyste'),
  -- SOLpłyt (szare)
  ('470M4502S',             'Boki Merivobox M L-500 szare (kpl L+P)'),
  ('ZL4M00808',             'Boxcover Merivobox E szary do szkła (kpl L+P)'),
  ('ZE4M410G',              'Szkło boczne Merivobox L-500 przezroczyste (SOLpłyt)'),
  ('ZF4.1002',              'Mocowanie frontu Merivobox dolne na wkręt (SOLpłyt)'),
  ('ZF4.5002',              'Mocowanie frontu Merivobox górne na wkręt (SOLpłyt)'),
  ('450.5001B',             'Prowadnice Merivobox L-500 40kg (kpl L+P, SOLpłyt)'),
  ('ZB4E000S',              'Uchwyt ścianki tylnej Merivobox E szary (szt)'),
  ('ZB4M000S',              'Uchwyt ścianki tylnej Merivobox M szary (szt)'),
  ('ZA4.5400',              'Zaślepka Merivobox wewnętrzna szara'),
  ('ABD.1000',              'Zaślepka Merivobox zewnętrzna M szara')
) as v(component_symbol, clean_name)
where btrim(m.symbol) = v.component_symbol;

-- 3) Skład zestawu (material_kit_items) dla wszystkich 4 gotowych kompletów L=500mm — dokładna
--    specyfikacja Blum (ABO, białe komponenty; patrz ADR-010 dla uzasadnienia każdej pozycji).
--    4 niezależne INSERT-y (jeden na komplet) — jeśli nazwa jednego kompletu w bazie różni się od
--    wzorca, traci skład TYLKO ten komplet, a nie wszystkie cztery naraz (żadnego wspólnego JOIN).
insert into public.material_kit_items (kit_material_id, component_material_id, quantity)
select kit.id, component.id, bom.quantity
from public.materials as kit
cross join (values
  -- Kit 1 — E wysoka zewnętrzna, L=500mm, BOXCOVER ze szkłem, 40kg.
  ('BL-450.5001B',          1::numeric),
  ('BL-470M5002S SW',       1::numeric),
  ('BL-ZL4M0030S SW',       1::numeric),
  ('BL-ZE4M410G',           2::numeric),
  ('BL-ZB4E000S SW',        1::numeric),
  ('BL-ZF4.1002',           2::numeric),
  ('BL-ZF4.5002',           2::numeric),
  ('BL-ZA4.5400.BTABD.S W', 2::numeric),
  ('BL-ABD.1000.BTABD.SW',  2::numeric)
) as bom(component_symbol, quantity)
join public.materials as component on btrim(component.symbol) = bom.component_symbol and component.is_kit_component
where kit.name ilike 'MERIVOBOX E wysoka szuflada zewnętrzna%'
on conflict (kit_material_id, component_material_id) do update set quantity = excluded.quantity;

insert into public.material_kit_items (kit_material_id, component_material_id, quantity)
select kit.id, component.id, bom.quantity
from public.materials as kit
cross join (values
  -- Kit 2 — M niska zewnętrzna pod piekarnikiem, L=500mm, 40kg.
  ('BL-450.5001B',          1::numeric),
  ('BL-470M5002S SW',       1::numeric),
  ('BL-ZB4M000S SW',        1::numeric),
  ('BL-ZF4.1002',           2::numeric),
  ('BL-ZA4.5400.BTABD.S W', 2::numeric),
  ('BL-ABD.1000.BTABD.SW',  2::numeric)
) as bom(component_symbol, quantity)
join public.materials as component on btrim(component.symbol) = bom.component_symbol and component.is_kit_component
where kit.name ilike 'MERIVOBOX M niska szuflada zewnętrzna%'
on conflict (kit_material_id, component_material_id) do update set quantity = excluded.quantity;

insert into public.material_kit_items (kit_material_id, component_material_id, quantity)
select kit.id, component.id, bom.quantity
from public.materials as kit
cross join (values
  -- Kit 3 — E wysoka wewnętrzna, L=500mm, BOXCOVER ze szkłem i relingiem, 40kg.
  ('BL-450.5001B',          1::numeric),
  ('BL-470M5002S SW',       1::numeric),
  ('BL-ZL4M0030S SW',       1::numeric),
  ('BL-ZE4M410G',           2::numeric),
  ('BL-ZB4E000S SW',        1::numeric),
  ('BL-ZV4.1042M.SW',       1::numeric),
  ('BL-ZI4.2ES1.SW',        1::numeric),
  ('BL-ZR4.1059U.SW',       1::numeric),
  ('BL-ZA4.5400.BTABD.S W', 2::numeric),
  ('BL-ABD.1000.BTABD.SW',  2::numeric)
) as bom(component_symbol, quantity)
join public.materials as component on btrim(component.symbol) = bom.component_symbol and component.is_kit_component
where kit.name ilike 'MERIVOBOX E wysoka szuflada wewnętrzna%'
on conflict (kit_material_id, component_material_id) do update set quantity = excluded.quantity;

insert into public.material_kit_items (kit_material_id, component_material_id, quantity)
select kit.id, component.id, bom.quantity
from public.materials as kit
cross join (values
  -- Kit 4 — M niska wewnętrzna, L=500mm, 40kg.
  ('BL-450.5001B',          1::numeric),
  ('BL-470M5002S SW',       1::numeric),
  ('BL-ZB4M000S SW',        1::numeric),
  ('BL-ZV4.1042M.SW',       1::numeric),
  ('BL-ZA4.5400.BTABD.S W', 2::numeric),
  ('BL-ABD.1000.BTABD.SW',  2::numeric)
) as bom(component_symbol, quantity)
join public.materials as component on btrim(component.symbol) = bom.component_symbol and component.is_kit_component
where kit.name ilike 'MERIVOBOX M niska szuflada wewnętrzna%'
on conflict (kit_material_id, component_material_id) do update set quantity = excluded.quantity;
