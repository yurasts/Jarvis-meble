import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0"
import { authorizeStaff, errorStatus, safeErrorMessage } from "../_shared/authorizeStaff.js"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    await authorizeStaff(req, supabaseAdmin)

    const { imageBase64, imageType, materials } = await req.json()

    if (typeof imageBase64 !== 'string' || imageBase64.length === 0 || imageBase64.length > 15_000_000) {
      return new Response(JSON.stringify({ error: 'Invalid invoice image' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if (!Array.isArray(materials) || materials.length > 5_000 || typeof imageType !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid invoice payload' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured in Supabase Secrets')

    // Передаём Claude список материалов из базы — он сам сопоставит по названию/символу
    const matList = materials
      .map((m: any) => `ID:${m.id} | ${m.name}${m.symbol ? ' | Sym:' + m.symbol : ''} | ${m.price} zł`)
      .join('\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageType, data: imageBase64 }
            },
            {
              type: 'text',
              text: `Na zdjęciu jest faktura lub cennik od dostawcy materiałów meblowych.

Moja baza materiałów:
${matList}

Zadanie: Dla każdej pozycji na fakturze znajdź dopasowanie w bazie (po nazwie lub symbolu, ignoruj różnice wielkości liter i drobne różnice pisowni). Zwróć TYLKO JSON array bez żadnego tekstu przed ani po:
[{"material_id": 123, "material_name": "nazwa z bazy", "old_price": 166.60, "new_price": 170.00}]

Zwróć tylko pozycje gdzie znalazłeś dopasowanie I gdzie cena się różni od aktualnej. Jeśli nic nie pasuje lub ceny są takie same — zwróć [].`
            }
          ]
        }]
      })
    })

    const data = await res.json()
    const text = (data.content?.[0]?.text || '').trim()

    // Безопасно извлекаем JSON из ответа
    const match = text.match(/\[[\s\S]*\]/)
    const result = match ? JSON.parse(match[0]) : []

    return new Response(JSON.stringify({ result }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: safeErrorMessage(err, 'Invoice processing failed') }), {
      status: errorStatus(err),
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
