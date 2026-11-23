import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Tao file env tam cho server local de test — lay gia tri tu .env.render
 * (hoac .env.local neu co) va doi DATABASE_URL sang file env rieng.
 */
const source = process.argv[2] ?? '.env.render'
const target = process.argv[3] ?? '.env.local-test'

const env = Object.fromEntries(
  readFileSync(source, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const lines = [
  `KNIT_DB_DRIVER=postgres`,
  `DATABASE_URL=${env.DATABASE_URL}`,
  `PORT=4123`,
  `NODE_ENV=development`,
  `SUPABASE_URL=${env.SUPABASE_URL}`,
  `SUPABASE_SERVICE_ROLE_KEY=${env.SUPABASE_SERVICE_ROLE_KEY}`,
  `SUPABASE_STORAGE_BUCKET=${env.SUPABASE_STORAGE_BUCKET}`,
  `OPENAI_API_KEY=${env.OPENAI_API_KEY}`,
  `KNIT_TRANSLATE_BASE_URL=${env.KNIT_TRANSLATE_BASE_URL}`,
  `KNIT_TRANSLATE_MODEL=${env.KNIT_TRANSLATE_MODEL}`,
  `KNIT_TRANSLATE_TIMEOUT_MS=60000`,
].filter((l) => !l.endsWith('='))

writeFileSync(target, lines.join('\n'), 'utf8')
console.log(`Da tao ${target}`)
