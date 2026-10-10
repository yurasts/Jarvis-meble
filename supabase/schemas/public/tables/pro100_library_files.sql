CREATE TABLE "public"."pro100_library_files" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "category_id"       uuid                     NOT NULL,
  "title"             text                     NOT NULL,
  "description"       text,
  "tags"              text[]                   NOT NULL DEFAULT '{}'::text[],
  "storage_path"      text                     NOT NULL,
  "original_filename" text                     NOT NULL,
  "file_size"         bigint                   NOT NULL,
  "content_type"      text,
  "version"           integer                  NOT NULL DEFAULT 1,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "client_name"       text,
  CONSTRAINT "pro100_library_files_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.pro100_library_categories(id),
  CONSTRAINT "pro100_library_files_client_name_length"
    CHECK (((client_name IS NULL) OR ((char_length(TRIM(BOTH FROM client_name)) >= 1) AND (char_length(TRIM(BOTH FROM client_name)) <= 140)))),
  CONSTRAINT "pro100_library_files_description_check" CHECK (((description IS NULL) OR (char_length(description) <= 1500))),
  CONSTRAINT "pro100_library_files_file_size_check" CHECK ((file_size > 0)),
  CONSTRAINT "pro100_library_files_original_filename_check" CHECK ((lower(original_filename) ~~ '%.sto'::text)),
  CONSTRAINT "pro100_library_files_pkey" PRIMARY KEY (id),
  CONSTRAINT "pro100_library_files_storage_path_key" UNIQUE (storage_path),
  CONSTRAINT "pro100_library_files_title_check" CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 140))),
  CONSTRAINT "pro100_library_files_version_check" CHECK ((version > 0)),
  "created_by"        uuid                     NOT NULL DEFAULT auth.uid(),
  CONSTRAINT "pro100_library_files_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  "updated_by"        uuid                     NOT NULL DEFAULT auth.uid(),
  CONSTRAINT "pro100_library_files_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(id)
);

ALTER TABLE "public"."pro100_library_files"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX pro100_library_files_category_id_idx ON public.pro100_library_files USING btree (category_id);

CREATE INDEX pro100_library_files_updated_at_idx ON public.pro100_library_files USING btree (updated_at DESC);

CREATE TRIGGER pro100_library_files_guard_update
  BEFORE UPDATE ON public.pro100_library_files
  FOR EACH ROW
  EXECUTE FUNCTION public.pro100_library_files_guard_update();

CREATE POLICY "pro100_library_files_delete_authenticated" ON "public"."pro100_library_files"
  FOR DELETE
  TO "authenticated"
  USING (true);

CREATE POLICY "pro100_library_files_select_authenticated" ON "public"."pro100_library_files"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "pro100_library_files_update_authenticated" ON "public"."pro100_library_files"
  FOR UPDATE
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pro100_library_files" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pro100_library_files" TO "service_role";

CREATE POLICY "pro100_library_files_insert_authenticated" ON "public"."pro100_library_files"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((created_by = auth.uid()) AND (updated_by = auth.uid())));

REVOKE ALL ON TABLE "public"."pro100_library_files" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pro100_library_files" TO "postgres";

REVOKE ALL ON TABLE "public"."pro100_library_files" FROM "anon";
