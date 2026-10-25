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

  -- A sign-in is always history-worthy, except a repeat of the same login:
  -- Supabase can emit SIGNED_IN several times (refocus, several tabs), so one
  -- sign_in per user and device within five minutes is kept.
  IF (
       p_event_type = 'sign_in'
       AND NOT EXISTS (
         SELECT 1
         FROM public.user_activity_logs
         WHERE user_id = v_user_id
           AND device_type = p_device_type
           AND event_type = 'sign_in'
           AND created_at >= v_now - interval '5 minutes'
       )
     )
     OR (
       p_event_type = 'session_start'
       AND NOT EXISTS (
         SELECT 1
         FROM public.user_activity_logs
         WHERE user_id = v_user_id
           AND created_at >= v_now - interval '30 minutes'
       )
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

REVOKE ALL ON FUNCTION public.record_user_activity(text, text, text) FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION public.record_user_activity(text, text, text) TO "authenticated";
