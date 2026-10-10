CREATE TABLE "public"."hardware" (
  "id"         integer                  NOT NULL DEFAULT nextval('public.hardware_id_seq'::regclass),
  "name"       text,
  "price"      numeric,
  "details"    jsonb                    DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "hardware_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."hardware"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "public"."hardware_id_seq" OWNED BY "public"."hardware"."id";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."hardware" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."hardware" TO "service_role";

REVOKE ALL ON TABLE "public"."hardware" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."hardware" TO "postgres";
