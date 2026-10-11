// supabase/functions/ask-jarvis/index.ts
//
// Шаг 4: финальная функция-ассистент.
// Принимает вопрос → превращает его в координаты смысла → находит
// похожие записи в knowledge_base → просит Claude сформулировать
// ответ на основе найденного.

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
    await authorizeStaff(req, supabase);

    const { question } = await req.json();

    if (typeof question !== "string" || question.trim().length === 0 || question.length > 2_000) {
      return new Response(
        JSON.stringify({ error: "Нужно поле question" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const voyageKey = Deno.env.get("VOYAGE_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!voyageKey || !anthropicKey) {
      return new Response(
        JSON.stringify({ error: "Не настроены VOYAGE_API_KEY или ANTHROPIC_API_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Превращаем вопрос в координаты смысла
    const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${voyageKey}`,
      },
      body: JSON.stringify({
        input: [question],
        model: "voyage-3.5",
        input_type: "query",
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
    const queryEmbedding = voyageData.data[0].embedding;

    // 2. Ищем похожие записи в базе через нашу SQL-функцию
    const { data: matches, error: matchError } = await supabase.rpc("match_knowledge_base", {
      query_embedding: queryEmbedding,
      match_count: 5,
    });

    if (matchError) {
      return new Response(
        JSON.stringify({ error: `Ошибка поиска: ${matchError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const context = (matches ?? [])
      .map((m: { source_table: string; content: string }, i: number) =>
        `${i + 1}. [${m.source_table}] ${m.content}`
      )
      .join("\n");

    // 3. Просим Claude сформулировать ответ на основе найденного
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system:
          "Ты — помощник в мебельной мастерской Jarvis. Отвечай кратко и по делу на русском " +
          "языке, основываясь ТОЛЬКО на данных ниже. Если среди них нет ответа на вопрос — " +
          "честно скажи, что не нашёл подходящего.",
        messages: [
          {
            role: "user",
            content: `Вопрос: ${question}\n\nНайденные записи в базе:\n${context || "(ничего не найдено)"}`,
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return new Response(
        JSON.stringify({ error: `Ошибка Claude API: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const claudeData = await claudeRes.json();
    const answer = claudeData.content?.[0]?.text ?? "";

    return new Response(
      JSON.stringify({ answer, matches }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ask-jarvis failed", err);
    return new Response(
      JSON.stringify({ error: safeErrorMessage(err, "Nie udało się uzyskać odpowiedzi") }),
      { status: errorStatus(err), headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
