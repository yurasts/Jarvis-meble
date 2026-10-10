CREATE OR REPLACE FUNCTION public.current_role_name()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $function$
  select role from public.profiles where id = auth.uid();
$function$;

GRANT EXECUTE ON FUNCTION "public"."current_role_name"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."current_role_name"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."current_role_name"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_role_name"() TO "postgres";
