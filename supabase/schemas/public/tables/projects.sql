CREATE TABLE "public"."projects" (
  "id"                 text,
  "client_id"          text,
  "status"             text,
  "address"            text,
  "coordinates"        text,
  "total_price"        bigint,
  "advance_payment"    bigint,
  "hardware_cost"      bigint,
  "pro100_file_url"    text,
  "deadline"           text,
  "responsible_master" text,
  "created_at"         timestamp with time zone
);

ALTER TABLE "public"."projects"
  ENABLE ROW LEVEL SECURITY;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."projects" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."projects" TO "service_role";

REVOKE ALL ON TABLE "public"."projects" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."projects" TO "postgres";
