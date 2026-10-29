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
