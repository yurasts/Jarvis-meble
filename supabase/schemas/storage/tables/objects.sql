CREATE POLICY "project_files_storage_visible_project_access" ON "storage"."objects"
  FOR ALL
  TO "authenticated"
  USING (((bucket_id = 'project-files'::text) AND (EXISTS ( SELECT 1
   FROM public.clients visible_client
  WHERE ((visible_client.id)::text = (storage.foldername(objects.name))[1])))))
  WITH CHECK (((bucket_id = 'project-files'::text) AND (EXISTS ( SELECT 1
   FROM public.clients visible_client
  WHERE ((visible_client.id)::text = (storage.foldername(objects.name))[1])))));

CREATE POLICY "project_files_storage_owner_delete_orphans" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'project-files'::text) AND (public.current_role_name() = 'owner'::text) AND (NOT (EXISTS ( SELECT 1
   FROM public.clients existing_client
  WHERE ((existing_client.id)::text = (storage.foldername(objects.name))[1]))))));

CREATE POLICY "project_files_storage_owner_select_orphans" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'project-files'::text) AND (public.current_role_name() = 'owner'::text) AND (NOT (EXISTS ( SELECT 1
   FROM public.clients existing_client
  WHERE ((existing_client.id)::text = (storage.foldername(objects.name))[1]))))));

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
