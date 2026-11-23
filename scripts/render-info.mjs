/**
 * Kiem tra Render API — da co render API key chua, va cac service hien co.
 *
 * Render API key lay o: Dashboard > Account Settings > API Keys.
 * Do la secret nen chi doc tu bien moi truong, khong ghi ra file.
 */
const KEY = process.env.RENDER_API_KEY

if (!KEY) {
  console.log('Chua co RENDER_API_KEY trong moi truong.')
  console.log('Dat len truoc roi chay lai:')
  console.log('  $env:RENDER_API_KEY="<render-api-key>"')
  console.log('Lay key tai: Render Dashboard > Account Settings > API Keys')
  process.exit(0)
}

const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

/* 1. Danh sach service */
console.log('=== Render services ===')
const res = await fetch('https://api.render.com/v1/services?limit=50', { headers })
console.log(`status=${res.status}`)
if (!res.ok) {
  console.log((await res.text()).slice(0, 400))
  process.exit(1)
}

const body = await res.json()
// Render tra ve array truc tiep; boc trong `{ services: [...] }` de tuong thich
const rawList = Array.isArray(body) ? body : (body?.services ?? [])
const services = rawList.map((s) => s.service ?? s)
if (!services.length) {
  console.log('  (chua co service nao)')
}
for (const s of services) {
  const svc = s.service ?? s
  console.log(`  - ${svc.name} [${svc.type}] id=${svc.id}`)
  console.log(`    repo=${svc.repo ?? svc.githubRepo ?? '-'}`)
  console.log(`    branch=${svc.branch ?? '-'}  autoDeploy=${svc.autoDeploy ?? '-'}`)
  if (svc.serviceDetails?.webhooksDeployUrl) {
    console.log(`    deployHook=${svc.serviceDetails.webhooksDeployUrl}`)
  }
  if (svc.serviceDetails?.healthCheckPath) {
    console.log(`    healthCheck=${svc.serviceDetails.healthCheckPath}`)
  }
  console.log(`    url=${svc.serviceDetails?.webURL ?? svc.serviceDetails?.url ?? '-'}`)
}

/* 2. Danh sach owner (repo nao Render duoc truy cap) */
console.log('\n=== Render owners ===')
const ownersRes = await fetch('https://api.render.com/v1/owners?limit=50', { headers })
if (ownersRes.ok) {
  const owners = await ownersRes.json()
  for (const o of owners?.owners ?? owners ?? []) {
    const owner = o.owner ?? o
    console.log(`  - ${owner.owner?.name ?? owner.name ?? '?'} (${owner.type ?? '?'}) id=${owner.owner?.id ?? owner.id}`)
  }
}
