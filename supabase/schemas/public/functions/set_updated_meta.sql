CREATE OR REPLACE FUNCTION public.set_updated_meta()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $function$
begin
  new.updated_by = auth.uid();
  new.updated_at = now();
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_updated_meta"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_updated_meta"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_updated_meta"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_meta"() TO "postgres";
