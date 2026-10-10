BEGIN;

-- Project metadata and Storage objects must follow the same visibility rules as clients.
DROP POLICY IF EXISTS "project_files_all_staff" ON public.project_files;
DROP POLICY IF EXISTS "project_files_visible_project_access" ON public.project_files;

CREATE POLICY "project_files_visible_project_access"
  ON public.project_files
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients AS visible_client
      WHERE visible_client.id = project_files.client_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clients AS visible_client
      WHERE visible_client.id = project_files.client_id
    )
  );

REVOKE ALL ON TABLE public.project_files FROM anon;
REVOKE ALL ON SEQUENCE public.project_files_id_seq FROM anon;

UPDATE storage.buckets
SET public = false
WHERE id = 'project-files';

DROP POLICY IF EXISTS "staff_full_access" ON storage.objects;
DROP POLICY IF EXISTS "staff_full_access vmqls3_0" ON storage.objects;
DROP POLICY IF EXISTS "staff_full_access vmqls3_1" ON storage.objects;
DROP POLICY IF EXISTS "staff_full_access vmqls3_2" ON storage.objects;
DROP POLICY IF EXISTS "staff_full_access vmqls3_3" ON storage.objects;
DROP POLICY IF EXISTS "project_files_storage_visible_project_access" ON storage.objects;

CREATE POLICY "project_files_storage_visible_project_access"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND EXISTS (
      SELECT 1
      FROM public.clients AS visible_client
      WHERE visible_client.id::text = (storage.foldername(storage.objects.name))[1]
    )
  )
  WITH CHECK (
    bucket_id = 'project-files'
    AND EXISTS (
      SELECT 1
      FROM public.clients AS visible_client
      WHERE visible_client.id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

-- SECURITY DEFINER functions must not resolve attacker-controlled unqualified objects.
CREATE OR REPLACE FUNCTION public.current_role_name()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $function$
  select role from public.profiles where id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.get_portal_data(p_token uuid)
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
  where portal_token = p_token;
$function$;

CREATE OR REPLACE FUNCTION public.log_client_changes()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $function$
begin
  if (tg_op = 'UPDATE') then
    insert into public.audit_log(table_name, record_id, changed_by, action, old_data, new_data)
    values ('clients', old.id, auth.uid(), 'UPDATE', to_jsonb(old), to_jsonb(new));
  elsif (tg_op = 'INSERT') then
    insert into public.audit_log(table_name, record_id, changed_by, action, new_data)
    values ('clients', new.id, auth.uid(), 'INSERT', to_jsonb(new));
  elsif (tg_op = 'DELETE') then
    insert into public.audit_log(table_name, record_id, changed_by, action, old_data)
    values ('clients', old.id, auth.uid(), 'DELETE', to_jsonb(old));
  end if;
  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_role_column()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $function$
begin
  if new.role is distinct from old.role then
    if not exists (select 1 from public.profiles where id = auth.uid() and role = 'owner') then
      raise exception 'Tylko właściciel (owner) może zmienić rolę użytkownika.';
    end if;
  end if;
  return new;
end;
$function$;

ALTER FUNCTION public.set_updated_meta() SET search_path = '';

COMMIT;
