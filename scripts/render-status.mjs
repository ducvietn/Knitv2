/**
 * Theo doi trang thai deploy cua service Render.
 *
 * Dung:
 *   $env:RENDER_API_KEY="<render-api-key>"
 *   node scripts/render-status.mjs
 *
 * Co the truyen them tham so de theo doi trong mot khoang thoi gian:
 *   node scripts/render-status.mjs --watch 300
 */
const KEY = process.env.RENDER_API_KEY
if (!KEY) {
  console.error('Thieu RENDER_API_KEY.')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${KEY}`,
  Accept: 'application/json',
}

const SERVICE_NAME = process.env.RENDER_SERVICE_NAME ?? 'knit'
const SERVICE_ID = process.env.RENDER_SERVICE_ID ?? 'srv-dc27g0s0916s73elopkg'
const watchIdx = process.argv.indexOf('--watch')
const watchSeconds = watchIdx !== -1 ? Number(process.argv[watchIdx + 1] ?? 300) : 0

/* --- Tim service ---
 * Render tra ve MOT array truc tiep (khong boc trong `{ services: [...] }`).
 * Chu hoa ca hai kieu de script khong phu thuoc thay doi format. */
const listRes = await fetch('https://api.render.com/v1/services?limit=50', { headers })
const listBody = await listRes.json()
const rawList = Array.isArray(listBody) ? listBody : (listBody?.services ?? [])
const services = rawList.map((s) => s.service ?? s)
// So sanh khong phan biet hoa/thuong — Render tu doi chieu hoa chu
const wanted = SERVICE_NAME.toLowerCase()
const service =
  services.find((s) => s.id === SERVICE_ID) ??
  services.find((s) => (s.name ?? '').toLowerCase() === wanted)

if (!service) {
  console.log(`Khong tim thay service "${SERVICE_NAME}".`)
  console.log('Cac service dang co:')
  for (const s of services) console.log(`  - ${s.name} [${s.type}] ${s.id}`)
  process.exit(1)
}

const svc = service.serviceDetails ?? {}
console.log(`Service : ${service.name} (${service.id})`)
console.log(`URL     : ${svc.webURL ?? svc.url ?? '?'}`)
console.log(`Health  : ${svc.healthCheckPath ?? '?'}`)
console.log(`Deploy  : ${service.updatedAt ?? '?'}\n`)

async function showDeploys() {
  const res = await fetch(
    `https://api.render.com/v1/services/${service.id}/deploys?limit=5`,
    { headers },
  )
  if (!res.ok) {
    console.log(`  (khong doc duoc deploys: ${res.status})`)
    return null
  }
  const body = await res.json()
  const deploys = body?.deploys ?? body ?? []
  if (!deploys.length) {
    console.log('  (chua co deploy nao)')
    return null
  }
  for (const d of deploys) {
    const dep = d.deploy ?? d
    const commit = dep.commit?.id ?? ''
    console.log(
      `  [${dep.status}] ${dep.id} ${dep.createdAt} ${commit.slice(0, 7)}`,
    )
  }
  return deploys[0]?.deploy ?? deploys[0]
}

console.log('=== Deploys ===')
const latest = await showDeploys()

if (watchSeconds > 0) {
  console.log(`\n=== Theo doi ${watchSeconds}s ===`)
  const deadline = Date.now() + watchSeconds * 1000
  let lastStatus = null
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10000))
    const res = await fetch(
      `https://api.render.com/v1/services/${service.id}/deploys?limit=1`,
      { headers },
    )
    if (!res.ok) continue
    const body = await res.json()
    const dep = (body?.deploys ?? [])[0]
    const depObj = dep?.deploy ?? dep
    const status = depObj?.status
    if (status !== lastStatus) {
      console.log(`  -> ${status} (${new Date().toLocaleTimeString()})`)
      lastStatus = status
      if (status === 'live') {
        console.log('  DEPLOY THANH CONG!')
        break
      }
      if (status === 'build_failed' || status === 'update_failed') {
        console.log('\n=== Log ===')
        const logRes = await fetch(
          `https://api.render.com/v1/services/${service.id}/deploys/${depObj.id}/logs`,
          { headers },
        )
        if (logRes.ok) {
          const logs = await logRes.text()
          console.log(logs.slice(-3000))
        }
        break
      }
    }
  }
}
