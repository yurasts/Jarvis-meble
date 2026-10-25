CREATE OR REPLACE FUNCTION public.report_drive_sync_result(
  p_host text,
  p_summary jsonb DEFAULT NULL::jsonb,
  p_error text DEFAULT NULL::text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
DECLARE
  v_updated boolean := false;
BEGIN
  IF nullif(btrim(p_host), '') IS NULL THEN
    RAISE EXCEPTION 'Host is required' USING ERRCODE = '22023';
  END IF;

  IF p_summary IS NOT NULL AND jsonb_typeof(p_summary) <> 'object'::text THEN
    RAISE EXCEPTION 'Sync summary must be a JSON object' USING ERRCODE = '22023';
  END IF;

  UPDATE public.drive_sync_state
    SET last_sync_at = CASE WHEN p_summary IS NOT NULL THEN now() ELSE last_sync_at END,
        last_sync_summary = coalesce(p_summary, last_sync_summary),
        last_error = CASE
          WHEN p_summary IS NOT NULL THEN left(nullif(btrim(p_error), ''), 2000)
          WHEN p_error IS NOT NULL THEN left(nullif(btrim(p_error), ''), 2000)
          ELSE last_error
        END,
        updated_at = now()
    WHERE singleton_id = 1
      AND locked_by_host = left(btrim(p_host), 255)
      AND lease_until > now()
  RETURNING true INTO v_updated;

  RETURN coalesce(v_updated, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.report_drive_sync_result(text, jsonb, text) FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.report_drive_sync_result(text, jsonb, text) TO "service_role";
