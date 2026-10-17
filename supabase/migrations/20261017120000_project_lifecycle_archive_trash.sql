BEGIN;

-- Project lifecycle: active -> archived / trash -> active, and permanent deletion
-- only from the trash. The lifecycle is kept separate from the workflow `status`
-- (new/design/production/done), so a restored project returns to the same stage.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at timestamp with time zone;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_lifecycle_status_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_lifecycle_status_check
  CHECK (lifecycle_status = ANY (ARRAY['active'::text, 'archived'::text, 'trash'::text]));

-- Designers and installers may edit their assigned projects, but only the owner
-- and the assembler may archive, trash or restore them. The timestamp is managed
-- by the database and cannot be forged from the client.
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

DROP TRIGGER IF EXISTS trg_clients_protect_lifecycle ON public.clients;

CREATE TRIGGER trg_clients_protect_lifecycle
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_lifecycle_column();

-- Physical deletion: owner only, and only for rows already moved to the trash.
-- A DELETE that does not match this policy silently affects zero rows, so the
-- application verifies the returned row count.
DROP POLICY IF EXISTS "clients_delete_owner_only" ON public.clients;
DROP POLICY IF EXISTS "clients_delete_owner_trash_only" ON public.clients;

CREATE POLICY "clients_delete_owner_trash_only"
  ON public.clients
  FOR DELETE
  TO authenticated
  USING (
    public.current_role_name() = 'owner'
    AND lifecycle_status = 'trash'
  );

-- After a project is deleted its files no longer match the per-project storage
-- policy. Let the owner list and remove such orphaned objects so the purge can
-- clean up the bucket after the database row is gone.
DROP POLICY IF EXISTS "project_files_storage_owner_select_orphans" ON storage.objects;
DROP POLICY IF EXISTS "project_files_storage_owner_delete_orphans" ON storage.objects;

CREATE POLICY "project_files_storage_owner_select_orphans"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND public.current_role_name() = 'owner'
    AND NOT EXISTS (
      SELECT 1
      FROM public.clients existing_client
      WHERE existing_client.id::text = (storage.foldername(objects.name))[1]
    )
  );

CREATE POLICY "project_files_storage_owner_delete_orphans"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND public.current_role_name() = 'owner'
    AND NOT EXISTS (
      SELECT 1
      FROM public.clients existing_client
      WHERE existing_client.id::text = (storage.foldername(objects.name))[1]
    )
  );

-- The client portal must not show projects that were moved to the trash.
CREATE OR REPLACE FUNCTION public.get_portal_data (
  p_token uuid
)
  RETURNS TABLE (
    full_name      text,
    deadline       date,
    status         text,
    calc_materials jsonb,
    calc_services  jsonb
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $function$
  select
    full_name::text,
    deadline,
    status::text,
    calc_materials::jsonb,
    calc_services::jsonb
  from public.clients
  where portal_token = p_token
    and lifecycle_status <> 'trash';
$function$;

COMMIT;
