CREATE OR REPLACE FUNCTION public.project_cash_transactions_set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at := now();
  new.project_id := old.project_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."project_cash_transactions_set_updated_at"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."project_cash_transactions_set_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."project_cash_transactions_set_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."project_cash_transactions_set_updated_at"() TO "postgres";
