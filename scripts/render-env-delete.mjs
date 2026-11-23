/**
 * Xoa mot bien moi truong tren Render service.
 *
 * Dung:
 *   $env:RENDER_API_KEY="<render-api-key>"
 *   node scripts/render-env-delete.mjs <KEY> [KEY...]
 */
const KEY = process.env.RENDER_API_KEY
if (!KEY) {
  console.error('Thieu RENDER_API_KEY.')
  process.exit(1)
}

const SERVICE_ID = process.env.RENDER_SERVICE_ID ?? 'srv-dc27g0s0916s73elopkg'
const keys = process.argv.slice(2)

if (!keys.length) {
  console.error('Can it nhat mot ten bien can xoa.')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

for (const key of keys) {
  const res = await fetch(
    `https://api.render.com/v1/services/${SERVICE_ID}/env-vars/${key}`,
    { method: 'DELETE', headers },
  )
  console.log(`  ${key} -> ${res.status}${res.ok ? '' : ' ' + (await res.text()).slice(0, 150)}`)
}
