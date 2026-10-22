CREATE TABLE "public"."user_activity_logs" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"     uuid                     NOT NULL,
  "user_email"  text,
  "user_name"   text,
  "event_type"  text                     NOT NULL,
  "device_type" text                     NOT NULL,
  "user_agent"  text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_activity_logs_device_type_check" CHECK ((device_type = ANY (ARRAY['mobile'::text, 'desktop'::text]))),
  CONSTRAINT "user_activity_logs_event_type_check" CHECK ((event_type = ANY (ARRAY['sign_in'::text, 'session_start'::text]))),
  CONSTRAINT "user_activity_logs_pkey" PRIMARY KEY (id),
  CONSTRAINT "user_activity_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX "user_activity_logs_created_at_idx"
  ON "public"."user_activity_logs" USING btree (created_at DESC);

CREATE INDEX "user_activity_logs_user_created_at_idx"
  ON "public"."user_activity_logs" USING btree (user_id, created_at DESC);

ALTER TABLE "public"."user_activity_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_activity_logs_select_owner" ON "public"."user_activity_logs"
  FOR SELECT
  TO authenticated
  USING ((public.current_role_name() = 'owner'::text));

REVOKE ALL ON TABLE "public"."user_activity_logs" FROM PUBLIC, "anon", "authenticated";

GRANT SELECT ON TABLE "public"."user_activity_logs" TO "authenticated";

GRANT ALL ON TABLE "public"."user_activity_logs" TO "service_role";
