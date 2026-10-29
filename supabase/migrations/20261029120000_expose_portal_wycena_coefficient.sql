-- The portal calculates Wycena with the same client-side domain helper as the
-- authenticated workspace. Expose only the coefficient needed by that formula;
-- the stored budget remains private.
DROP FUNCTION IF EXISTS public.get_portal_data(uuid);

CREATE OR REPLACE FUNCTION public.get_portal_data (
  p_token uuid
)
  RETURNS TABLE (
    full_name         text,
    deadline          date,
    status            text,
    calc_materials    jsonb,
    calc_services     jsonb,
    budget_coefficient numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $function$
  select
    full_name::text,
    deadline,
    status::text,
    calc_materials::jsonb,
    calc_services::jsonb,
    coalesce(budget_coefficient, 2.0)::numeric
  from public.clients
  where portal_token = p_token
    and lifecycle_status <> 'trash';
$function$;

GRANT EXECUTE ON FUNCTION public.get_portal_data(uuid) TO PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_portal_data(uuid) FROM postgres;
GRANT EXECUTE ON FUNCTION public.get_portal_data(uuid) TO postgres;
