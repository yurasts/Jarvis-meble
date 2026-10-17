CREATE OR REPLACE FUNCTION public.protect_lifecycle_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $function$
begin
  if new.lifecycle_status is distinct from old.lifecycle_status then
    if auth.uid() is not null
      and coalesce(public.current_role_name(), '') <> all (array['owner', 'assembler']) then
      raise exception 'Tylko właściciel lub monter może archiwizować, przenosić do kosza i przywracać projekty.'
        using errcode = '42501';
    end if;
    new.lifecycle_changed_at := now();
  else
    new.lifecycle_changed_at := old.lifecycle_changed_at;
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."protect_lifecycle_column"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."protect_lifecycle_column"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."protect_lifecycle_column"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_lifecycle_column"() TO "postgres";
