BEGIN;

CREATE OR REPLACE FUNCTION public.update_material_prices(p_updates jsonb)
  RETURNS TABLE (
    id            bigint,
    price         numeric,
    price_history jsonb
  )
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = ''
  AS $function$
DECLARE
  update_item       jsonb;
  target_id         bigint;
  expected_price    numeric;
  replacement_price numeric;
BEGIN
  IF jsonb_typeof(p_updates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Material price updates must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  FOR update_item IN
    SELECT value FROM jsonb_array_elements(p_updates)
  LOOP
    target_id := nullif(update_item->>'material_id', '')::bigint;
    expected_price := nullif(update_item->>'expected_price', '')::numeric;
    replacement_price := nullif(update_item->>'new_price', '')::numeric;

    IF target_id IS NULL
      OR expected_price IS NULL
      OR replacement_price IS NULL
      OR replacement_price < 0
    THEN
      RAISE EXCEPTION 'Invalid material price update'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.materials AS material
    SET
      price_history = coalesce(material.price_history, '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
          'price', material.price,
          'date', current_date
        )),
      price = replacement_price
    WHERE material.id = target_id
      AND material.price = expected_price
    RETURNING material.id, material.price, material.price_history
      INTO id, price, price_history;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Material price update rejected for id %', target_id
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_material_prices(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_material_prices(jsonb) TO authenticated, service_role;

COMMIT;
