/**
 * Đóng gói server thành các file ESM chạy được trong production.
 *
 * Vì sao không dùng `tsc`? TypeScript phát ra các import không có đuôi
 * file (`./lib/auth`), mà Node ESM bắt buộc phải có đuôi (`.js`) — nên bản
 * build bằng `tsc` không chạy được nếu không kèm loader. esbuild gộp toàn
 * bộ vào một file, giữ `better-sqlite3` và các dependency gốc ở dạng
 * `require` để Node tự giải quyết, và kết quả chạy được trực tiếp bằng
 * `node dist/index.js` — không cần `tsx` (một dependency chỉ có ở dev).
 *
 * Ngoài `index.js` (server chính), build thêm hai entrypoint dùng cho
 * Postgres: `migrate.js` (áp dụng schema) và `seed.js` (nạp dữ liệu mẫu).
 */
import { build } from 'esbuild'

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // better-sqlite3 là native module — không được đóng gói vào.
  // `pg` cũng giữ ngoài bundle: nó dùng `require` của Node cho các driver
  // native và `pg-native` (tuỳ chọn), nên đóng gói sẽ hỏng.
  external: ['better-sqlite3', 'bcryptjs', 'pg'],
  banner: {
    // esbuild giữ `require` cho các dependency native/CJS.
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
}

await build({
  ...shared,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
})

// Entrypoint cho Postgres — chạy bằng `node server/dist/migrate.js`.
for (const name of ['migrate', 'seed']) {
  await build({
    ...shared,
    entryPoints: [`src/db/${name}.ts`],
    outfile: `dist/${name}.js`,
  })
}
