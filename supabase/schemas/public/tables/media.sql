CREATE TABLE "public"."media" (
  "id"         integer                  NOT NULL DEFAULT nextval('public.media_id_seq'::regclass),
  "url"        text,
  "project_id" integer,
  "type"       text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "media_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."media"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "public"."media_id_seq" OWNED BY "public"."media"."id";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."media" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."media" TO "service_role";

REVOKE ALL ON TABLE "public"."media" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."media" TO "postgres";
