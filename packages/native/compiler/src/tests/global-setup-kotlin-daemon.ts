// vitest globalSetup: ONE warm Kotlin compiler for the whole run.
//
// Runs in the main vitest process before any worker forks, so the spool
// path it publishes through `process.env` is inherited by every test file
// process (`pool: 'forks'` starts a fresh process per file). Workers attach
// by pid; the JVM start and the cold first compile are paid once per run
// instead of once per file. See kotlin-daemon.ts for the transport and the
// fallback contract — a run where this cannot start is exactly the run
// without it: each worker tries its own daemon, then plain `kotlinc`.

import { SHARED_SPOOL_ENV, startSharedKotlinDaemon } from '../kotlin-daemon'
import { KOTLIN_COMPOSE_STUBS } from '../kotlin-stubs'
import { isKotlincAvailable, kotlincVersionForDaemon } from '../validate'

export default function setup(): (() => void) | undefined {
  if (process.env.PYREON_SKIP_NATIVE_VALIDATE === '1' || process.env.PYREON_KOTLIN_DAEMON === '0')
    return
  if (!isKotlincAvailable()) return
  const started = startSharedKotlinDaemon(kotlincVersionForDaemon(), KOTLIN_COMPOSE_STUBS, 150_000)
  if ('reason' in started) {
    process.stderr.write(
      `[pyreon] shared kotlin daemon not started — ${started.reason}; workers fall back per process\n`,
    )
    return
  }
  process.env[SHARED_SPOOL_ENV] = started.spool
  return () => {
    started.stop()
    delete process.env[SHARED_SPOOL_ENV]
  }
}
