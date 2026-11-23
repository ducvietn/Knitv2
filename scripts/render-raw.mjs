/**
 * Lay full detail cua mot deploy tren Render, tim thong tin loi.
 */
const KEY = process.env.RENDER_API_KEY
const SERVICE_ID = process.env.RENDER_SERVICE_ID ?? 'srv-dc27g0s0916s73elopkg'
const DEPLOY_ID = process.env.RENDER_DEPLOY_ID ?? 'dep-dc27g1c0916s73elorcg'

const headers = {
  Authorization: `Bearer ${KEY}`,
  Accept: 'application/json',
}

console.log('=== Deploy detail ===')
const res = await fetch(
  `https://api.render.com/v1/services/${SERVICE_ID}/deploys/${DEPLOY_ID}`,
  { headers },
)
console.log(`status=${res.status}`)
const text = await res.text()
try {
  const body = JSON.parse(text)
  const dep = body.deploy ?? body
  console.log(JSON.stringify(dep, null, 2).slice(0, 3000))
} catch {
  console.log(text.slice(0, 1500))
}

/* Thu tim cac endpoint log khac */
console.log('\n=== Thu cac endpoint log ===')
for (const url of [
  `https://api.render.com/v1/services/${SERVICE_ID}/deploys/${DEPLOY_ID}/logs`,
  `https://api.render.com/v1/deploys/${DEPLOY_ID}/logs`,
  `https://api.render.com/v1/services/${SERVICE_ID}/logs`,
]) {
  const r = await fetch(url, { headers })
  console.log(`  ${url} -> ${r.status}`)
  if (r.ok) {
    const t = await r.text()
    console.log(t.slice(0, 2000))
  }
}
