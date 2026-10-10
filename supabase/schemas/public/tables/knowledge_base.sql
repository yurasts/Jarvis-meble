CREATE TABLE "public"."knowledge_base" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "source_table" text                     NOT NULL,
  "source_id"    text                     NOT NULL,
  "content"      text                     NOT NULL,
  "embedding"    public.vector(1024),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "knowledge_base_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."knowledge_base"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX knowledge_base_embedding_idx ON public.knowledge_base USING hnsw (embedding public.vector_cosine_ops);

CREATE INDEX knowledge_base_source_idx ON public.knowledge_base USING btree (source_table, source_id);

CREATE POLICY "staff_full_access_knowledge_base" ON "public"."knowledge_base"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."knowledge_base" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."knowledge_base" TO "service_role";

REVOKE ALL ON TABLE "public"."knowledge_base" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."knowledge_base" TO "postgres";
