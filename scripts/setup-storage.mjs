/**
 * Tao bucket Supabase Storage cho avatar (neu chua co) va dat public.
 *
 * Dung:
 *   node scripts/setup-storage.mjs <service-role-key> [ten-bucket]
 *
 * Service role key lay o Supabase Dashboard > Project Settings > API.
 * Khong nho mat khau truc tiep vao file nay — truyen qua tham so.
 */
const REF = process.env.SUPABASE_PROJECT_REF ?? 'ulqiyxcumudhldewecyn'
const SERVICE_KEY = process.argv[2]
const BUCKET = process.argv[3] ?? 'avatars'

if (!SERVICE_KEY) {
  console.error('Thieu service role key.')
  console.error('Usage: node scripts/setup-storage.mjs <service-role-key> [bucket]')
  process.exit(1)
}

const base = `https://${REF}.supabase.co`
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

/* 1. Danh sach bucket hien co */
console.log('=== Bucket hien co ===')
const listRes = await fetch(`${base}/storage/v1/bucket`, { headers })
const listText = await listRes.text()
console.log(`  status=${listRes.status}`)
if (listRes.ok) {
  const buckets = JSON.parse(listText)
  if (!buckets.length) console.log('  (chua co bucket nao)')
  for (const b of buckets) console.log(`  - ${b.name} (public=${b.public})`)
} else {
  console.log(`  ${listText.slice(0, 300)}`)
}

/* 2. Tao bucket neu chua co — loi 409 (da ton tai) la ket qua tot */
console.log(`\n=== Tao bucket "${BUCKET}" ===`)
const createRes = await fetch(`${base}/storage/v1/bucket`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    id: BUCKET,
    name: BUCKET,
    public: true,
    file_size_limit: 5242880, // 5 MB
    allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  }),
})
const createText = await createRes.text()
console.log(`  status=${createRes.status}`)
console.log(`  ${createText.slice(0, 300)}`)

/* 3. Dam bao bucket public */
console.log(`\n=== Dat public cho "${BUCKET}" ===`)
const patchRes = await fetch(`${base}/storage/v1/bucket/${BUCKET}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ id: BUCKET, public: true }),
})
console.log(`  status=${patchRes.status}`)

/* 4. Xac nhan */
console.log('\n=== Xac nhan ===')
const final = await fetch(`${base}/storage/v1/bucket`, { headers })
if (final.ok) {
  const buckets = JSON.parse(await final.text())
  for (const b of buckets) console.log(`  - ${b.name} (public=${b.public})`)
} else {
  console.log(`  khong doc duoc danh sach bucket (status=${final.status})`)
}
