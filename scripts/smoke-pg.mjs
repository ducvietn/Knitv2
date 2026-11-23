/**
 * Smoke test API KNIT voi Postgres (Supabase).
 * Chay server tren cong local 4100 roi goi cac endpoint chinh.
 *
 * Dung:
 *   $env:DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-<N>-<region>.pooler.supabase.com:5432/postgres"
 *   npm run smoke:pg
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4100
const BASE = `http://127.0.0.1:${PORT}`

/* Duong dan tuyet doi — khong phu thuoc thu muc hien tai */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TSX_CLI = resolve(ROOT, 'server', 'node_modules', 'tsx', 'dist', 'cli.mjs')

const child = spawn(
  process.execPath,
  [TSX_CLI, 'src/index.ts'],
  {
    cwd: resolve(ROOT, 'server'),
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let serverLog = ''
child.stdout.on('data', (d) => { serverLog += d.toString() })
child.stderr.on('data', (d) => { serverLog += d.toString() })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? ' — ' + detail : ''}`)
}

try {
  /* Cho server kip khoi dong */
  console.log('=== Khoi dong server ===')
  let up = false
  for (let i = 0; i < 40; i++) {
    await sleep(1000)
    try {
      const r = await fetch(`${BASE}/api/health`)
      if (r.ok) { up = true; break }
    } catch { /* chua len */ }
  }
  if (!up) {
    console.log('Server khong khoi dong. Log:')
    console.log(serverLog.slice(-3000))
    process.exit(1)
  }
  console.log('  server da len\n')

  /* 1. Health */
  console.log('=== API smoke test ===')
  const health = await fetch(`${BASE}/api/health`)
  const hj = await health.json()
  check('GET /api/health', health.ok, JSON.stringify(hj))

  /* 2. Danh sach cau hoi */
  const qs = await fetch(`${BASE}/api/questions`)
  const qj = await qs.json()
  const qCount = Array.isArray(qj) ? qj.length : (qj.questions?.length ?? 0)
  check('GET /api/questions', qs.ok, `${qCount} cau hoi`)

  /* 3. Chi tiet cau hoi */
  const q1 = await fetch(`${BASE}/api/questions/q1`)
  const q1j = await q1.json()
  check('GET /api/questions/q1', q1.ok, q1j?.title ?? q1j?.question?.title ?? '')

  /* 4. Dang nhap */
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a2@ulis.vnu.edu.vn', password: 'knit1234' }),
  })
  const lj = await login.json()
  const token = lj?.token ?? lj?.accessToken
  check('POST /api/auth/login', login.ok && Boolean(token), token ? 'lay duoc token' : JSON.stringify(lj).slice(0, 120))

  if (token) {
    const auth = { Authorization: `Bearer ${token}` }

    /* 5. Profile */
    const me = await fetch(`${BASE}/api/me`, { headers: auth })
    const mj = await me.json()
    check('GET /api/me', me.ok, mj?.email ?? mj?.user?.email ?? '')

    /* 6. Thong bao */
    const notif = await fetch(`${BASE}/api/notifications`, { headers: auth })
    const nj = await notif.json()
    const nCount = Array.isArray(nj) ? nj.length : (nj.notifications?.length ?? 0)
    check('GET /api/notifications', notif.ok, `${nCount} thong bao`)

    /* 7. Topic follow — route that la `/api/questions/topics/:topic/follow` */
    const topics = await fetch(`${BASE}/api/questions/topics/hoc-tap/follow`, {
      method: 'POST',
      headers: auth,
    })
    check('POST /api/questions/topics/:topic/follow', topics.ok, `status=${topics.status}`)

    /* 8. Vote helpful — ghi vao Postgres */
    const ansId = q1j?.question?.answers?.[0]?.id ?? q1j?.answers?.[0]?.id
    if (ansId) {
      try {
        const vote = await fetch(`${BASE}/api/answers/${ansId}/helpful`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        check('POST /api/answers/:id/helpful', vote.ok || vote.status === 409, `status=${vote.status}`)
      } catch (e) {
        check('POST /api/answers/:id/helpful', false, `fetch loi: ${e.cause?.code ?? e.message}`)
        console.log('  --- server log ---')
        console.log(serverLog.slice(-2000))
      }
    } else {
      check('POST /api/answers/:id/helpful', false, 'khong tim thay answer id')
    }
  }

  /* 9. Bai web static */
  const web = await fetch(BASE)
  check('GET / (web static)', web.ok, `status=${web.status}`)

  console.log('\n=== Ket qua ===')
  const failed = results.filter((r) => !r.ok)
  console.log(`  ${results.length - failed.length}/${results.length} pass`)
  if (failed.length) {
    console.log('  FAIL:', failed.map((f) => f.name).join(', '))
  }
} finally {
  child.kill('SIGTERM')
  await sleep(500)
  child.kill('SIGKILL')
}
