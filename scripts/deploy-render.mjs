/**
 * Tao web service tren Render + gan bien moi truong.
 *
 * Render khong co lenh "deploy blueprint" qua API — phai tao service roi
 * gan bien moi truong rieng.
 *
 * Bien moi truong doc tu `.env.render` (gitignored) hoac tu `process.env`.
 *
 * Luu y: Render yeu cau thong tin thanh toan (card) cho bat ky service nao,
 * ke ca free plan. Neu API tra 402, them card tai
 * https://dashboard.render.com/billing roi chay lai script.
 */
import { readFileSync, existsSync } from 'node:fs'

const KEY = process.env.RENDER_API_KEY
if (!KEY) {
  console.error('Thieu RENDER_API_KEY. Lay tai Render > Account Settings > API Keys.')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

const OWNER_ID = process.env.RENDER_OWNER_ID ?? 'tea-d8mnpku7r5hc73a15cng'
const REPO_URL = 'https://github.com/ducvietn/Knitv2'
const SERVICE_NAME = process.env.RENDER_SERVICE_NAME ?? 'knit'

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
const fileEnv = loadEnvFile(`${rootDir}.env.render`)

/* --- 1. Service da ton tai chua? --- */
console.log('=== Kiem tra service hien co ===')
const listRes = await fetch('https://api.render.com/v1/services?limit=50', { headers })
const listBody = await listRes.json()
const services = (listBody?.services ?? []).map((s) => s.service ?? s)
let service = services.find((s) => s.name === SERVICE_NAME)

if (service) {
  console.log(`  tim thay: ${service.name} (${service.id})`)
} else {
  /* --- 2. Tao moi --- */
  console.log('\n=== Tao web service ===')
  const payload = {
    name: SERVICE_NAME,
    type: 'web_service',
    ownerID: OWNER_ID,
    repo: REPO_URL,
    branch: 'main',
    plan: 'free',
    autoDeployTrigger: 'commit',
    serviceDetails: {
      runtime: 'docker',
      dockerfilePath: './Dockerfile',
      dockerContext: '.',
      healthCheckPath: '/api/health',
    },
  }

  const res = await fetch('https://api.render.com/v1/services', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const text = await res.text()

  if (!res.ok) {
    console.log(`  status=${res.status}`)
    console.log(`  ${text.slice(0, 600)}`)
    if (res.status === 402) {
      console.log('\n  >>> Render yeu cau them card vao billing.')
      console.log('  >>> https://dashboard.render.com/billing')
    }
    process.exit(1)
  }

  const body = JSON.parse(text)
  service = body.service ?? body
  console.log(`  da tao: ${service.name} (${service.id})`)
}

/* --- 3. Gan bien moi truong --- */
const wanted = [
  'KNIT_DB_DRIVER',
  'NODE_ENV',
  'KNIT_SECRET',
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'KNIT_WEB_DIST',
  'KNIT_SEED',
]

const envVars = []
for (const key of wanted) {
  const value = fileEnv[key] ?? process.env[key]
  if (!value) {
    console.log(`  [skip] ${key} — khong co gia tri`)
    continue
  }
  envVars.push({ key, value })
}

console.log('\n=== Gan bien moi truong ===')
for (const e of envVars) {
  const res = await fetch(`https://api.render.com/v1/services/${service.id}/env-vars/${e.key}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ value: e.value }),
  })
  console.log(`  ${e.key} -> ${res.status === 200 || res.status === 201 ? 'OK' : 'LOI ' + (await res.text()).slice(0, 120)}`)
}

/* --- 4. Kich hoat deploy --- */
console.log('\n=== Kich hoat deploy ===')
const clearRes = await fetch(
  `https://api.render.com/v1/services/${service.id}/clear-cache`,
  { method: 'POST', headers },
)
console.log(`  clear-cache -> ${clearRes.status}`)

const triggerRes = await fetch(
  `https://api.render.com/v1/services/${service.id}/deploys`,
  {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  },
)
const triggerText = await triggerRes.text()
console.log(`  deploy -> ${triggerRes.status}`)
if (!triggerRes.ok) console.log(`  ${triggerText.slice(0, 400)}`)

const svc = service.serviceDetails ?? {}
console.log('\n=== Ket qua ===')
console.log(`  url        = ${svc.webURL ?? svc.url ?? '?'}`)
console.log(`  deployHook = ${svc.webhooksDeployUrl ?? '?'}`)
console.log('  Render se build image tu Dockerfile roi build nen may tu dong chay migrate + seed.')
