CREATE OR REPLACE FUNCTION public.get_portal_data (
  p_token uuid
)
  RETURNS TABLE (
    full_name      text,
    deadline       date,
    status         text,
    calc_materials jsonb,
    calc_services  jsonb
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  AS $function$
  select
    full_name::text,
    deadline,
    status::text,
    calc_materials::jsonb,
    calc_services::jsonb
  from clients
  where portal_token = p_token;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_portal_data"(uuid) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_portal_data"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_portal_data"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_portal_data"(uuid) TO "postgres";
