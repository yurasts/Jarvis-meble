CREATE TABLE "public"."profiles" (
  "id"            uuid                     NOT NULL,
  "full_name"     text,
  "role"          text                     NOT NULL,
  "language"      text                     NOT NULL DEFAULT 'pl'::text,
  "created_at"    timestamp with time zone DEFAULT now(),
  "color"         text                     NOT NULL DEFAULT '#718096'::text,
  "theme"         text                     NOT NULL DEFAULT 'light'::text,
  "default_scope" text                     NOT NULL DEFAULT 'firma'::text,
  CONSTRAINT "profiles_default_scope_check" CHECK ((default_scope = ANY (ARRAY['firma'::text, 'personal'::text]))),
  CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'assembler'::text, 'designer'::text, 'installer'::text]))),
  CONSTRAINT "profiles_theme_check" CHECK ((theme = ANY (ARRAY['light'::text, 'dark'::text, 'forest'::text])))
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_protect_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_role_column();

CREATE POLICY "profiles_select_authenticated" ON "public"."profiles"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "profiles_update_self_or_owner" ON "public"."profiles"
  FOR UPDATE
  TO PUBLIC
  USING (((auth.uid() = id) OR (public.current_role_name() = 'owner'::text)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";
