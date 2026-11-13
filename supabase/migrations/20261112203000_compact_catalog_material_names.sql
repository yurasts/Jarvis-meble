-- Compact catalogue names and move trailing manufacturer articles into materials.symbol.
-- The migration is intentionally deterministic and idempotent. It changes only name/symbol;
-- IDs, prices, units, suppliers and kit relations remain untouched.

create or replace function public.compact_catalog_material_symbol(
  p_name text,
  p_symbol text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_match text[];
begin
  -- An existing article is authoritative and must never be overwritten.
  if nullif(btrim(p_symbol), '') is not null then
    return p_symbol;
  end if;

  if p_name is null then
    return p_symbol;
  end if;

  -- Conservative extraction: a single code-like token in the final parentheses.
  -- Descriptions such as (komplet), (czarna) and (komplet L+P) intentionally do not match.
  v_match := regexp_match(
    btrim(p_name),
    '\(([A-Za-z0-9][A-Za-z0-9._/-]*[0-9][A-Za-z0-9._/-]*)\)$'
  );

  return case when v_match is null then p_symbol else v_match[1] end;
end;
$$;

comment on function public.compact_catalog_material_symbol(text, text) is
  'Extracts a trailing manufacturer article only when materials.symbol is empty.';

revoke all on function public.compact_catalog_material_symbol(text, text) from public, anon, authenticated;

create or replace function public.compact_catalog_material_name(
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
  v_work text;
  v_symbol text;
  v_suffix text;
  v_match text[];
  v_brand text;
  v_detail text;
begin
  if p_name is null then
    return null;
  end if;

  -- MERIVOBOX kits and components have curated names used by material_kit_items and the UI.
  if upper(p_name) like '%MERIVOBOX%' then
    return p_name;
  end if;

  v_work := btrim(regexp_replace(p_name, '\s+', ' ', 'g'));
  v_symbol := btrim(coalesce(public.compact_catalog_material_symbol(p_name, p_symbol), ''));

  -- Remove a final article only when it is exactly the effective symbol.
  if v_symbol <> '' then
    v_suffix := format(' (%s)', v_symbol);
    if lower(right(v_work, length(v_suffix))) = lower(v_suffix) then
      v_work := btrim(left(v_work, length(v_work) - length(v_suffix)));
    end if;
  end if;

  -- Boards: the standard 2800×2070×18 mm sheet is implicit in the catalogue.
  if p_category = 'Płyta' then
    v_work := regexp_replace(v_work, '^(Płyta meblowa|PL)\s+', '', 'i');
    v_work := regexp_replace(
      v_work,
      '\s+—\s+2800\s*[x×]\s*2070\s*[x×]\s*18\s*mm$',
      '',
      'i'
    );
    return 'PL ' || btrim(v_work);
  end if;

  -- HDF keeps the non-standard thickness, but omits the sheet dimensions and verbose prefix.
  if p_category = 'HDF' then
    if v_work ~* '^HDF\s+' and v_work ~* '\([0-9]+(?:[,.][0-9]+)? mm\)$' then
      return v_work;
    end if;
    v_match := regexp_match(v_work, '^(?:Płyta\s+)?HDF\s+(.+?)\s+—\s+[0-9]+\s*[x×]\s*[0-9]+\s*[x×]\s*([0-9]+(?:[,.][0-9]+)?)\s*mm$', 'i');
    if v_match is not null then
      v_detail := regexp_replace(v_match[1], '\s+jednostronna$', '', 'i');
      v_detail := upper(left(v_detail, 1)) || substr(v_detail, 2);
      return format('HDF %s (%s mm)', v_detail, replace(v_match[2], '.', ','));
    end if;
  end if;

  -- Edges: the ABS prefix and cross-section are sufficient; "Obrzeże" and "mm" are redundant.
  if p_category = 'Obrzeże' then
    if v_work ~* '^ABS\s+.+\s+\([0-9]+\s*×\s*[0-9]+(?:,[0-9]+)?\)$' then
      return v_work;
    end if;
    v_match := regexp_match(
      v_work,
      '^(?:Obrzeże\s+)?ABS\s+(.+?)\s+—\s+([0-9]+)\s*[x×]\s*([0-9]+(?:[,.][0-9]+)?)\s*mm$',
      'i'
    );
    if v_match is not null then
      return format('ABS %s (%s×%s)', btrim(v_match[1]), v_match[2], replace(v_match[3], '.', ','));
    end if;
  end if;

  -- Two catalogue sets carry their own set symbol. Component articles are deliberately omitted.
  if upper(v_symbol) = '7DT3550' then
    return 'Zawias 110° nakładany, bez sprężyny (TIP-ON) Blum CLIP top';
  end if;
  if upper(v_symbol) = '7JB3550' then
    return 'Komplet: zawias 110° nakładany + prowadnik Blum CLIP top BLUMOTION';
  end if;

  -- Hinges: feature first, brand/series last, article only in symbol.
  v_match := regexp_match(v_work, '^(Blum CLIP top( BLUMOTION)?) — zawias (.+)$', 'i');
  if v_match is not null then
    v_brand := v_match[1];
    v_detail := regexp_replace(v_match[3], 'bez sprężyny do TIP-ON', 'bez sprężyny (TIP-ON)', 'i');
    return 'Zawias ' || v_detail || ' ' || v_brand;
  end if;

  -- Drawer runners: type/length/options first, brand and series last.
  v_match := regexp_match(v_work, '^(Blum (TANDEM( plus)?|MOVENTO|METABOX)|GTV) — (.+)$', 'i');
  if v_match is not null then
    v_brand := v_match[1];
    v_detail := v_match[4];
    v_detail := regexp_replace(v_detail, ', z BLUMOTION', ', BLUMOTION', 'i');
    v_detail := upper(left(v_detail, 1)) || substr(v_detail, 2);
    return v_detail || ' ' || v_brand;
  end if;

  -- Blum mounting plates: exact article mappings avoid ambiguous wording.
  case upper(v_symbol)
    when '173L6100' then return 'Prowadnik krzyżakowy 0 mm, na wkręty Blum CLIP';
    when '173L8100' then return 'Prowadnik krzyżakowy 0 mm, Euro Blum CLIP';
    when '177H3100E' then return 'Prowadnik krzyżakowy 0 mm, z regulacją mimośrodową, na wkręty Blum CLIP';
    when '17316000' then return 'Prowadnik krzyżakowy 1 mm, na wkręty Blum CLIP';
    when '175H3100' then return 'Prowadnik prosty do AVENTOS HF/HK-S, onyks, na wkręty Blum CLIP';
    when '17387130' then return 'Prowadnik prosty 1 mm, na wkręty Blum CLIP';
    else null;
  end case;

  -- Door push-open accessories.
  case upper(v_symbol)
    when '956A1004' then return 'Odbojnik TIP-ON długi z magnesem, biały Blum';
    when '956.1004' then return 'Odbojnik TIP-ON krótki z magnesem, biały Blum';
    when 'BL-T60L7540' then return 'Mechanizm TIP-ON do MOVENTO/LEGRABOX L=450–750 mm, czarny Blum';
    when '356001' then return 'Odbojnik magnetyczny TIP-ON Strong, biały';
    when '356.12.750' then return 'Odbojnik magnetyczny TIP-ON Strong IF, biały';
    else null;
  end case;

  -- Camar: component first, model last; packaging notes are not part of a product name.
  v_match := regexp_match(v_work, '^(Camar 80[67]) — (.+)$', 'i');
  if v_match is not null then
    v_detail := regexp_replace(v_match[2], '\s+\(komplet( L\+P)?\)$', '', 'i');
    v_detail := upper(left(v_detail, 1)) || substr(v_detail, 2);
    return v_detail || ' ' || v_match[1];
  end if;

  -- AXILO: height remains meaningful; adjustment ranges and warehouse descriptions are omitted.
  v_match := regexp_match(v_work, '^(Hafele|Häfele) AXILO — nóżka cokołowa regulowana(?: H=([0-9]+) mm)?.*$', 'i');
  if v_match is not null then
    if nullif(v_match[2], '') is null then
      return 'Nóżka cokołowa regulowana Häfele AXILO';
    end if;
    return format('Nóżka cokołowa regulowana H=%s mm Häfele AXILO', v_match[2]);
  end if;

  if v_work = 'Nóżka meblowa cokołowa H=100 mm, standardowa (czarna)' then
    return 'Nóżka meblowa cokołowa H=100 mm, standardowa';
  end if;

  -- Common accessory families whose old names led with the brand.
  v_match := regexp_match(v_work, '^Blum (MOVENTO|TANDEM|SERVO-DRIVE uno) — (.+)$', 'i');
  if v_match is not null then
    v_detail := upper(left(v_match[2], 1)) || substr(v_match[2], 2);
    return v_detail || ' Blum ' || v_match[1];
  end if;

  if v_work ~* '^Blum — zawieszki do szafki górnej' then
    return 'Zawieszki do szafki górnej Blum';
  end if;

  v_match := regexp_match(v_work, '^Rejs Praktiko 60 — (.+)$', 'i');
  if v_match is not null then
    v_detail := upper(left(v_match[1], 1)) || substr(v_match[1], 2);
    return v_detail || ' Rejs Praktiko 60';
  end if;

  v_match := regexp_match(v_work, '^Kontra-Airtic Open Standard — (.+)$', 'i');
  if v_match is not null then
    v_detail := upper(left(v_match[1], 1)) || substr(v_match[1], 2);
    return v_detail || ' Kontra-Airtic Open Standard';
  end if;

  v_match := regexp_match(v_work, '^Spray-Kon B707 Contact — (.+)$', 'i');
  if v_match is not null then
    v_detail := upper(left(v_match[1], 1)) || substr(v_match[1], 2);
    return v_detail || ' Spray-Kon B707 Contact';
  end if;

  -- Selected stock/tool rows end with the same article already stored in symbol.
  if v_symbol <> '' and v_work ~* '^(Cargo PEKA|Frez |Piła |Podcinacz )' then
    v_suffix := ' ' || v_symbol;
    if lower(right(v_work, length(v_suffix))) = lower(v_suffix) then
      v_work := btrim(left(v_work, length(v_work) - length(v_suffix)));
    end if;
  end if;

  -- Typography for remaining accessory dimensions.
  if p_category in ('Akcesoria', 'Inne') then
    v_work := regexp_replace(v_work, '([0-9])x([0-9])', '\1×\2', 'gi');
  end if;

  return v_work;
end;
$$;

comment on function public.compact_catalog_material_name(text, text, text, boolean) is
  'Deterministic compact Polish catalogue naming used by migration 20261112203000.';

revoke all on function public.compact_catalog_material_name(text, text, text, boolean) from public, anon, authenticated;

update public.materials as material
set
  symbol = public.compact_catalog_material_symbol(material.name, material.symbol),
  name = public.compact_catalog_material_name(
    material.name,
    material.category,
    material.symbol,
    material.is_kit_component
  )
where material.symbol is distinct from public.compact_catalog_material_symbol(material.name, material.symbol)
   or material.name is distinct from public.compact_catalog_material_name(
     material.name,
     material.category,
     material.symbol,
     material.is_kit_component
   );
