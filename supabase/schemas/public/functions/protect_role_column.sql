CREATE OR REPLACE FUNCTION public.protect_role_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
begin
  if new.role is distinct from old.role then
    if not exists (select 1 from profiles where id = auth.uid() and role = 'owner') then
      raise exception 'Tylko właściciel (owner) może zmienić rolę użytkownika.';
    end if;
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."protect_role_column"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."protect_role_column"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."protect_role_column"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_role_column"() TO "postgres";
