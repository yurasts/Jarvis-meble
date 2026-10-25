-- Owner-visible status and service-role-only state for the local Google Drive sync agent.

CREATE TABLE IF NOT EXISTS public.drive_sync_state (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  locked_by_host text,
  lease_until timestamp with time zone,
  last_heartbeat_at timestamp with time zone,
  sync_root_path text,
  last_sync_at timestamp with time zone,
  last_sync_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(last_sync_summary) = 'object'),
  last_error text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.drive_file_sync_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id bigint NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_file_id bigint REFERENCES public.project_files(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('projekt', 'zadanie', 'inne', 'montaz')),
  relative_path text NOT NULL,
  file_name text NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  storage_path text NOT NULL,
  last_synced_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT drive_file_sync_entries_relative_path_check CHECK (
    relative_path <> ''
    AND relative_path !~ '(^|/)\.\.(/|$)'
    AND relative_path !~ '^/'
    AND relative_path !~ '\\'
  ),
  CONSTRAINT drive_file_sync_entries_project_path_key UNIQUE (project_id, category, relative_path)
);

CREATE UNIQUE INDEX IF NOT EXISTS drive_file_sync_entries_project_file_idx
  ON public.drive_file_sync_entries (project_file_id)
  WHERE project_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS drive_file_sync_entries_project_idx
  ON public.drive_file_sync_entries (project_id);
CREATE INDEX IF NOT EXISTS drive_file_sync_entries_last_synced_idx
  ON public.drive_file_sync_entries (last_synced_at DESC);

ALTER TABLE public.drive_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_file_sync_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drive_sync_state_select_owner ON public.drive_sync_state;
CREATE POLICY drive_sync_state_select_owner
  ON public.drive_sync_state FOR SELECT TO authenticated
  USING (public.current_role_name() = 'owner');

DROP POLICY IF EXISTS drive_file_sync_entries_select_owner ON public.drive_file_sync_entries;
CREATE POLICY drive_file_sync_entries_select_owner
  ON public.drive_file_sync_entries FOR SELECT TO authenticated
  USING (public.current_role_name() = 'owner');

REVOKE ALL ON TABLE public.drive_sync_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.drive_file_sync_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.drive_sync_state TO authenticated;
GRANT SELECT ON TABLE public.drive_file_sync_entries TO authenticated;
GRANT ALL ON TABLE public.drive_sync_state TO service_role;
GRANT ALL ON TABLE public.drive_file_sync_entries TO service_role;

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
    singleton_id, locked_by_host, lease_until, last_heartbeat_at, sync_root_path, updated_at
  )
  VALUES (
    1, left(btrim(p_host), 255), v_now + make_interval(secs => v_lease_seconds),
    v_now, left(btrim(p_sync_root_path), 2048), v_now
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

CREATE OR REPLACE FUNCTION public.release_drive_sync_lease(p_host text)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
DECLARE
  v_released boolean := false;
BEGIN
  UPDATE public.drive_sync_state
    SET lease_until = now(), last_heartbeat_at = now(), updated_at = now()
    WHERE singleton_id = 1
      AND locked_by_host = left(btrim(p_host), 255)
  RETURNING true INTO v_released;
  RETURN coalesce(v_released, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.acquire_drive_sync_lease(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_drive_sync_result(text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_drive_sync_lease(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_drive_sync_lease(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_drive_sync_result(text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_drive_sync_lease(text) TO service_role;
