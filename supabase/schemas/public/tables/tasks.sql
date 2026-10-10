CREATE TABLE "public"."tasks" (
  "id"         integer                  NOT NULL DEFAULT nextval('public.tasks_id_seq'::regclass),
  "title"      text,
  "project_id" integer,
  "is_done"    boolean                  DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "tasks_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."tasks"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "public"."tasks_id_seq" OWNED BY "public"."tasks"."id";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tasks" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tasks" TO "service_role";

REVOKE ALL ON TABLE "public"."tasks" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tasks" TO "postgres";
