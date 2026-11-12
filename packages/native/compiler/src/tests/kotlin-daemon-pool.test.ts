// One warm Kotlin compiler per vitest worker slot (kotlin-daemon.ts).
//
// Test files run in parallel, and a daemon compiles one request at a time, so
// two files on one JVM spend each other's compile time out of their own
// deadline. These specs lock the slot assignment (pure, no toolchain) and,
// where a real kotlinc exists, that every published daemon answers on its own
// and that the worker running THIS file is attached to the one its pool id
// names.

import { existsSync, readFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  _resetKotlinDaemon,
  compileKotlinViaDaemon,
  SHARED_SPOOL_ENV,
  sharedSpoolFor,
  startSharedKotlinDaemons,
} from '../kotlin-daemon'
import { KOTLIN_COMPOSE_STUBS } from '../kotlin-stubs'
import { isKotlincAvailable, kotlincVersionForDaemon } from '../validate'

describe('sharedSpoolFor — which run-wide daemon a worker uses', () => {
  const three = ['/s/a', '/s/b', '/s/c'].join(delimiter)

  it('maps pool ids 1..n onto the published spools in order', () => {
    expect(sharedSpoolFor(three, '1')).toBe('/s/a')
    expect(sharedSpoolFor(three, '2')).toBe('/s/b')
    expect(sharedSpoolFor(three, '3')).toBe('/s/c')
  })

  it('wraps a pool id beyond the list instead of leaving the worker without a daemon', () => {
    expect(sharedSpoolFor(three, '4')).toBe('/s/a')
    expect(sharedSpoolFor(three, '8')).toBe('/s/b')
  })

  it('uses the first spool when there is no usable pool id (a plain script, a malformed value)', () => {
    for (const id of [undefined, '', '0', '-2', '1.5', 'x'])
      expect(sharedSpoolFor(three, id)).toBe('/s/a')
  })

  it('answers null when nothing was published', () => {
    expect(sharedSpoolFor(undefined, '1')).toBeNull()
    expect(sharedSpoolFor('', '1')).toBeNull()
    expect(sharedSpoolFor(delimiter, '2')).toBeNull()
  })

  it('a single published spool serves every worker (file parallelism off)', () => {
    expect(sharedSpoolFor('/s/only', '1')).toBe('/s/only')
    expect(sharedSpoolFor('/s/only', '5')).toBe('/s/only')
  })
})

describe.runIf(isKotlincAvailable())('a daemon per worker slot, against a real kotlinc', () => {
  const published = process.env[SHARED_SPOOL_ENV]
  const poolId = process.env.VITEST_POOL_ID
  afterAll(() => {
    _resetKotlinDaemon()
    if (published === undefined) delete process.env[SHARED_SPOOL_ENV]
    else process.env[SHARED_SPOOL_ENV] = published
    if (poolId === undefined) delete process.env.VITEST_POOL_ID
    else process.env.VITEST_POOL_ID = poolId
  })

  it('starts the requested number of independent JVMs, and each one compiles', () => {
    const started = startSharedKotlinDaemons(
      2,
      kotlincVersionForDaemon(),
      KOTLIN_COMPOSE_STUBS,
      150_000,
    )
    if ('reason' in started) throw new Error(`[Pyreon] daemons did not start: ${started.reason}`)
    try {
      expect(started.shortfall).toBeUndefined()
      expect(started.spools).toHaveLength(2)
      const pids = started.spools.map((spool) => readFileSync(join(spool, 'pid'), 'utf8').trim())
      expect(new Set(pids).size).toBe(2)
      for (const spool of started.spools) expect(existsSync(join(spool, 'ready'))).toBe(true)

      // Attach this process to each in turn, as two workers would, and compile
      // through it: an accepted and a rejected input, so a daemon that only
      // echoes cannot pass.
      process.env[SHARED_SPOOL_ENV] = started.spools.join(delimiter)
      for (const id of ['1', '2']) {
        process.env.VITEST_POOL_ID = id
        _resetKotlinDaemon()
        const ok = compileKotlinViaDaemon(
          'val a: Int = 1\n',
          KOTLIN_COMPOSE_STUBS,
          '',
          kotlincVersionForDaemon(),
          150_000,
        )
        expect(ok?.code).toBe(0)
        const bad = compileKotlinViaDaemon(
          'val a: Int = "s"\n',
          KOTLIN_COMPOSE_STUBS,
          '',
          kotlincVersionForDaemon(),
          150_000,
        )
        expect(bad?.code).toBe(1)
        expect(bad?.output).toContain('error:')
      }
    } finally {
      _resetKotlinDaemon()
      started.stop()
    }
    for (const spool of started.spools) expect(existsSync(spool)).toBe(false)
  }, 300_000)

  it('the run published one daemon per worker and this worker has its own', () => {
    // globalSetup ran before this file; restore what it published.
    if (published === undefined) return
    const spools = published.split(delimiter).filter(Boolean)
    expect(new Set(spools).size).toBe(spools.length)
    const mine = sharedSpoolFor(published, poolId)
    expect(mine).not.toBeNull()
    expect(existsSync(join(mine!, 'ready'))).toBe(true)
    // Every worker alive at once has a distinct pool id in 1..maxWorkers, so
    // as long as the list is at least that long no two share a JVM.
    expect(Number(poolId)).toBeGreaterThanOrEqual(1)
    expect(Number(poolId)).toBeLessThanOrEqual(spools.length)
  })
})
