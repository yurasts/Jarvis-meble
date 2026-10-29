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
