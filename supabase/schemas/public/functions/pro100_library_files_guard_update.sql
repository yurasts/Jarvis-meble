CREATE OR REPLACE FUNCTION public.pro100_library_files_guard_update()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."pro100_library_files_guard_update"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."pro100_library_files_guard_update"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."pro100_library_files_guard_update"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."pro100_library_files_guard_update"() TO "postgres";
