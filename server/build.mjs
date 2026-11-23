/**
 * Đóng gói server thành một file ESM chạy được trong production.
 *
 * Vì sao không dùng `tsc`? TypeScript phát ra các import không có đuôi
 * file (`./lib/auth`), mà Node ESM bắt buộc phải có đuôi (`.js`) — nên bản
 * build bằng `tsc` không chạy được nếu không kèm loader. esbuild gộp toàn
 * bộ vào một file, giữ `better-sqlite3` và các dependency gốc ở dạng
 * `require` để Node tự giải quyết, và kết quả chạy được trực tiếp bằng
 * `node dist/index.js` — không cần `tsx` (một dependency chỉ có ở dev).
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // better-sqlite3 là native module — không được đóng gói vào.
  external: ['better-sqlite3', 'bcryptjs'],
  banner: {
    // esbuild giữ `require` cho các dependency native/CJS.
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
})
