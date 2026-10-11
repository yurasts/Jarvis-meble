// supabase/functions/create-employee/index.ts
//
// Создаёт нового сотрудника: пользователя в Auth + запись в profiles.
// ВАЖНО: доступно только владельцу (role = 'owner') — функция проверяет
// токен вызывающего перед тем, как что-либо создавать.

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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await authorizeStaff(req, supabaseAdmin, { allowedRoles: ["owner"] });

    // 2. Валидация входных данных
    const { email, password, full_name, role, color } = await req.json();

    if (!email || !password || !full_name) {
      return new Response(
        JSON.stringify({ error: "Wymagane: email, hasło, imię i nazwisko" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Hasło musi mieć co najmniej 6 znaków" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const allowedRoles = ["owner", "assembler", "designer", "installer"];
    const finalRole = allowedRoles.includes(role) ? role : "installer";

    // 3. Создаём пользователя в Auth
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (userError) {
      return new Response(
        JSON.stringify({ error: `Błąd tworzenia użytkownika: ${userError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Создаём профиль
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: userData.user.id,
      full_name,
      role: finalRole,
      color: color || "#718096",
    });

    if (profileError) {
      // Если профиль не сохранился — откатываем созданного пользователя
      await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
      return new Response(
        JSON.stringify({ error: `Błąd tworzenia profilu: ${profileError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: userData.user.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("create-employee failed", err);
    return new Response(
      JSON.stringify({ error: safeErrorMessage(err, "Nie udało się utworzyć pracownika") }),
      { status: errorStatus(err), headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
