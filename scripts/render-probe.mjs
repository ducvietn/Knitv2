/**
 * Kiem tra cac phuong an tao service Render free ma khong can billing,
 * va xem trang thai billing cua account.
 */
const KEY = process.env.RENDER_API_KEY
const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

const OWNER_ID = process.env.RENDER_OWNER_ID ?? 'tea-d8mnpku7r5hc73a15cng'

/* 1. Xem owner — co billing khong? */
console.log('=== Owner / billing ===')
const ownerRes = await fetch(`https://api.render.com/v1/owners/${OWNER_ID}`, { headers })
console.log(`status=${ownerRes.status}`)
if (ownerRes.ok) {
  const body = await ownerRes.json()
  const owner = body.owner ?? body
  console.log(JSON.stringify(owner, null, 2).slice(0, 1500))
}

/* 2. Thu tao service voi cac bien khac */
console.log('\n=== Thu voi cac bien khac ===')
const attempts = [
  { label: 'plan=free, repoUrl', body: { plan: 'free', repo: 'https://github.com/ducvietn/Knitv2' } },
  { label: 'plan=free, repoId string', body: { plan: 'free', repoId: 'https://github.com/ducvietn/Knitv2' } },
  { label: 'khong co plan', body: {} },
]

for (const a of attempts) {
  const payload = {
    name: `knit-test-${Date.now().toString(36).slice(-4)}`,
    type: 'web_service',
    ownerID: OWNER_ID,
    branch: 'main',
    serviceDetails: {
      runtime: 'docker',
      dockerfilePath: './Dockerfile',
      dockerContext: '.',
    },
    ...a.body,
  }
  const res = await fetch('https://api.render.com/v1/services', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  console.log(`  [${a.label}] status=${res.status} ${text.slice(0, 200)}`)
  if (res.status === 201) {
    console.log('  !!! Service da tao — xoa de tranh thao')
    const body = JSON.parse(text)
    const svc = body.service ?? body
    const del = await fetch(`https://api.render.com/v1/services/${svc.id}`, {
      method: 'DELETE',
      headers,
    })
    console.log(`  xoa: ${del.status}`)
  }
}
