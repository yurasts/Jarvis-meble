CREATE TABLE "public"."drive_sync_state" (
  "singleton_id"      smallint                 NOT NULL DEFAULT 1,
  "locked_by_host"    text,
  "lease_until"       timestamp with time zone,
  "last_heartbeat_at" timestamp with time zone,
  "sync_root_path"    text,
  "last_sync_at"      timestamp with time zone,
  "last_sync_summary" jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "last_error"        text,
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "drive_sync_state_pkey" PRIMARY KEY (singleton_id),
  CONSTRAINT "drive_sync_state_singleton_check" CHECK (singleton_id = 1),
  CONSTRAINT "drive_sync_state_summary_object_check" CHECK (jsonb_typeof(last_sync_summary) = 'object'::text)
);

ALTER TABLE "public"."drive_sync_state"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drive_sync_state_select_owner" ON "public"."drive_sync_state"
  FOR SELECT
  TO "authenticated"
  USING ((public.current_role_name() = 'owner'::text));

REVOKE ALL ON TABLE "public"."drive_sync_state" FROM PUBLIC, "anon", "authenticated";

GRANT SELECT ON TABLE "public"."drive_sync_state" TO "authenticated";

GRANT ALL ON TABLE "public"."drive_sync_state" TO "service_role";
