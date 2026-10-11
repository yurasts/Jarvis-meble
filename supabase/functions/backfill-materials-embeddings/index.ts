// supabase/functions/backfill-materials-embeddings/index.ts
//
// Шаг 3а: один раз прогоняет ВСЕ существующие материалы через Voyage AI
// и заполняет knowledge_base, чтобы старые данные тоже стали доступны
// для смыслового поиска. Можно запускать повторно в любой момент —
// просто пересчитает всё заново, ничего не сломает.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { authorizeStaff, errorStatus, safeErrorMessage } from "../_shared/authorizeStaff.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await authorizeStaff(req, supabase, { allowedRoles: ["owner"] });

    const voyageKey = Deno.env.get("VOYAGE_API_KEY");
    if (!voyageKey) {
      return new Response(
        JSON.stringify({ error: "VOYAGE_API_KEY не настроен" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Берём все материалы
    const { data: materials, error: fetchError } = await supabase
      .from("materials")
      .select("id, name, category, supplier, symbol");

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: `Ошибка чтения materials: ${fetchError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!materials || materials.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Готовим текст-описание для каждого материала
    const rows = materials.map((m) => ({
      id: m.id,
      content: [m.name, m.category, m.supplier, m.symbol].filter(Boolean).join(", "),
    }));

    // 3. Отправляем в Voyage AI пачками по 100 штук (быстрее, чем по одному)
    const batchSize = 100;
    let processed = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${voyageKey}`,
        },
        body: JSON.stringify({
          input: batch.map((b) => b.content),
          model: "voyage-3.5",
          input_type: "document",
        }),
      });

      if (!voyageRes.ok) {
        const errText = await voyageRes.text();
        return new Response(
          JSON.stringify({ error: `Ошибка Voyage AI: ${errText}`, processed }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const voyageData = await voyageRes.json();

      const toInsert = batch.map((b, idx) => ({
        source_table: "materials",
        source_id: b.id,
        content: b.content,
        embedding: voyageData.data[idx].embedding,
      }));

      const ids = batch.map((b) => b.id);
      await supabase
        .from("knowledge_base")
        .delete()
        .eq("source_table", "materials")
        .in("source_id", ids);

      const { error: insertError } = await supabase.from("knowledge_base").insert(toInsert);
      if (insertError) {
        return new Response(
          JSON.stringify({ error: `Ошибка сохранения: ${insertError.message}`, processed }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      processed += batch.length;
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("backfill-materials-embeddings failed", err);
    return new Response(
      JSON.stringify({ error: safeErrorMessage(err, "Nie udało się przeliczyć embeddings") }),
      { status: errorStatus(err), headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
