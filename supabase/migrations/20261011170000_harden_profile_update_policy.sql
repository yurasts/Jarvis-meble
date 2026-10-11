BEGIN;

-- Avoid recursively querying profiles from its own RLS policy. The helper is
-- SECURITY DEFINER and resolves the current user's role without re-entering RLS.
DROP POLICY IF EXISTS "profiles_update_self_or_owner" ON public.profiles;

CREATE POLICY "profiles_update_self_or_owner"
  ON public.profiles
  FOR UPDATE
  TO PUBLIC
  USING (
    auth.uid() = id
    OR public.current_role_name() = 'owner'
  );

COMMIT;
