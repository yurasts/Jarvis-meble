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
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

    // Формируем список материалов сгруппированный по категориям
    const matList = materials
      .map((m: any) =>
        `ID:${m.id} | BAZA:"${m.name}" | CENA_BAZA:${m.price} zł${m.symbol ? ' | SYM:' + m.symbol : ''}`
      )
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
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageType, data: imageBase64 }
            },
            {
              type: 'text',
              text: `Jesteś ekspertem od materiałów meblowych. Na zdjęciu jest faktura od dostawcy płyt i akcesoriów meblowych.

ZADANIE: Odczytaj pozycje z faktury i dopasuj je do mojej bazy materiałów. Szukaj zmian cen.

=== MOJA BAZA MATERIAŁÓW ===
${matList}

=== ALGORYTM DOPASOWANIA (wykonaj krok po kroku) ===

KROK 1 — Odczytaj fakturę:
Dla każdej pozycji na fakturze wypisz: kod produktu, nazwę, cenę jednostkową BRUTTO.

KROK 2 — Znajdź dopasowanie w bazie:
Stosuj LUŹNE dopasowanie — nazwa na fakturze i w bazie nigdy nie jest identyczna.

REGUŁY LUŹNEGO DOPASOWANIA:
a) Wyodrębnij KOD z nazwy (np. W960, H1367, U702, ABS W1000, PL W960 SM)
b) Wyodrębnij KOLOR/DEKÓR (np. "Biały Klasyczny", "Szary Beton", "Dąb Sonoma")  
c) Wyodrębnij WYMIAR (np. 2800x2070x18, 23x0.8mm, 1000x1310x0.6mm)
d) Ignoruj przyrostki wersji: NEW, OLD, SM, ST, ST9, ST10, ST19, ST38, ST40, V2, Plus, Pro
e) Ignoruj kolejność słów: "Biały Klasyczny SM" = "SM Biały Klasyczny" = "Klasyczny Biały"
f) Skróty: PL=Płyta, ABS=Obrzeże ABS, HDF=Płyta HDF, LM=Laminat

PRZYKŁADY DOPASOWANIA:
- Faktura: "PL W960 SM 2800x2070x18 Biały Klasyczny SM" → Baza: "PL W960 SM 2800x2070x18 Biały Klasyczny SM" ✓ PASUJE
- Faktura: "ABS W1000 ST9 23x0,8mm Biały Premium NEW" → Baza: "ABS W1000 ST9 23x0,8mm Biały Premium" ✓ PASUJE (ignoruj NEW)
- Faktura: "Płyta wiórowa 18mm Biały Alpejski 2800x2070" → Baza: "PL U702 ST9 2800x2070x18 Biały Alpejski" ✓ PASUJE (kod U702=Biały Alpejski)
- Faktura: "LAMINAT H3730 1000x1310 Hikora" → Baza: "LAMINAT H3730 ST10 1000x1310x0,6mm Hikora Naturalna" ✓ PASUJE

KROK 3 — Porównaj ceny:
- Cena na fakturze = cena BRUTTO za jednostkę (z VAT 23%)
- Zwróć tylko pozycje gdzie |cena_faktury - cena_bazy| > 0.05 zł
- Jeśli nie możesz dopasować pozycji z faktury do bazy — pomiń ją

KROK 4 — Zwróć wynik:
Zwróć TYLKO i WYŁĄCZNIE JSON array, zero tekstu przed ani po:

[
  {
    "material_id": 123,
    "material_name": "dokładna nazwa z bazy",
    "old_price": 166.60,
    "new_price": 146.61,
    "confidence": "high",
    "match_reason": "kod W960 + Biały Klasyczny + 18mm"
  }
]

Jeśli żadna pozycja nie pasuje lub ceny się nie zmieniły — zwróć [].
Zwróć TYLKO JSON, nic więcej.`
            }
          ]
        }]
      })
    })

    const data = await res.json()
    const text = (data.content?.[0]?.text || '').trim()
    console.log('Claude response:', text)

    // Парсим JSON — ищем массив в ответе
    let result = []
    try {
      // Сначала пробуем весь ответ
      result = JSON.parse(text)
    } catch {
      // Если не получилось — вырезаем массив из текста
      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        try {
          result = JSON.parse(match[0])
        } catch (e) {
          console.error('JSON parse error:', e)
          result = []
        }
      }
    }

    // Фильтруем — только те у кого есть material_id и разница цен > 0.05
    result = result.filter((item: any) =>
      item.material_id &&
      item.new_price !== undefined &&
      item.old_price !== undefined &&
      Math.abs(Number(item.new_price) - Number(item.old_price)) > 0.05
    )

    // Проверяем что material_id существует в базе
    const validIds = new Set(materials.map((m: any) => m.id))
    result = result.filter((item: any) => validIds.has(item.material_id))

    console.log(`Found ${result.length} price changes`)
    return new Response(JSON.stringify({ result }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: safeErrorMessage(err, 'Invoice processing failed') }), {
      status: errorStatus(err),
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
