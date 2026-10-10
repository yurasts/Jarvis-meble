CREATE OR REPLACE FUNCTION public.log_client_changes()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
begin
  if (tg_op = 'UPDATE') then
    insert into audit_log(table_name, record_id, changed_by, action, old_data, new_data)
    values ('clients', old.id, auth.uid(), 'UPDATE', to_jsonb(old), to_jsonb(new));
  elsif (tg_op = 'INSERT') then
    insert into audit_log(table_name, record_id, changed_by, action, new_data)
    values ('clients', new.id, auth.uid(), 'INSERT', to_jsonb(new));
  elsif (tg_op = 'DELETE') then
    insert into audit_log(table_name, record_id, changed_by, action, old_data)
    values ('clients', old.id, auth.uid(), 'DELETE', to_jsonb(old));
  end if;
  return coalesce(new, old);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."log_client_changes"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."log_client_changes"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."log_client_changes"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."log_client_changes"() TO "postgres";
