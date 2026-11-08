-- Czytelne, katalogowe nazwy materiałów bez zmiany ich identyfikatorów, cen, jednostek,
-- dostawców ani symboli. Funkcja jest celowo deterministyczna: pozwala przetestować ten sam
-- słownik, którego używa jednorazowy UPDATE, a także bezpiecznie ponowić migrację.

create or replace function public.catalog_literary_material_name(
  p_name text,
  p_category text,
  p_symbol text,
  p_is_kit_component boolean
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_clean text;
  v_match text[];
  v_work text;
  v_code text;
  v_decor text;
begin
  if p_name is null then
    return null;
  end if;

  -- Komponenty MERIVOBOX zostały już świadomie opisane i powiązane przez
  -- 20261101120000_material_kits_and_merivobox_cleanup.sql. Nie wolno ich ponownie przepisywać.
  if coalesce(p_is_kit_component, false) then
    return p_name;
  end if;

  -- Okucia i akcesoria: dopasowanie po zachowanym symbolu producenta/dostawcy. Jeden symbol
  -- może występować w kilku rekordach ofertowych (np. 71B3550), ale oznacza ten sam produkt.
  select mapping.clean_name
  into v_clean
  from (values
    ('17387130',       null, 'Blum Prowadnik prosty CLIP, dystans 1 mm, na wkręty (17387130)'),
    ('17316000',       null, 'Blum Prowadnik krzyżakowy CLIP, dystans 1 mm, na wkręty (17316000)'),
    ('177H3100E',      null, 'Blum Prowadnik krzyżakowy CLIP, dystans 0 mm, regulacja mimośrodowa, na wkręty (177H3100E)'),
    ('173L6100',       null, 'Blum Prowadnik krzyżakowy CLIP, dystans 0 mm, na wkręty (173L6100)'),
    ('173L8100',       null, 'Blum Prowadnik krzyżakowy CLIP, dystans 0 mm, na wkręty Euro (173L8100)'),
    ('175H3100',       null, 'Blum Prowadnik prosty CLIP do AVENTOS HF/HK-S, onyks, na wkręty (175H3100)'),
    ('7BR9556',        null, 'Blum CLIP top BLUMOTION — zawias półnakładany, z cichym domykiem (7BR9556)'),
    ('BL-Z10NA30EE',   null, 'Blum SERVO-DRIVE uno — jednostka napędowa (BL-Z10NA30EE)'),
    ('BL-T51.1700.04.L', null, 'Blum TANDEM — sprzęgło lewe (BL-T51.1700.04.L)'),
    ('BL-T51.1700.04.R', null, 'Blum TANDEM — sprzęgło prawe (BL-T51.1700.04.R)'),
    ('BL-T51.7601',    null, 'Blum MOVENTO — komplet sprzęgieł lewy + prawy (BL-T51.7601)'),
    ('BL-T51.760',     null, 'Blum MOVENTO — komplet sprzęgieł lewy + prawy (BL-T51.760)'),
    ('956A1004',       null, 'Blum TIP-ON do drzwi — wersja długa z magnesem, biała (956A1004)'),
    ('956.1004',       null, 'Blum TIP-ON do drzwi — wersja krótka z magnesem, biała (956.1004)'),
    ('BL-T60L7540',    null, 'Blum TIP-ON do MOVENTO/LEGRABOX — L=450–750 mm, czarny (BL-T60L7540)'),
    ('356001',         null, 'Odbojnik magnetyczny TIP-ON Strong — mocny, biały (356001)'),
    ('356.12.750',     null, 'Odbojnik magnetyczny TIP-ON Strong IF — mocny, biały (356.12.750)'),

    ('71B3550',        null, 'Blum CLIP top BLUMOTION — zawias 110° nakładany, z cichym domykiem (71B3550)'),
    ('71T3550',        null, 'Blum CLIP top — zawias 110° nakładany, ze sprężyną (71T3550)'),
    ('71B3650',        null, 'Blum CLIP top BLUMOTION — zawias 110° półnakładany, z cichym domykiem (71B3650)'),
    ('71B3750',        null, 'Blum CLIP top BLUMOTION — zawias 110° wpuszczany, z cichym domykiem (71B3750)'),
    ('79B355B',        null, 'Blum CLIP top BLUMOTION — zawias kątowy −45°, z cichym domykiem (79B355B)'),
    ('79B3559',        null, 'Blum CLIP top BLUMOTION — zawias kątowy +30°, typ II, z cichym domykiem (79B3559)'),
    ('79B3558',        null, 'Blum CLIP top BLUMOTION — zawias kątowy +45°, typ II, z cichym domykiem (79B3558)'),
    ('7BR9560',        null, 'Blum CLIP top — zawias półnakładany, bez sprężyny do TIP-ON (7BR9560)'),
    ('7DT3550',        null, 'Blum CLIP top — zawias 110° nakładany, bez sprężyny do TIP-ON (70T3550; zestaw 7DT3550)'),
    ('7JB3550',        null, 'Blum CLIP top BLUMOTION — komplet: zawias 110° nakładany (71B3550) + prowadnik CLIP (173L6100), zestaw 7JB3550'),
    ('71B3850',        null, 'Blum CLIP top BLUMOTION — zawias 107° nakładany, z płytką puszką (71B3850)'),
    ('70T3550.TL',     null, 'Blum CLIP top — zawias 110° nakładany, bez sprężyny do TIP-ON (70T3550.TL)'),
    ('70T3650.TL',     null, 'Blum CLIP top — zawias 110° półnakładany, bez sprężyny do TIP-ON (70T3650.TL)'),
    ('71B3590',        null, 'Blum CLIP top BLUMOTION — zawias 110° nakładany, mocowanie INSERTA (71B3590)'),
    ('70T3750.TL',     null, 'Blum CLIP top — zawias 110° wpuszczany, bez sprężyny do TIP-ON (70T3750.TL)'),
    ('71B7650',        null, 'Blum CLIP top BLUMOTION — zawias 155° półnakładany, z zerowym uskokiem (71B7650)'),
    ('71B7550',        null, 'Blum CLIP top BLUMOTION — zawias 155° nakładany, z zerowym uskokiem do szuflad wewnętrznych (71B7550)'),
    ('71B7590',        null, 'Blum CLIP top BLUMOTION — zawias 155° nakładany, z zerowym uskokiem, mocowanie INSERTA (71B7590)'),
    ('70T7550.TL',     null, 'Blum CLIP top — zawias 155° nakładany, z zerowym uskokiem, bez sprężyny do TIP-ON (70T7550.TL)'),
    ('71B950A',        null, 'Blum CLIP top BLUMOTION — zawias 95° do wąskich ramek aluminiowych (71B950A)'),
    ('71B970A',        null, 'Blum CLIP top BLUMOTION — zawias 95° wpuszczany do ramek aluminiowych (71B970A)'),
    ('71B9750',        null, 'Blum CLIP top BLUMOTION — zawias 95° wpuszczany do grubych frontów do 32 mm (71B9750)'),
    ('71B9550',        null, 'Blum CLIP top BLUMOTION — zawias 95° nakładany do grubych frontów do 32 mm (71B9550)'),
    ('79B9454',        null, 'Blum CLIP top BLUMOTION — zawias kątowy +15° nakładany, z cichym domykiem (79B9454)'),
    ('79B9550',        null, 'Blum CLIP top BLUMOTION — zawias do drzwi równoległych i ślepego kąta (79B9550)'),
    ('79B9950',        null, 'Blum CLIP top — zawias do drzwi składanych szafki narożnej (79B9950)'),
    ('71T950A',        null, 'Blum CLIP top — zawias 95° nakładany do ramek aluminiowych, onyks (71T950A)'),
    ('79B3453',        null, 'Blum CLIP top BLUMOTION — zawias kątowy −15° nakładany, z cichym domykiem (79B3453)'),

    ('HAF-290.05.683', null, 'Camar 806 — zaślepka zawieszki, lewa, biała (HAF-290.05.683)'),
    ('HAF-290.05.682', null, 'Camar 806 — zaślepka zawieszki, prawa, biała (HAF-290.05.682)'),
    ('HAF-290.40.702', null, 'Camar 807 — dolna zaślepka zawieszki, lewa, biała (HAF-290.40.702)'),
    ('HAF-290.40.701', null, 'Camar 807 — dolna zaślepka zawieszki, prawa, biała (HAF-290.40.701)'),
    ('HAF-290.05.961', null, 'Camar 806 — zawieszka szafki górnej, lewa (HAF-290.05.961)'),
    ('HAF-290.05.960', null, 'Camar 806 — zawieszka szafki górnej, prawa (HAF-290.05.960)'),
    ('HAF-290.40.902', null, 'Camar 807 — zawieszka meblowa ukryta 240 kg, lewa (HAF-290.40.902)'),
    ('HAF-290.40.901', null, 'Camar 807 — zawieszka meblowa ukryta 240 kg, prawa (HAF-290.40.901)'),
    ('HAF-290.40.990', null, 'Camar 807 — płytka montażowa zawieszki (HAF-290.40.990)'),
    ('CAMAR 806',      null, 'Camar 806 — zawieszka szafki górnej z białymi zaślepkami (komplet L+P)'),
    ('CAMAR 807',      null, 'Camar 807 — zawieszka meblowa ukryta 240 kg, biała (komplet)'),

    ('Axilo HAFELE H-100', null, 'Häfele AXILO — nóżka cokołowa regulowana H=100 mm (90–120 mm), z głowicą'),
    ('Axilo HAFELE H-120', null, 'Häfele AXILO — nóżka cokołowa regulowana H=120 mm (100–170 mm), z głowicą'),
    ('Axilo HAFELE H-125', null, 'Häfele AXILO — nóżka cokołowa regulowana H=125 mm (115–150 mm), z głowicą'),
    ('Axilo HAFELE H-150', null, 'Häfele AXILO — nóżka cokołowa regulowana H=150 mm (140–175 mm), z głowicą'),
    ('AXILO HAFELE H-60',  null, 'Häfele AXILO — nóżka cokołowa regulowana H=60 mm (53–75 mm), z głowicą'),
    ('Axilo HAFELE H-80',  null, 'Häfele AXILO — nóżka cokołowa regulowana H=80 mm (75–105 mm), z głowicą'),

    ('WE14.1821.05.049', null, 'Rejs Praktiko 60 — podwójny pojemnik na odpady (WE14.1821.05.049)'),
    ('88276',           null, 'Szyna montażowa do zawieszek — L=2000 mm, ocynkowana (88276)'),
    ('00800201',        null, 'Kratka wentylacyjna 82×60 mm, biała (00800201)'),

    (null, 'Corian M-727 Blat', 'Blat Corian M-727'),
    (null, 'DEM/TŁUMIK BIAŁY Z REGULACJĄ', 'Tłumik do frontu z regulacją, biały'),
    (null, 'MECHANIZM BARKOWY KONTRA-AIRTIC OPEN STANDARD BIAŁY', 'Kontra-Airtic Open Standard — mechanizm barkowy, biały'),
    (null, 'Nogi Axilo', 'Häfele AXILO — nóżka cokołowa regulowana'),
    (null, 'Nogi zwykłe', 'Nóżka meblowa cokołowa H=100 mm, standardowa (czarna)'),
    (null, 'Zawieszki do szafki górnej BLUM, L+P', 'Blum — zawieszki do szafki górnej (komplet L+P)'),
    (null, 'Uchwyt LKW-5 30/059', 'Uchwyt meblowy LKW-5 (30/059)'),
    (null, 'Wkręty 3,5x50 i 3,5x30', 'Wkręty montażowe 3,5×50 mm i 3,5×30 mm'),
    (null, 'Zawieszka mocna', 'Zawieszka meblowa wzmocniona'),
    (null, 'DRĄŻEK UBRANIOWY SZAFY RURKA RURA NA WIESZAKI', 'Drążek ubraniowy do szafy'),
    (null, 'KLEJ SRA-PUT SPRAY-KON B707 CONTACT', 'Spray-Kon B707 Contact — klej kontaktowy w sprayu'),
    (null, 'antisol grafil #6 300x771 szlif', 'Szkło Antisol grafitowe 6 mm — 300×771 mm, szlifowane'),
    (null, 'HDF BIAŁY (1.0) 2850x2070x3mm', 'Płyta HDF biała jednostronna — 2850×2070×3 mm'),
    (null, 'LAMINAT H3730 ST10 1000x1310x0,6mm Hikora Naturalna', 'Laminat H3730 ST10 Hikora naturalna — 1000×1310×0,6 mm'),
    (null, 'LAMINAT H3730 ST10 600x4100x0,6mm Hikora naturalna -295W', 'Laminat H3730 ST10 Hikora naturalna — 600×4100×0,6 mm'),
    (null, 'LAMINAT W1000 ST9 2800x1330x0,8mm Biały Premium', 'Laminat W1000 ST9 Biały Premium — 2800×1330×0,8 mm'),
    (null, 'Blum Metabox prowadnica 40kg L500 P+L', 'Blum METABOX — prowadnice L=500 mm, 40 kg (komplet L+P)'),
    (null, 'blum tandem L-500 z tiponam ', 'Blum TANDEM — prowadnica pełnego wysuwu L=500 mm, z TIP-ON'),
    (null, 'BLUM PROWADNICA MOVENTO Z BLUMOTION S L-450 40kg', 'Blum MOVENTO — prowadnica pełnego wysuwu L=450 mm, z BLUMOTION, 40 kg (BL-760H4500S)')
  ) as mapping(material_symbol, old_name, clean_name)
  where (
    mapping.material_symbol is not null
    and btrim(coalesce(p_symbol, '')) = mapping.material_symbol
  ) or (
    mapping.material_symbol is null
    and p_name = mapping.old_name
  )
  limit 1;

  if v_clean is not null then
    return v_clean;
  end if;

  -- Rodziny prowadnic TANDEM mają regularne symbole. Dopasowanie po symbolu jest odporniejsze
  -- od nazw z faktur (CW/PW, brak spacji, wielkie litery) i zachowuje pełny artykuł w nazwie.
  v_match := regexp_match(btrim(coalesce(p_symbol, '')), '^550H([0-9]{3})0B$');
  if v_match is not null then
    return format('Blum TANDEM — prowadnica pełnego wysuwu L=%s mm, z BLUMOTION, 30 kg (%s)', v_match[1], btrim(p_symbol));
  end if;

  v_match := regexp_match(btrim(coalesce(p_symbol, '')), '^550F([0-9]{3})0B$');
  if v_match is not null then
    return format('Blum TANDEM — prowadnica pełnego wysuwu L=%s mm, z TIP-ON, 30 kg (%s)', v_match[1], btrim(p_symbol));
  end if;

  v_match := regexp_match(btrim(coalesce(p_symbol, '')), '^560H([0-9]{3})0C$');
  if v_match is not null then
    return format('Blum TANDEM plus — prowadnica pełnego wysuwu L=%s mm, z BLUMOTION, 30 kg (%s)', v_match[1], btrim(p_symbol));
  end if;

  v_match := regexp_match(btrim(coalesce(p_symbol, '')), '^566H([0-9]{3})0C01$');
  if v_match is not null then
    return format('Blum TANDEM plus — prowadnica pełnego wysuwu L=%s mm, z BLUMOTION, 50 kg, wzmocniona (%s)', v_match[1], btrim(p_symbol));
  end if;

  v_match := regexp_match(btrim(coalesce(p_symbol, '')), '^560F([0-9]{3})0C$');
  if v_match is not null then
    return format('Blum TANDEM plus — prowadnica pełnego wysuwu L=%s mm, z TIP-ON, 30 kg (%s)', v_match[1], btrim(p_symbol));
  end if;

  v_match := regexp_match(btrim(coalesce(p_symbol, '')), '^566F([0-9]{3})0C01$');
  if v_match is not null then
    return format('Blum TANDEM plus — prowadnica pełnego wysuwu L=%s mm, z TIP-ON, 50 kg, wzmocniona (%s)', v_match[1], btrim(p_symbol));
  end if;

  -- Płyty EGGER z katalogu mają jeden format arkusza. Usuwamy tylko magazynowe PL/NEW oraz
  -- powtórzony wymiar; kod dekoru i jego nazwa pozostają bez zmian.
  if p_category = 'Płyta' and p_name !~ '^Płyta meblowa ' then
    v_work := regexp_replace(p_name, '^PL\s+', '', 'i');
    v_work := regexp_replace(v_work, '\mNEW\M', ' ', 'gi');
    v_work := regexp_replace(v_work, '2800\s*[x×]\s*2070\s*[x×]\s*18(?:\s*mm)?', ' ', 'gi');
    v_work := btrim(regexp_replace(v_work, '\s+', ' ', 'g'));
    if v_work ~ '^[FHUW][0-9]{3,4}\s' then
      return format('Płyta meblowa %s — 2800×2070×18 mm', v_work);
    end if;
  end if;

  -- Obrzeża: przenosimy wymiar na koniec, typografię x -> ×, a z W960 usuwamy nazwę dostawcy,
  -- jego numer magazynowy i opis krążka. Pozostałe dekory są przenoszone bez interpretacji.
  if p_category = 'Obrzeże' and p_name !~ '^Obrzeże ABS ' then
    v_match := regexp_match(
      p_name,
      '^ABS\s+(.+?)\s+(23|43)\s*[x×]\s*(0[,.]8|2[,.]0)\s*mm\s+(.+)$',
      'i'
    );
    if v_match is not null then
      v_code := btrim(regexp_replace(v_match[1], '\s+REHAU$', '', 'i'));
      v_decor := regexp_replace(v_match[4], '\s*\(76873\)', '', 'gi');
      v_decor := regexp_replace(v_decor, '\s*100\s*mb\s+krążek\s*$', '', 'i');
      if v_code = 'W960 SM' then
        v_decor := regexp_replace(v_decor, '\s+Bazowy\s*$', '', 'i');
      end if;
      v_decor := btrim(regexp_replace(v_decor, '\s+', ' ', 'g'));
      return format(
        'Obrzeże ABS %s %s — %s×%s mm',
        v_code,
        v_decor,
        v_match[2],
        replace(v_match[3], '.', ',')
      );
    end if;
  end if;

  return p_name;
end;
$$;

comment on function public.catalog_literary_material_name(text, text, text, boolean) is
  'Deterministyczny słownik nazw katalogowych używany przez migrację 20261108160000; nie zmienia symboli ani ID.';

revoke all on function public.catalog_literary_material_name(text, text, text, boolean) from public, anon, authenticated;

update public.materials as material
set name = public.catalog_literary_material_name(
  material.name,
  material.category,
  material.symbol,
  material.is_kit_component
)
where material.name is distinct from public.catalog_literary_material_name(
  material.name,
  material.category,
  material.symbol,
  material.is_kit_component
);
