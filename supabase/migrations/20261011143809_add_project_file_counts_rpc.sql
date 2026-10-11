BEGIN;

CREATE INDEX IF NOT EXISTS project_files_client_id_idx
  ON public.project_files USING btree (client_id);

CREATE OR REPLACE FUNCTION public.get_project_file_counts()
  RETURNS TABLE (
    client_id  bigint,
    file_count bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $function$
  SELECT pf.client_id, count(*)::bigint AS file_count
  FROM public.project_files AS pf
  GROUP BY pf.client_id;
$function$;

REVOKE ALL ON FUNCTION public.get_project_file_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_file_counts() TO authenticated, service_role;

COMMIT;
