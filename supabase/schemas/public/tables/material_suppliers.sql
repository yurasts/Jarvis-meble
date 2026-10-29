CREATE TABLE "public"."material_suppliers" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "material_id"    bigint                   NOT NULL,
  "supplier_id"    uuid                     NOT NULL,
  "supplier_sku"   text                     NOT NULL DEFAULT ''::text,
  "supplier_price" numeric(12,2),
  "is_preferred"   boolean                  NOT NULL DEFAULT false,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "material_suppliers_pkey" PRIMARY KEY (id),
  CONSTRAINT "material_suppliers_material_supplier_key" UNIQUE (material_id, supplier_id),
  CONSTRAINT "material_suppliers_material_id_fkey" FOREIGN KEY (material_id)
    REFERENCES public.materials(id) ON DELETE CASCADE,
  CONSTRAINT "material_suppliers_supplier_id_fkey" FOREIGN KEY (supplier_id)
    REFERENCES public.suppliers(id) ON DELETE CASCADE,
  CONSTRAINT "material_suppliers_supplier_price_check" CHECK (supplier_price IS NULL OR supplier_price >= 0)
);

CREATE INDEX material_suppliers_supplier_id_idx
  ON public.material_suppliers USING btree (supplier_id);

CREATE UNIQUE INDEX material_suppliers_one_preferred_idx
  ON public.material_suppliers USING btree (material_id)
  WHERE is_preferred;

ALTER TABLE "public"."material_suppliers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_suppliers_staff_all" ON "public"."material_suppliers"
  FOR ALL
  TO authenticated
  USING ((public.current_role_name() IS NOT NULL))
  WITH CHECK ((public.current_role_name() IS NOT NULL));

CREATE TRIGGER material_suppliers_sync_legacy_name
  AFTER INSERT OR UPDATE OR DELETE ON public.material_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.material_suppliers_sync_legacy_name();

REVOKE ALL ON TABLE "public"."material_suppliers" FROM "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE "public"."material_suppliers" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."material_suppliers" TO "service_role";
REVOKE ALL ON TABLE "public"."material_suppliers" FROM "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."material_suppliers" TO "postgres";
