CREATE TABLE "public"."suppliers" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"            text                     NOT NULL,
  "address"         text                     NOT NULL DEFAULT ''::text,
  "google_maps_url" text                     NOT NULL DEFAULT ''::text,
  "phone"           text                     NOT NULL DEFAULT ''::text,
  "email"           text                     NOT NULL DEFAULT ''::text,
  "contact_person"  text                     NOT NULL DEFAULT ''::text,
  "notes"           text                     NOT NULL DEFAULT ''::text,
  "is_archived"     boolean                  NOT NULL DEFAULT false,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  -- Preserved from the legacy supplier directory so existing data is not discarded.
  "category"        text                     NOT NULL DEFAULT 'Inne'::text,
  "hours"           text,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX suppliers_name_normalized_uidx
  ON public.suppliers USING btree (lower(btrim(name)));

ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_staff_all" ON "public"."suppliers"
  FOR ALL
  TO authenticated
  USING ((public.current_role_name() IS NOT NULL))
  WITH CHECK ((public.current_role_name() IS NOT NULL));

CREATE TRIGGER suppliers_set_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.suppliers_set_updated_at();

CREATE TRIGGER suppliers_sync_legacy_name
  AFTER UPDATE OF name ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.suppliers_sync_legacy_name();

REVOKE ALL ON TABLE "public"."suppliers" FROM "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE "public"."suppliers" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."suppliers" TO "service_role";
REVOKE ALL ON TABLE "public"."suppliers" FROM "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."suppliers" TO "postgres";
