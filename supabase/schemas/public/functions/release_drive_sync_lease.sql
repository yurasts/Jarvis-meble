CREATE OR REPLACE FUNCTION public.release_drive_sync_lease(p_host text)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
DECLARE
  v_released boolean := false;
BEGIN
  UPDATE public.drive_sync_state
    SET lease_until = now(),
        last_heartbeat_at = now(),
        updated_at = now()
    WHERE singleton_id = 1
      AND locked_by_host = left(btrim(p_host), 255)
  RETURNING true INTO v_released;

  RETURN coalesce(v_released, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.release_drive_sync_lease(text) FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.release_drive_sync_lease(text) TO "service_role";
