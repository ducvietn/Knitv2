/**
 * Theo doi trang thai deploy cua Render service (doc response dung cau truc).
 *
 * Dung: node scripts/render-deploy-status.mjs
 */
const KEY = process.env.RENDER_API_KEY
if (!KEY) {
  console.error('Thieu RENDER_API_KEY.')
  process.exit(1)
}

const SERVICE_ID = process.argv[2] ?? 'srv-dc27g0s0916s73elopkg'
const headers = { Authorization: `Bearer ${KEY}`, Accept: 'application/json' }

const res = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=3`, { headers })
if (!res.ok) {
  console.log('LOI', res.status, (await res.text()).slice(0, 300))
  process.exit(1)
}

const data = await res.json()
for (const item of data ?? []) {
  const d = item.deploy ?? item
  console.log(
    `${d.id}  ${String(d.status).padEnd(14)} commit=${(d.commit?.id ?? '').slice(0, 8)}  ${(d.commit?.message ?? '').split('\n')[0].slice(0, 55)}`,
  )
}
