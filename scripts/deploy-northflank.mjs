/**
 * Deploy KNIT lên Northflank qua REST API.
 *
 * Không có CLI Northflank trên npm nên dùng trực tiếp REST API
 * `https://api.northflank.com/v1`.
 *
 * Cần biến môi trường:
 *
 *   NORTHFLANK_API_TOKEN  — token lấy ở Team Settings > API > Tokens
 *   NORTHFLANK_TEAM_ID    — ID của team (bỏ trống nếu token đã gắn team)
 *   DATABASE_URL          — chuỗi kết nối Postgres của Supabase
 *   SUPABASE_URL          — URL project Supabase (cho Storage avatar)
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (cho Storage avatar)
 *
 * Tuỳ chọn:
 *
 *   NORTHFLANK_REGION    — region project (mặc định `asia-southeast`)
 *   NORTHFLANK_PROJECT   — tên project (mặc định `knit`)
 *   NORTHFLANK_SERVICE   — tên service (mặc định `knit-web`)
 *
 * Chạy:  node scripts/deploy-northflank.mjs
 */
import { randomBytes } from 'node:crypto'

const API = 'https://api.northflank.com/v1'

const TOKEN = process.env.NORTHFLANK_API_TOKEN ?? ''
const TEAM_ID = process.env.NORTHFLANK_TEAM_ID ?? ''
const REGION = process.env.NORTHFLANK_REGION ?? 'asia-southeast'
const PROJECT_NAME = process.env.NORTHFLANK_PROJECT ?? 'knit'
const SERVICE_NAME = process.env.NORTHFLANK_SERVICE ?? 'knit-web'
const DATABASE_URL = process.env.DATABASE_URL ?? ''
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/**
 * `KNIT_SECRET` dùng để ký JWT.
 *
 * Mặc định sinh mới mỗi lần chạy — nhưng như vậy mỗi lần deploy lại làm
 * token cũ hết hiệu lực (người dùng phải đăng nhập lại). Đặt
 * `NORTHFLANK_KNIT_SECRET` để giữ nguyên secret qua các lần deploy.
 */
const KNIT_SECRET = process.env.NORTHFLANK_KNIT_SECRET ?? randomBytes(48).toString('hex')

if (!TOKEN) {
  console.error('Thiếu NORTHFLANK_API_TOKEN.')
  process.exit(1)
}
if (!DATABASE_URL) {
  console.error('Thiếu DATABASE_URL (Supabase Postgres).')
  process.exit(1)
}

/** Gọi REST API Northflank. */
const nf = async (method, path, body) => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = text
  }
  if (!response.ok) {
    const detail = typeof payload === 'string' ? payload : JSON.stringify(payload)
    throw new Error(`${method} ${path} -> ${response.status}\n${detail}`)
  }
  return payload?.data ?? payload
}

const step = (n, text) => console.log(`\n[${n}] ${text}`)

/* ------------------------------------------------------------- 1. team */
step(1, 'Xác định team')
/**
 * `GET /v1/teams` chỉ chạy được với token scoped ở cấp **organization**.
 * Token scoped ở cấp team sẽ nhận 403 — khi đó cần biết `teamId` từ trước
 * (lấy ở trang team trên dashboard Northflank, hoặc URL của service).
 */
let teamId = TEAM_ID
let teamName = TEAM_ID

if (!teamId) {
  try {
    const teams = await nf('GET', '/teams')
    const teamList = teams?.teams ?? teams?.data ?? teams ?? []
    const list = Array.isArray(teamList) ? teamList : []
    const team = list[0]
    if (!team) {
      console.error('Không tìm thấy team nào.')
      process.exit(1)
    }
    teamId = team.id
    teamName = team.name
    console.log(`   team: ${team.name} (${team.id})`)
  } catch (err) {
    console.error('   Không gọi được GET /v1/teams.')
    console.error(`   ${err.message}`)
    console.error('   Nguyên nhân thường gặp: token scoped ở cấp team, endpoint')
    console.error('   này cần token cấp organization. Hãy đặt NORTHFLANK_TEAM_ID.')
    process.exit(1)
  }
} else {
  console.log(`   team id: ${teamId}`)
}

/* ----------------------------------------------------------- 2. project */
step(2, 'Tìm hoặc tạo project')
let project = null
const existing = await nf('GET', `/teams/${teamId}/projects`)
const projectList = existing?.data ?? existing ?? []
project = projectList.find((p) => p.name === PROJECT_NAME)

if (!project) {
  console.log(`   đang tạo project "${PROJECT_NAME}" ở region ${REGION}...`)
  try {
    project = await nf('POST', `/teams/${teamId}/projects`, {
      name: PROJECT_NAME,
      description: 'KNIT — nen tang hoi dap sinh vien ULIS - VNU',
      region: REGION,
    })
  } catch (err) {
    console.error(`   ${err.message}`)
    console.error('   Nếu là lỗi 403, token thiếu quyền')
    console.error('   "Project > Projects > Manage > Create".')
    console.error('   Sửa quyền của RBAC role mà token sinh ra, rồi chạy lại.')
    process.exit(1)
  }
} else {
  console.log(`   dùng lại project "${project.name}" (${project.id})`)
}
const projectId = project.id
console.log(`   project id: ${projectId}`)

/* ----------------------------------------------------------- 3. service */
step(3, 'Tìm hoặc tạo combined service')
const services = await nf('GET', `/projects/${projectId}/services`)
const serviceList = services?.data ?? services ?? []
let service = serviceList.find((s) => s.name === SERVICE_NAME)

if (!service) {
  console.log(`   đang tạo service "${SERVICE_NAME}"...`)
  try {
    service = await nf('POST', `/projects/${projectId}/services/combined`, {
    name: SERVICE_NAME,
    description: 'KNIT web + API',
    billing: {
      deploymentPlan: 'nf-compute-20',
      buildPlan: 'nf-compute-200-8',
    },
    deployment: {
      instances: 1,
      docker: { configType: 'default' },
    },
    buildSettings: {
      dockerfile: {
        buildEngine: 'buildkit',
        dockerFilePath: '/Dockerfile',
        dockerWorkDir: '/',
      },
    },
    vcsData: {
      projectUrl: 'https://github.com/ducvietn/Knitv2',
      projectType: 'github',
      projectBranch: 'main',
    },
    ports: [
      {
        name: 'p01',
        internalPort: 4000,
        public: true,
        vpcAccessible: false,
        protocol: 'HTTP',
      },
    ],
    runtimeEnvironment: {
      NODE_ENV: 'production',
      PORT: '4000',
      KNIT_DB_DRIVER: 'postgres',
      DATABASE_URL,
      KNIT_SECRET,
      KNIT_WEB_DIST: '/app/app/dist',
      KNIT_SEED: '/app/server/seed-data.json',
      ...(SUPABASE_URL
        ? {
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
            SUPABASE_STORAGE_BUCKET: 'avatars',
          }
        : {}),
    },
    })
  } catch (err) {
    console.error(`   ${err.message}`)
    console.error('   Nếu là lỗi 403, token thiếu quyền')
    console.error('   "Project > Services > General > Create".')
    console.error('   Sửa quyền của RBAC role mà token sinh ra, rồi chạy lại.')
    process.exit(1)
  }
} else {
  console.log(`   dùng lại service "${service.name}" (${service.id})`)
}
const serviceId = service.id
console.log(`   service id: ${serviceId}`)

/* ------------------------------------------------- 4. cập nhật env + port */
step(4, 'Cập nhật biến môi trường runtime')
await nf('PATCH', `/projects/${projectId}/services/combined/${serviceId}`, {
  runtimeEnvironment: {
    NODE_ENV: 'production',
    PORT: '4000',
    KNIT_DB_DRIVER: 'postgres',
    DATABASE_URL,
    KNIT_SECRET,
    KNIT_WEB_DIST: '/app/app/dist',
    KNIT_SEED: '/app/server/seed-data.json',
    ...(SUPABASE_URL
      ? {
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
          SUPABASE_STORAGE_BUCKET: 'avatars',
        }
      : {}),
  },
  ports: [
    {
      name: 'p01',
      internalPort: 4000,
      public: true,
      vpcAccessible: false,
      protocol: 'HTTP',
    },
  ],
})
console.log('   đã cập nhật biến môi trường và cổng public.')

/* ------------------------------------------------------------ 5. build */
step(5, 'Kích hoạt build')
try {
  const build = await nf('POST', `/projects/${projectId}/services/combined/${serviceId}/build`)
  console.log('   build đã được kích hoạt:', JSON.stringify(build))
} catch (err) {
  console.warn('   không kích hoạt build qua API được:', err.message)
  console.warn('   Northflank sẽ tự build khi có commit mới trên `main`.')
}

/* ------------------------------------------------------------ 6. domain */
step(6, 'Lấy domain public')
const finalService = await nf('GET', `/projects/${projectId}/services/${serviceId}`)
const domains = finalService?.domains ?? finalService?.ports?.[0]?.domains ?? []
console.log('   domains:', domains.length ? domains.join(', ') : '(chưa có — sẽ được cấp sau khi build)')

console.log(`
Hoàn tất.

Theo dõi build:  https://app.northflank.com
Sau khi build xong, kiểm tra:
  curl https://<domain>/api/health
`)
