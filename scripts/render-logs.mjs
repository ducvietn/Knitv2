/**
 * Lay log build cua deploy gan nhat tren Render.
 */
const KEY = process.env.RENDER_API_KEY
const SERVICE_ID = process.env.RENDER_SERVICE_ID ?? 'srv-dc27g0s0916s73elopkg'

const headers = {
  Authorization: `Bearer ${KEY}`,
  Accept: 'application/json',
}

const depRes = await fetch(
  `https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=5`,
  { headers },
)
const depBody = await depRes.json()
const raw = Array.isArray(depBody) ? depBody : (depBody?.deploys ?? [])
const deploys = raw.map((d) => d.deploy ?? d)

console.log('=== Deploys ===')
for (const d of deploys) console.log(`  [${d.status}] ${d.id} ${d.createdAt}`)

const latest = deploys[0]
if (!latest) process.exit(0)

console.log('\n=== Log deploy ===')
for (const url of [
  `https://api.render.com/v1/services/${SERVICE_ID}/deploys/${latest.id}/logs`,
  `https://api.render.com/v1/services/${SERVICE_ID}/logs?deployId=${latest.id}`,
]) {
  const r = await fetch(url, { headers })
  console.log(`\n--- ${url} -> ${r.status} ---`)
  const text = await r.text()
  if (!r.ok) {
    console.log(text.slice(0, 300))
    continue
  }
  try {
    const body = JSON.parse(text)
    const logs = body?.logs ?? body ?? []
    if (Array.isArray(logs)) {
      const lines = logs.map((l) => l.text ?? l.line ?? JSON.stringify(l))
      console.log(lines.slice(-120).join('\n'))
    } else {
      console.log(text.slice(-3000))
    }
  } catch {
    console.log(text.slice(-3000))
  }
}
