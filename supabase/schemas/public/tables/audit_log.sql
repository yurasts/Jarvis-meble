CREATE TABLE "public"."audit_log" (
  "id"         bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "table_name" text                     NOT NULL,
  "record_id"  bigint                   NOT NULL,
  "changed_by" uuid,
  "changed_at" timestamp with time zone DEFAULT now(),
  "action"     text                     NOT NULL,
  "old_data"   jsonb,
  "new_data"   jsonb,
  CONSTRAINT "audit_log_pkey" PRIMARY KEY (id),
  CONSTRAINT "audit_log_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES public.profiles(id)
);

ALTER TABLE "public"."audit_log"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_owner_only" ON "public"."audit_log"
  FOR SELECT
  TO PUBLIC
  USING ((public.current_role_name() = 'owner'::text));

REVOKE ALL ON SEQUENCE "public"."audit_log_id_seq" FROM "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."audit_log_id_seq" TO "anon";

REVOKE ALL ON SEQUENCE "public"."audit_log_id_seq" FROM "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."audit_log_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."audit_log_id_seq" TO "postgres";

REVOKE ALL ON SEQUENCE "public"."audit_log_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_log" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_log" TO "service_role";

REVOKE ALL ON TABLE "public"."audit_log" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_log" TO "postgres";
