CREATE SEQUENCE "public"."media_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."media_id_seq" TO "anon", "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."media_id_seq" TO "service_role";

REVOKE ALL ON SEQUENCE "public"."media_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."media_id_seq" TO "postgres";
