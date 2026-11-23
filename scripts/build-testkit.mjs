/**
 * Build them mot entrypoint cho viec kiem thu — dung `node scripts/test-3tang.mjs`.
 *
 * Gom code vao mot file de script khong phai lo import nhieu file ESM.
 */
import { build } from 'esbuild'

await build({
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: ['better-sqlite3', 'bcryptjs', 'pg'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  entryPoints: ['server/src/lib/_testkit.ts'],
  outfile: 'server/dist/testkit.js',
  logLevel: 'info',
})
