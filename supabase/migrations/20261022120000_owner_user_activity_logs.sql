-- Owner-only employee activity history and persistent last-seen status.
-- Authenticated users never write these tables directly; the SECURITY DEFINER
-- RPC derives user_id from auth.uid() and validates every input.

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  last_device_type text NOT NULL,
  last_user_agent text
);

ALTER TABLE public.user_presence
  ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_device_type text,
  ADD COLUMN IF NOT EXISTS last_user_agent text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_presence_device_type_check'
      AND conrelid = 'public.user_presence'::regclass
  ) THEN
    ALTER TABLE public.user_presence
      ADD CONSTRAINT user_presence_device_type_check
      CHECK (last_device_type IN ('mobile', 'desktop'));
  END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  user_name text,
  event_type text NOT NULL,
  device_type text NOT NULL,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_activity_logs
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS user_name text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS device_type text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_activity_logs_event_type_check'
      AND conrelid = 'public.user_activity_logs'::regclass
  ) THEN
    ALTER TABLE public.user_activity_logs
      ADD CONSTRAINT user_activity_logs_event_type_check
      CHECK (event_type IN ('sign_in', 'session_start'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_activity_logs_device_type_check'
      AND conrelid = 'public.user_activity_logs'::regclass
  ) THEN
    ALTER TABLE public.user_activity_logs
      ADD CONSTRAINT user_activity_logs_device_type_check
      CHECK (device_type IN ('mobile', 'desktop'));
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS user_activity_logs_user_created_at_idx
  ON public.user_activity_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_activity_logs_created_at_idx
  ON public.user_activity_logs (created_at DESC);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_presence_select_owner ON public.user_presence;
CREATE POLICY user_presence_select_owner
  ON public.user_presence
  FOR SELECT
  TO authenticated
  USING (public.current_role_name() = 'owner');

DROP POLICY IF EXISTS user_activity_logs_select_owner ON public.user_activity_logs;
CREATE POLICY user_activity_logs_select_owner
  ON public.user_activity_logs
  FOR SELECT
  TO authenticated
  USING (public.current_role_name() = 'owner');

REVOKE ALL ON TABLE public.user_presence FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_activity_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_presence TO authenticated;
GRANT SELECT ON TABLE public.user_activity_logs TO authenticated;
GRANT ALL ON TABLE public.user_presence TO service_role;
GRANT ALL ON TABLE public.user_activity_logs TO service_role;

CREATE OR REPLACE FUNCTION public.record_user_activity(
  p_event_type text,
  p_device_type text,
  p_user_agent text DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
  v_user_agent text := left(nullif(btrim(p_user_agent), ''), 255);
  v_now timestamp with time zone := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_event_type NOT IN ('sign_in', 'session_start') THEN
    RAISE EXCEPTION 'Unsupported activity event' USING ERRCODE = '22023';
  END IF;

  IF p_device_type NOT IN ('mobile', 'desktop') THEN
    RAISE EXCEPTION 'Unsupported device type' USING ERRCODE = '22023';
  END IF;

  -- Serialize activity writes per user so simultaneous tabs cannot both pass
  -- the session_start anti-spam check. Other users use different lock keys.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  SELECT users.email, profiles.full_name
    INTO v_user_email, v_user_name
    FROM auth.users AS users
    LEFT JOIN public.profiles AS profiles ON profiles.id = users.id
    WHERE users.id = v_user_id;

  INSERT INTO public.user_presence (
    user_id,
    last_seen_at,
    last_device_type,
    last_user_agent
  )
  VALUES (v_user_id, v_now, p_device_type, v_user_agent)
  ON CONFLICT (user_id) DO UPDATE
    SET last_seen_at = EXCLUDED.last_seen_at,
        last_device_type = EXCLUDED.last_device_type,
        last_user_agent = EXCLUDED.last_user_agent;

  IF p_event_type = 'sign_in'
     OR NOT EXISTS (
       SELECT 1
       FROM public.user_activity_logs
       WHERE user_id = v_user_id
         AND created_at >= v_now - interval '30 minutes'
     ) THEN
    INSERT INTO public.user_activity_logs (
      user_id,
      user_email,
      user_name,
      event_type,
      device_type,
      user_agent,
      created_at
    )
    VALUES (
      v_user_id,
      v_user_email,
      v_user_name,
      p_event_type,
      p_device_type,
      v_user_agent,
      v_now
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_user_activity(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_user_activity(text, text, text) TO authenticated;
