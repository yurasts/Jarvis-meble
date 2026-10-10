CREATE POLICY "staff_full_access vmqls3_0" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING ((bucket_id = 'project-files'::text));

CREATE POLICY "staff_full_access vmqls3_1" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((bucket_id = 'project-files'::text));

CREATE POLICY "staff_full_access vmqls3_2" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING ((bucket_id = 'project-files'::text));

CREATE POLICY "staff_full_access vmqls3_3" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING ((bucket_id = 'project-files'::text));

CREATE POLICY "pro100_library_storage_delete_authenticated" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING ((bucket_id = 'pro100-library'::text));

CREATE POLICY "pro100_library_storage_insert_authenticated" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((bucket_id = 'pro100-library'::text));

CREATE POLICY "pro100_library_storage_select_authenticated" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING ((bucket_id = 'pro100-library'::text));

CREATE POLICY "pro100_library_storage_update_authenticated" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING ((bucket_id = 'pro100-library'::text))
  WITH CHECK ((bucket_id = 'pro100-library'::text));

CREATE POLICY "staff_full_access" ON "storage"."objects"
  FOR ALL
  TO "authenticated"
  USING ((bucket_id = 'project-files'::text))
  WITH CHECK ((bucket_id = 'project-files'::text));
