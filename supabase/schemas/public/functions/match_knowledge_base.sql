CREATE OR REPLACE FUNCTION public.match_knowledge_base (
  query_embedding public.vector,
  match_count     integer       DEFAULT 5
)
  RETURNS TABLE (
    source_table text,
    source_id    text,
    content      text,
    similarity   double precision
  )
  LANGUAGE sql
  STABLE
  AS $function$
  select
    source_table,
    source_id,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from knowledge_base
  order by embedding <=> query_embedding
  limit match_count;
$function$;

GRANT EXECUTE ON FUNCTION "public"."match_knowledge_base"(public.vector, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."match_knowledge_base"(public.vector, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."match_knowledge_base"(public.vector, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."match_knowledge_base"(public.vector, integer) TO "postgres";
