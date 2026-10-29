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
