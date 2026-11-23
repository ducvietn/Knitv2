/**
 * Nap env ROI chay server trong cung mot process.
 *
 * Script nao chay `node scripts/load-env.mjs` roi `node server/dist/index.js`
 * se khong dung chung bien moi truong — bien do chay o process rieng.
 * Script nay nap env roi `import` server trong chinh process day.
 */
import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? '.env.local-test'

for (const line of readFileSync(file, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const i = trimmed.indexOf('=')
  if (i === -1) continue
  const key = trimmed.slice(0, i).trim()
  const value = trimmed.slice(i + 1).trim()
  process.env[key] = value
}

console.log(`Da nap ${file}`)

await import('../server/dist/index.js')
