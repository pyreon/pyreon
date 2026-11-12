// vitest globalSetup: warm Kotlin compilers for the whole run, one per worker.
//
// Runs in the main vitest process before any worker forks, so the spool
// paths it publishes through `process.env` are inherited by every test file
// process (`pool: 'forks'` starts a fresh process per file). Each worker
// attaches to the JVM its `VITEST_POOL_ID` names; the JVM start and the cold
// first compile are paid once per worker slot instead of once per file. See
// kotlin-daemon.ts for the transport and the fallback contract — a run where
// this cannot start is exactly the run without it: each worker tries its own
// daemon, then plain `kotlinc`.

import { delimiter } from 'node:path'
import type { TestProject } from 'vitest/node'
import { SHARED_SPOOL_ENV, startSharedKotlinDaemons } from '../kotlin-daemon'
import { KOTLIN_COMPOSE_STUBS } from '../kotlin-stubs'
import { isKotlincAvailable, kotlincVersionForDaemon } from '../validate'

export default function setup(project: TestProject): (() => void) | undefined {
  if (process.env.PYREON_SKIP_NATIVE_VALIDATE === '1' || process.env.PYREON_KOTLIN_DAEMON === '0')
    return
  if (!isKotlincAvailable()) return
  // The RESOLVED worker count: 1 under `--no-file-parallelism`, else the
  // config's `maxWorkers` or a `--maxWorkers` override.
  const workers = Math.max(1, project.config.maxWorkers)
  const started = startSharedKotlinDaemons(
    workers,
    kotlincVersionForDaemon(),
    KOTLIN_COMPOSE_STUBS,
    150_000,
  )
  if ('reason' in started) {
    process.stderr.write(
      `[pyreon] shared kotlin daemons not started — ${started.reason}; workers fall back per process\n`,
    )
    return
  }
  if (started.shortfall !== undefined) {
    process.stderr.write(
      `[pyreon] ${started.spools.length} of ${workers} kotlin daemons running — ${started.shortfall}; the remaining workers share\n`,
    )
  }
  process.env[SHARED_SPOOL_ENV] = started.spools.join(delimiter)
  return () => {
    started.stop()
    delete process.env[SHARED_SPOOL_ENV]
  }
}
