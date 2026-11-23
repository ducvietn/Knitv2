import { readFileSync } from 'node:fs'

/**
 * Uoc luong chi phi translate va dua ra canh bao.
 *
 * Script nay KHONG chay tren Render — no chi doc `.env.render` de do chi phi
 * thuc te cua provider, roi in ra so lieu de uoc luong ngansach.
 *
 * Dung: node scripts/translate-cost-report.mjs
 */

const env = Object.fromEntries(
  readFileSync('.env.render', 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const BASE = (env.KNIT_TRANSLATE_BASE_URL ?? 'https://modelapi.vn/v1').replace(/\/+$/, '')
const KEY = env.OPENAI_API_KEY
const MODEL = env.KNIT_TRANSLATE_MODEL ?? 'gpt-5.6-terra'

// Gia cua gpt-5.6-terra (USD / 1M token).
const PRICE_IN = 2
const PRICE_OUT = 12

/** Chi phi da dung tren provider. */
async function usedUsd() {
  const res = await fetch(`${BASE}/dashboard/billing/usage`, {
    headers: { Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return typeof data.total_usage === 'number' ? data.total_usage : null
}

const used = await usedUsd()
if (used !== null) {
  console.log(`Da dung: $${used.toFixed(4)}`)
}

// Do chi phi thuc te cua mot lan goi API voi kich thuoc noi dung mau.
const SCHEMA = {
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

const SYSTEM =
  'Ban la cong cu dich thuat cho sinh vien Dai hoc Quoc gia TP.HCM (ULIS). ' +
  'Dich tieng Viet sang tieng Anh tu nhien, ro rang, dung thuat ngu hanh chinh va hoc thuat. ' +
  'Giu nguyen ten rieng, so, don vi do va URL. Khong them bot y, khong binh luan.'

async function measure(label, segments) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: JSON.stringify({ segments }) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'translations', strict: true, schema: SCHEMA },
    },
  }

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.log(`${label}: LOI ${res.status}`)
    return
  }
  const data = await res.json()
  const u = data.usage ?? {}
  const cost = (u.prompt_tokens / 1e6) * PRICE_IN + (u.completion_tokens / 1e6) * PRICE_OUT
  console.log(
    `${label}: in=${u.prompt_tokens} out=${u.completion_tokens} chi_phi=$${cost.toFixed(6)}`,
  )
  return cost
}

const short = { key: 'title', text: 'Sinh vien NNA thi nen chon ngon ngu 2 la gi' }
const long = {
  key: 'body',
  text: 'Toi la sinh vien nam nhat, moi nhung thac mac ve viec dang ky hoc phan. Khi dang ky co bi trung lich voi mot mon khac, thi co duoc uu tien gi khong? Toi nghe noi nam truoc co quy tac uu tien theo nam hoc, nhung khong biet con dung khong.',
}

await measure('1 doan ngan', [short])
await measure('1 doan dai', [long])
await measure('10 doan dai', Array.from({ length: 10 }, (_, i) => ({ key: `s${i}`, text: `${long.text} #${i}` })))
