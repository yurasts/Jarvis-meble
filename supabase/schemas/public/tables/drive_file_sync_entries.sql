CREATE TABLE "public"."drive_file_sync_entries" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "project_id"      bigint                   NOT NULL,
  "project_file_id" bigint,
  "category"        text                     NOT NULL,
  "relative_path"   text                     NOT NULL,
  "file_name"       text                     NOT NULL,
  "content_sha256"  text                     NOT NULL,
  "size_bytes"      bigint                   NOT NULL,
  "storage_path"    text                     NOT NULL,
  "last_synced_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "drive_file_sync_entries_pkey" PRIMARY KEY (id),
  CONSTRAINT "drive_file_sync_entries_project_fkey" FOREIGN KEY (project_id) REFERENCES public.clients(id) ON DELETE CASCADE,
  CONSTRAINT "drive_file_sync_entries_project_file_fkey" FOREIGN KEY (project_file_id) REFERENCES public.project_files(id) ON DELETE SET NULL,
  CONSTRAINT "drive_file_sync_entries_category_check" CHECK (category = ANY (ARRAY['projekt'::text, 'zadanie'::text, 'inne'::text, 'montaz'::text])),
  CONSTRAINT "drive_file_sync_entries_sha256_check" CHECK (content_sha256 ~ '^[0-9a-f]{64}$'::text),
  CONSTRAINT "drive_file_sync_entries_size_check" CHECK (size_bytes >= 0),
  CONSTRAINT "drive_file_sync_entries_relative_path_check" CHECK (
    relative_path <> ''::text
    AND relative_path !~ '(^|/)\.\.(/|$)'::text
    AND relative_path !~ '^/'::text
    AND relative_path !~ '\\'::text
  ),
  CONSTRAINT "drive_file_sync_entries_project_path_key" UNIQUE (project_id, category, relative_path)
);

CREATE UNIQUE INDEX drive_file_sync_entries_project_file_idx
  ON public.drive_file_sync_entries USING btree (project_file_id)
  WHERE project_file_id IS NOT NULL;

CREATE INDEX drive_file_sync_entries_project_idx
  ON public.drive_file_sync_entries USING btree (project_id);

CREATE INDEX drive_file_sync_entries_last_synced_idx
  ON public.drive_file_sync_entries USING btree (last_synced_at DESC);

ALTER TABLE "public"."drive_file_sync_entries"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drive_file_sync_entries_select_owner" ON "public"."drive_file_sync_entries"
  FOR SELECT
  TO "authenticated"
  USING ((public.current_role_name() = 'owner'::text));

REVOKE ALL ON TABLE "public"."drive_file_sync_entries" FROM PUBLIC, "anon", "authenticated";

GRANT SELECT ON TABLE "public"."drive_file_sync_entries" TO "authenticated";

GRANT ALL ON TABLE "public"."drive_file_sync_entries" TO "service_role";
