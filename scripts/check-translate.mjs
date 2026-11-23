/**
 * Kiem tra model nao khua dung tren API provider, va thu mot lenh dich that.
 *
 * Dung:
 *   node scripts/check-translate.mjs <api-key> [base-url]
 */
const KEY = process.argv[2]
const BASE = (process.argv[3] ?? 'https://modelapi.vn/v1').replace(/\/+$/, '')

if (!KEY) {
  console.error('Thieu api key.')
  console.error('Usage: node scripts/check-translate.mjs <api-key> [base-url]')
  process.exit(1)
}

const auth = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

/* 1. Danh sach model */
console.log(`=== Model tai ${BASE} ===`)
try {
  const r = await fetch(`${BASE}/models`, { headers: auth })
  console.log(`status=${r.status}`)
  if (r.ok) {
    const body = await r.json()
    const list = body?.data ?? body?.models ?? []
    const ids = list.map((m) => m.id ?? m.name ?? m).filter(Boolean)
    console.log(`  ${ids.length} model`)
    const interesting = ids.filter((id) => /codex|terra|sol|astra|luna/i.test(String(id)))
    console.log('  --- model codex/gpt-6 ---')
    for (const id of interesting) console.log(`    ${id}`)
  } else {
    console.log((await r.text()).slice(0, 300))
  }
} catch (e) {
  console.log(`  loi: ${e.message}`)
}

/* 2. Thu mot lenh dich that bang chat/completions + json_schema */
console.log('\n=== Thu lenh dich that ===')
const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { key: { type: 'string' }, text: { type: 'string' } },
        required: ['key', 'text'],
      },
    },
  },
  required: ['translations'],
}

const models = (process.env.KNIT_TEST_MODELS ?? 'gpt-5.6-terra,gpt-5.2-codex,gpt-5.1-codex')
  .split(',')

for (const model of models) {
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'Ban la cong cu dich thuat. Dich tieng Viet sang tieng Anh tu nhien. ' +
              'Tra ve JSON theo schema.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              segments: [{ key: 'title', text: 'Lam the sinh vien o dau?' }],
            }),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'translations', strict: true, schema },
        },
      }),
    })

    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      console.log(`  [FAIL] ${model} -> ${r.status} ${detail.slice(0, 180)}`)
      continue
    }

    const body = await r.json()
    const raw = body?.choices?.[0]?.message?.content
    console.log(`  [OK]   ${model}`)
    console.log(`         raw = ${String(raw).slice(0, 200)}`)
    try {
      const parsed = JSON.parse(raw)
      console.log(`         parsed = ${JSON.stringify(parsed).slice(0, 200)}`)
    } catch {
      console.log('         (KHONG phai JSON hop le)')
    }
  } catch (e) {
    console.log(`  [FAIL] ${model} -> ${e.message}`)
  }
}
