/**
 * Kiem tra chi tiet service Render: env vars da gan, trang thai deploy.
 */
const KEY = process.env.RENDER_API_KEY
const SERVICE_ID = process.env.RENDER_SERVICE_ID ?? 'srv-dc27g0s0916s73elopkg'

const headers = {
  Authorization: `Bearer ${KEY}`,
  Accept: 'application/json',
}

/* 1. Env vars */
console.log('=== Environment variables ===')
const envRes = await fetch(
  `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`,
  { headers },
)
console.log(`status=${envRes.status}`)
if (envRes.ok) {
  const body = await envRes.json()
  const vars = body?.envVars ?? body ?? []
  const expected = [
    'KNIT_DB_DRIVER', 'NODE_ENV', 'KNIT_SECRET', 'DATABASE_URL',
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET',
    'KNIT_WEB_DIST', 'KNIT_SEED',
  ]
  for (const e of vars) {
    const v = e.envVar ?? e
    const masked = /SECRET|DATABASE_URL/i.test(v.key)
      ? `${String(v.value).slice(0, 24)}...`
      : v.value
    console.log(`  ${v.key} = ${masked}`)
  }
  const missing = expected.filter(
    (k) => !vars.some((e) => (e.envVar ?? e).key === k),
  )
  console.log(missing.length ? `\n  THIEU: ${missing.join(', ')}` : '\n  Da du bien moi truong.')
}

/* 2. Deploys */
console.log('\n=== Deploys ===')
const depRes = await fetch(
  `https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=5`,
  { headers },
)
if (depRes.ok) {
  const body = await depRes.json()
  const deploys = body?.deploys ?? []
  if (!deploys.length) console.log('  (chua co deploy)')
  for (const d of deploys) {
    const dep = d.deploy ?? d
    console.log(`  [${dep.status}] ${dep.id} ${dep.createdAt}`)
  }
}

/* 3. Trang thai service */
console.log('\n=== Service ===')
const svcRes = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}`, { headers })
if (svcRes.ok) {
  const body = await svcRes.json()
  const svc = body.service ?? body
  console.log(`  name       = ${svc.name}`)
  console.log(`  url        = ${svc.serviceDetails?.webURL ?? svc.serviceDetails?.url}`)
  console.log(`  plan       = ${svc.plan}`)
  console.log(`  runtime    = ${svc.serviceDetails?.runtime}`)
  console.log(`  dockerfile = ${svc.serviceDetails?.dockerfilePath}`)
  console.log(`  context    = ${svc.serviceDetails?.dockerContext}`)
  console.log(`  health     = ${svc.serviceDetails?.healthCheckPath}`)
}
