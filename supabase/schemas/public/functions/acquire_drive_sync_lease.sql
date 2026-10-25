CREATE OR REPLACE FUNCTION public.acquire_drive_sync_lease(
  p_host text,
  p_sync_root_path text,
  p_lease_seconds integer DEFAULT 45
)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
DECLARE
  v_now timestamp with time zone := now();
  v_lease_seconds integer := greatest(15, least(coalesce(p_lease_seconds, 45), 300));
  v_acquired boolean := false;
BEGIN
  IF nullif(btrim(p_host), '') IS NULL OR nullif(btrim(p_sync_root_path), '') IS NULL THEN
    RAISE EXCEPTION 'Host and sync root are required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.drive_sync_state (
    singleton_id,
    locked_by_host,
    lease_until,
    last_heartbeat_at,
    sync_root_path,
    updated_at
  )
  VALUES (
    1,
    left(btrim(p_host), 255),
    v_now + make_interval(secs => v_lease_seconds),
    v_now,
    left(btrim(p_sync_root_path), 2048),
    v_now
  )
  ON CONFLICT (singleton_id) DO UPDATE
    SET locked_by_host = EXCLUDED.locked_by_host,
        lease_until = EXCLUDED.lease_until,
        last_heartbeat_at = EXCLUDED.last_heartbeat_at,
        sync_root_path = EXCLUDED.sync_root_path,
        updated_at = EXCLUDED.updated_at
    WHERE public.drive_sync_state.locked_by_host IS NULL
       OR public.drive_sync_state.locked_by_host = EXCLUDED.locked_by_host
       OR public.drive_sync_state.lease_until IS NULL
       OR public.drive_sync_state.lease_until <= v_now
  RETURNING true INTO v_acquired;

  RETURN coalesce(v_acquired, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.acquire_drive_sync_lease(text, text, integer) FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.acquire_drive_sync_lease(text, text, integer) TO "service_role";
