CREATE TABLE "public"."user_presence" (
  "user_id"          uuid                     NOT NULL,
  "last_seen_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "last_device_type" text                     NOT NULL,
  "last_user_agent"  text,
  CONSTRAINT "user_presence_device_type_check" CHECK ((last_device_type = ANY (ARRAY['mobile'::text, 'desktop'::text]))),
  CONSTRAINT "user_presence_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "user_presence_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."user_presence"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_presence_select_owner" ON "public"."user_presence"
  FOR SELECT
  TO authenticated
  USING ((public.current_role_name() = 'owner'::text));

REVOKE ALL ON TABLE "public"."user_presence" FROM PUBLIC, "anon", "authenticated";

GRANT SELECT ON TABLE "public"."user_presence" TO "authenticated";

GRANT ALL ON TABLE "public"."user_presence" TO "service_role";
