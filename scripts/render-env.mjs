/**
 * Day bien moi truong len Render service tu file `.env.render`.
 *
 * Dung:
 *   $env:RENDER_API_KEY="<render-api-key>"
 *   node scripts/render-env.mjs
 */
import { readFileSync, existsSync } from 'node:fs'

const KEY = process.env.RENDER_API_KEY
if (!KEY) {
  console.error('Thieu RENDER_API_KEY.')
  process.exit(1)
}

const SERVICE_ID = process.env.RENDER_SERVICE_ID ?? 'srv-dc27g0s0916s73elopkg'

const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

/* --- Doc .env.render --- */
function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return out
}

const rootDir = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const envFile = loadEnvFile(`${rootDir}.env.render`)

const keys = Object.keys(envFile)
console.log(`=== Day ${keys.length} bien moi truong ===\n`)

for (const key of keys) {
  const value = envFile[key]
  const res = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/env-vars/${key}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ value }),
  })
  const ok = res.status === 200 || res.status === 201
  console.log(`  ${ok ? '[OK]  ' : '[FAIL]'} ${key} -> ${res.status}${ok ? '' : ' ' + (await res.text()).slice(0, 150)}`)
}

/* --- Xac nhan --- */
console.log('\n=== Xac nhan ===')
const listRes = await fetch(
  `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`,
  { headers },
)
if (listRes.ok) {
  const body = await listRes.json()
  const raw = Array.isArray(body) ? body : (body?.envVars ?? [])
  for (const item of raw) {
    const v = item.envVar ?? item
    const masked = /SECRET|KEY|DATABASE_URL/i.test(v.key)
      ? `${String(v.value).slice(0, 20)}...`
      : v.value
    console.log(`  ${v.key} = ${masked}`)
  }
}

/* --- Trigger deploy --- */
console.log('\n=== Kick off deploy ===')
const deployRes = await fetch(
  `https://api.render.com/v1/services/${SERVICE_ID}/deploys`,
  {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  },
)
console.log(`  deploy -> ${deployRes.status}`)
if (!deployRes.ok) console.log(`  ${(await deployRes.text()).slice(0, 300)}`)
