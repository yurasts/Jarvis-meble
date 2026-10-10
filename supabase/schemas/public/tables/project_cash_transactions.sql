CREATE TABLE "public"."project_cash_transactions" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "project_id"  bigint                   NOT NULL,
  "direction"   text                     NOT NULL,
  "amount"      numeric(12,2)            NOT NULL,
  "occurred_on" date                     NOT NULL DEFAULT CURRENT_DATE,
  "description" text                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "project_cash_transactions_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "project_cash_transactions_description_check" CHECK (((char_length(TRIM(BOTH FROM description)) >= 1) AND (char_length(TRIM(BOTH FROM description)) <= 200))),
  CONSTRAINT "project_cash_transactions_direction_check" CHECK ((direction = ANY (ARRAY['inflow'::text, 'outflow'::text]))),
  CONSTRAINT "project_cash_transactions_pkey" PRIMARY KEY (id),
  CONSTRAINT "project_cash_transactions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.clients(id) ON DELETE CASCADE,
  "created_by"  uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."project_cash_transactions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX project_cash_transactions_project_id_idx ON public.project_cash_transactions USING btree (project_id);

CREATE INDEX project_cash_transactions_project_id_occurred_on_idx ON public.project_cash_transactions USING btree (project_id, occurred_on DESC);

CREATE TRIGGER project_cash_transactions_set_updated_at
  BEFORE UPDATE ON public.project_cash_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.project_cash_transactions_set_updated_at();

CREATE POLICY "project_cash_transactions_delete_if_client_visible" ON "public"."project_cash_transactions"
  FOR DELETE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE (c.id = project_cash_transactions.project_id))));

CREATE POLICY "project_cash_transactions_insert_if_client_visible" ON "public"."project_cash_transactions"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE (c.id = project_cash_transactions.project_id))));

CREATE POLICY "project_cash_transactions_select_if_client_visible" ON "public"."project_cash_transactions"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE (c.id = project_cash_transactions.project_id))));

CREATE POLICY "project_cash_transactions_update_if_client_visible" ON "public"."project_cash_transactions"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE (c.id = project_cash_transactions.project_id))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE (c.id = project_cash_transactions.project_id))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_cash_transactions" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_cash_transactions" TO "service_role";

REVOKE ALL ON TABLE "public"."project_cash_transactions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_cash_transactions" TO "postgres";
