// supabase/functions/generate-embeddings/index.ts
//
// Шаг 2: принимает текст, просит Voyage AI превратить его в "координаты
// смысла" (embedding) и сохраняет в таблицу knowledge_base.
// Это строительный блок — сам по себе он ничего не ищет, просто
// заполняет таблицу. Поиск и AI-ассистент добавим на шаге 3.

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

    const { source_table, source_id, content } = await req.json();

    if (!source_table || !source_id || typeof content !== "string" || content.length > 20_000) {
      return new Response(
        JSON.stringify({ error: "Нужны поля source_table, source_id и content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const voyageKey = Deno.env.get("VOYAGE_API_KEY");
    if (!voyageKey) {
      return new Response(
        JSON.stringify({ error: "VOYAGE_API_KEY не настроен в секретах Supabase" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Просим Voyage AI превратить текст в координаты смысла
    const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${voyageKey}`,
      },
      body: JSON.stringify({
        input: [content],
        model: "voyage-3.5",
        input_type: "document",
      }),
    });

    if (!voyageRes.ok) {
      const errText = await voyageRes.text();
      return new Response(
        JSON.stringify({ error: `Ошибка Voyage AI: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const voyageData = await voyageRes.json();
    const embedding = voyageData.data[0].embedding;

    // 2. Сохраняем в knowledge_base. Сначала удаляем старую запись
    //    для этого источника (если была) — проще, чем возиться с
    //    уникальными ограничениями на этом этапе.
    await supabase
      .from("knowledge_base")
      .delete()
      .eq("source_table", source_table)
      .eq("source_id", source_id);

    const { error: insertError } = await supabase.from("knowledge_base").insert({
      source_table,
      source_id,
      content,
      embedding,
    });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: `Ошибка сохранения: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-embeddings failed", err);
    return new Response(
      JSON.stringify({ error: safeErrorMessage(err, "Nie udało się wygenerować embeddings") }),
      { status: errorStatus(err), headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
