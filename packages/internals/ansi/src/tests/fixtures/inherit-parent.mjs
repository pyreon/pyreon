// Parent for `exit-after-flush.test.ts`: runs the child (argv: runtime,
// script) with INHERITED stdio, then writes once more. The child exits through
// `exitAfterFlush`; that must not break this process's stdout.
import { spawnSync } from 'node:child_process'

const [runtime, script] = process.argv.slice(2)
spawnSync(runtime, [script, 'flush'], { stdio: 'inherit' })
process.stdout.write('parent-after\n')
