/**
 * Child process for `exit-after-flush.test.ts`: writes 3,000,000 bytes to
 * stdout (far past a 64 KiB pipe buffer), keeps a handle open so the process
 * would not exit on its own, then exits with code 3 — through
 * `exitAfterFlush` (`flush`) or a bare `process.exit` (`bare`, the control).
 */
import { exitAfterFlush } from '../../exit.ts'

const mode = process.argv[2]
const line = `${'x'.repeat(99)}\n`
process.stdout.write(line.repeat(30_000))
process.stderr.write('stderr-tail\n')
setInterval(() => {}, 60_000)
if (mode === 'bare') process.exit(3)
await exitAfterFlush(3)
process.stdout.write('unreachable\n')
