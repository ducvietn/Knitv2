/**
 * Chạy song song server API và web app để phát triển.
 *
 * Dùng: `npm run dev` (từ thư mục gốc workspace).
 */
import { spawn } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const procs = [
  spawn(npm, ['--prefix', 'server', 'run', 'dev'], { stdio: 'inherit' }),
  spawn(npm, ['--prefix', 'app', 'run', 'dev'], { stdio: 'inherit' }),
]

const shutdown = () => {
  for (const p of procs) p.kill()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

for (const p of procs) {
  p.on('exit', (code) => {
    if (code !== null && code !== 0) {
      shutdown()
      process.exit(code ?? 1)
    }
  })
}
