-- Supplier directory v2 and many-to-many material links.
-- public.materials.id is bigint in the live schema, so the foreign key must use
-- bigint even though all new directory/link identifiers are UUIDs.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS google_maps_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_person text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.suppliers
SET
  name = btrim(name),
  address = COALESCE(address, ''),
  phone = COALESCE(phone, ''),
  notes = COALESCE(notes, '');

-- Keep one canonical row for legacy names that differ only by case/whitespace.
DELETE FROM public.suppliers AS duplicate
USING public.suppliers AS canonical
WHERE lower(btrim(duplicate.name)) = lower(btrim(canonical.name))
  AND duplicate.id > canonical.id;

ALTER TABLE public.suppliers
  ALTER COLUMN address SET DEFAULT '',
  ALTER COLUMN address SET NOT NULL,
  ALTER COLUMN phone SET DEFAULT '',
  ALTER COLUMN phone SET NOT NULL,
  ALTER COLUMN notes SET DEFAULT '',
  ALTER COLUMN notes SET NOT NULL;

-- The legacy directory used a bigint identity. Nothing referenced it, so rows can
-- safely receive stable UUIDs before material_suppliers is introduced. The type
-- guard also makes the migration replayable on CI's current-schema baseline.
DO $migration$
DECLARE
  supplier_id_type text;
BEGIN
  SELECT data_type
  INTO supplier_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'suppliers'
    AND column_name = 'id';

  IF supplier_id_type IS DISTINCT FROM 'uuid' THEN
    ALTER TABLE public.suppliers
      ADD COLUMN supplier_uuid uuid DEFAULT gen_random_uuid();

    UPDATE public.suppliers
    SET supplier_uuid = gen_random_uuid()
    WHERE supplier_uuid IS NULL;

    ALTER TABLE public.suppliers
      ALTER COLUMN supplier_uuid SET NOT NULL,
      DROP CONSTRAINT suppliers_pkey,
      DROP COLUMN id;

    ALTER TABLE public.suppliers
      RENAME COLUMN supplier_uuid TO id;

    ALTER TABLE public.suppliers
      ALTER COLUMN id SET DEFAULT gen_random_uuid(),
      ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);

    DROP SEQUENCE IF EXISTS public.suppliers_id_seq;
  END IF;
END;
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_normalized_uidx
  ON public.suppliers (lower(btrim(name)));

DROP POLICY IF EXISTS suppliers_all_staff ON public.suppliers;
DROP POLICY IF EXISTS suppliers_staff_all ON public.suppliers;
CREATE POLICY suppliers_staff_all ON public.suppliers
  FOR ALL
  TO authenticated
  USING (public.current_role_name() IS NOT NULL)
  WITH CHECK (public.current_role_name() IS NOT NULL);

REVOKE ALL ON TABLE public.suppliers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON TABLE public.suppliers TO authenticated;

CREATE TABLE IF NOT EXISTS public.material_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id bigint NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_sku text NOT NULL DEFAULT '',
  supplier_price numeric(12,2),
  is_preferred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_suppliers_material_supplier_key UNIQUE (material_id, supplier_id),
  CONSTRAINT material_suppliers_supplier_price_check CHECK (supplier_price IS NULL OR supplier_price >= 0)
);

CREATE INDEX IF NOT EXISTS material_suppliers_supplier_id_idx
  ON public.material_suppliers (supplier_id);

CREATE UNIQUE INDEX IF NOT EXISTS material_suppliers_one_preferred_idx
  ON public.material_suppliers (material_id)
  WHERE is_preferred;

ALTER TABLE public.material_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS material_suppliers_staff_all ON public.material_suppliers;
CREATE POLICY material_suppliers_staff_all ON public.material_suppliers
  FOR ALL
  TO authenticated
  USING (public.current_role_name() IS NOT NULL)
  WITH CHECK (public.current_role_name() IS NOT NULL);

REVOKE ALL ON TABLE public.material_suppliers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON TABLE public.material_suppliers TO authenticated;
GRANT ALL ON TABLE public.material_suppliers TO service_role, postgres;

-- Backfill every legacy materials.supplier value without losing case-preserved names.
INSERT INTO public.suppliers (name)
SELECT min(btrim(material.supplier))
FROM public.materials AS material
WHERE btrim(COALESCE(material.supplier, '')) <> ''
GROUP BY lower(btrim(material.supplier))
ON CONFLICT DO NOTHING;

INSERT INTO public.material_suppliers (material_id, supplier_id, is_preferred)
SELECT material.id, supplier.id, true
FROM public.materials AS material
JOIN public.suppliers AS supplier
  ON lower(btrim(supplier.name)) = lower(btrim(material.supplier))
WHERE btrim(COALESCE(material.supplier, '')) <> ''
ON CONFLICT (material_id, supplier_id) DO UPDATE
SET is_preferred = true;

CREATE OR REPLACE FUNCTION public.material_suppliers_sync_legacy_name()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
DECLARE
  affected_material_id bigint;
BEGIN
  affected_material_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.material_id ELSE NEW.material_id END;

  UPDATE public.materials AS material
  SET supplier = (
    SELECT supplier.name
    FROM public.material_suppliers AS link
    JOIN public.suppliers AS supplier ON supplier.id = link.supplier_id
    WHERE link.material_id = affected_material_id
    ORDER BY link.is_preferred DESC, link.created_at, supplier.name
    LIMIT 1
  )
  WHERE material.id = affected_material_id;

  IF TG_OP = 'UPDATE' AND OLD.material_id IS DISTINCT FROM NEW.material_id THEN
    UPDATE public.materials AS material
    SET supplier = (
      SELECT supplier.name
      FROM public.material_suppliers AS link
      JOIN public.suppliers AS supplier ON supplier.id = link.supplier_id
      WHERE link.material_id = OLD.material_id
      ORDER BY link.is_preferred DESC, link.created_at, supplier.name
      LIMIT 1
    )
    WHERE material.id = OLD.material_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.material_suppliers_sync_legacy_name() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.material_suppliers_sync_legacy_name() TO service_role, postgres;

DROP TRIGGER IF EXISTS material_suppliers_sync_legacy_name ON public.material_suppliers;
CREATE TRIGGER material_suppliers_sync_legacy_name
  AFTER INSERT OR UPDATE OR DELETE ON public.material_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.material_suppliers_sync_legacy_name();

CREATE OR REPLACE FUNCTION public.suppliers_sync_legacy_name()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.materials AS material
    SET supplier = NEW.name
    FROM public.material_suppliers AS link
    WHERE link.material_id = material.id
      AND link.supplier_id = NEW.id
      AND link.is_preferred;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.suppliers_sync_legacy_name() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suppliers_sync_legacy_name() TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.suppliers_set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.suppliers_set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suppliers_set_updated_at() TO service_role, postgres;

DROP TRIGGER IF EXISTS suppliers_set_updated_at ON public.suppliers;
CREATE TRIGGER suppliers_set_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.suppliers_set_updated_at();

DROP TRIGGER IF EXISTS suppliers_sync_legacy_name ON public.suppliers;
CREATE TRIGGER suppliers_sync_legacy_name
  AFTER UPDATE OF name ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.suppliers_sync_legacy_name();

CREATE OR REPLACE FUNCTION public.set_material_suppliers(
  p_material_id bigint,
  p_links jsonb DEFAULT '[]'::jsonb
)
  RETURNS SETOF public.material_suppliers
  LANGUAGE plpgsql
  SET search_path = ''
AS $function$
DECLARE
  preferred_count integer;
BEGIN
  IF jsonb_typeof(COALESCE(p_links, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_links must be a JSON array';
  END IF;

  SELECT count(*)
  INTO preferred_count
  FROM jsonb_array_elements(COALESCE(p_links, '[]'::jsonb)) AS item
  WHERE COALESCE((item->>'is_preferred')::boolean, false);

  IF jsonb_array_length(COALESCE(p_links, '[]'::jsonb)) > 0 AND preferred_count <> 1 THEN
    RAISE EXCEPTION 'exactly one material supplier must be preferred';
  END IF;

  DELETE FROM public.material_suppliers
  WHERE material_id = p_material_id;

  INSERT INTO public.material_suppliers (
    material_id,
    supplier_id,
    supplier_sku,
    supplier_price,
    is_preferred
  )
  SELECT
    p_material_id,
    (item->>'supplier_id')::uuid,
    COALESCE(item->>'supplier_sku', ''),
    NULLIF(item->>'supplier_price', '')::numeric(12,2),
    COALESCE((item->>'is_preferred')::boolean, false)
  FROM jsonb_array_elements(COALESCE(p_links, '[]'::jsonb)) AS item;

  RETURN QUERY
  SELECT link.*
  FROM public.material_suppliers AS link
  WHERE link.material_id = p_material_id
  ORDER BY link.is_preferred DESC, link.created_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_material_suppliers(bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_material_suppliers(bigint, jsonb) TO authenticated, service_role, postgres;
