CREATE TABLE "public"."pro100_library_categories" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "slug"       text                     NOT NULL,
  "name"       text                     NOT NULL,
  "sort_order" integer                  NOT NULL DEFAULT 0,
  "is_active"  boolean                  NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pro100_library_categories_name_check" CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 60))),
  CONSTRAINT "pro100_library_categories_name_key" UNIQUE (name),
  CONSTRAINT "pro100_library_categories_pkey" PRIMARY KEY (id),
  CONSTRAINT "pro100_library_categories_slug_check" CHECK ((slug ~ '^[a-z0-9-]+$'::text)),
  CONSTRAINT "pro100_library_categories_slug_key" UNIQUE (slug)
);

ALTER TABLE "public"."pro100_library_categories"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pro100_library_categories_select_authenticated" ON "public"."pro100_library_categories"
  FOR SELECT
  TO "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pro100_library_categories" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pro100_library_categories" TO "service_role";

REVOKE ALL ON TABLE "public"."pro100_library_categories" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pro100_library_categories" TO "postgres";

REVOKE ALL ON TABLE "public"."pro100_library_categories" FROM "anon";
