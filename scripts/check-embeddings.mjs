import { readFileSync } from 'node:fs'

/**
 * Kiem tra provider co ho tro embedding khong.
 *
 * Dung: node scripts/check-embeddings.mjs
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

const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } })
const data = await res.json()
const ids = (data.data ?? []).map((m) => m.id)

console.log('Tat ca model tren provider:')
for (const id of ids) console.log(`  ${id}`)

const embeds = ids.filter((id) => /embed|embedd|text-embed/i.test(id))
console.log(`\nModel embedding: ${embeds.length ? embeds.join(', ') : '(KHONG CO)'}`)
