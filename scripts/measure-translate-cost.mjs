import { readFileSync } from 'node:fs'

// Doc env tu file de khong lo key vao shell history.
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

/** Do token thuc te cua tung kich thuoc noi dung. */
async function measure(label, segments) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: JSON.stringify({ segments }) },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'translations', strict: true, schema: SCHEMA } },
  }

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    console.log(`${label}: LOI ${res.status} ${(await res.text()).slice(0, 200)}`)
    return
  }

  const data = await res.json()
  const u = data.usage ?? {}
  const inTok = u.prompt_tokens ?? 0
  const outTok = u.completion_tokens ?? 0
  const cost = (inTok / 1e6) * 2 + (outTok / 1e6) * 12

  console.log(
    `${label}: in=${inTok} out=${outTok} (reasoning=${u.completion_tokens_details?.reasoning_tokens ?? 0}) ` +
      `total=${inTok + outTok} cost=$${cost.toFixed(6)}`,
  )
  return { inTok, outTok, cost }
}

const realTitle = 'Sinh vien NNA thi nen chon ngon ngu 2 la gi'
const realBody = 'Nen dung ky mon hoc nao vay cac ban'
const longBody =
  'Toi la sinh vien nam nhat, moi nhung thac mac ve viec dang ky hoc phan. ' +
  'Khi dang ky co bi trung lich voi mot mon khac, thi co duoc uu tien gi khong? ' +
  'Toi nghe noi nam truoc co quy tac uu tien theo nam hoc, nhung khong biet con dung khong. ' +
  'Vay co cach nao de biet uu tien duoc ap dung cho truong hop cua toi khong?'

await measure('nho (title+body ngan)', [
  { key: 'title', text: realTitle },
  { key: 'body', text: realBody },
])

await measure('vua (1 cau hoi day du)', [
  { key: 'title', text: longBody },
  { key: 'body', text: longBody },
])

await measure('lon (10 cau hoi)', [
  ...Array.from({ length: 10 }, (_, i) => ({ key: `q${i}::title`, text: `${longBody} #${i}` })),
  ...Array.from({ length: 10 }, (_, i) => ({ key: `q${i}::body`, text: `${longBody} #${i}` })),
])
