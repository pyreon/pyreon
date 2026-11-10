import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildSteps,
  DURATIONS_MAX_AGE_MS,
  DURATIONS_MAX_ENTRIES,
  EMPTY_LOCK_RECLAIM_MS,
  MIN_STEP_MS,
  parseDurations,
  recordDuration,
  releaseLock,
  type RunDeps,
  runSteps,
  type Step,
  tryAcquireLock,
  waitForLock,
} from '../../../../../scripts/pre-push'
import { computePlan, entryKey, type Plan, type WorkspaceInfo } from '../../../../../scripts/pre-push-plan'

/**
 * `scripts/pre-push.ts` runs the pre-push plan. The contract these tests pin:
 * the WHOLE run (lock wait included) ends within the cap; on the cap the hook
 * names every check it did not run and exits 0 (CI runs them), while a check
 * that fails exits 1; a check whose last run cannot fit is not started; the
 * lock is taken only around the locked (CPU-heavy) steps, released on every
 * path, and a waiting push names its holder and gives up within its budget.
 */

const step = (id: string, over: Partial<Step> = {}): Step => ({
  id,
  label: id,
  argv: ['true'],
  locked: false,
  passes: [],
  ...over,
})

/** A fake clock and executor: each step "takes" `durations[id]` ms. */
function fakeDeps(durations: Record<string, number>, over: Partial<RunDeps> = {}) {
  let t = 0
  const ran: string[] = []
  const events: string[] = []
  const deps: RunDeps = {
    now: () => t,
    exec: async (s, budget) => {
      ran.push(s.id)
      const d = durations[s.id] ?? 1000
      if (d > budget) {
        t += budget
        return { kind: 'timeout', ms: budget }
      }
      t += d
      return { kind: d < 0 ? 'fail' : 'pass', ms: Math.abs(d) }
    },
    estimateMs: () => undefined,
    acquireLock: async () => {
      events.push('lock')
      return { ok: true }
    },
    releaseLock: () => events.push('unlock'),
    onStepDone: () => {},
    log: () => {},
    ...over,
  }
  return { deps, ran, events, elapsed: () => t }
}

describe('runSteps — the time cap', () => {
  it('runs every step in order when they fit', async () => {
    const f = fakeDeps({ a: 5000, b: 5000 })
    const r = await runSteps([step('a'), step('b')], 60_000, f.deps)
    expect(r.exitCode).toBe(0)
    expect(f.ran).toEqual(['a', 'b'])
    expect(r.unchecked).toEqual([])
  })

  it('stops at the cap, names the interrupted step and every later one, and lets the push through', async () => {
    const f = fakeDeps({ fast: 20_000, wall: 7_200_000, after: 1000 })
    const r = await runSteps([step('fast'), step('wall'), step('after')], 480_000, f.deps)
    expect(f.elapsed()).toBeLessThanOrEqual(480_000)
    expect(r.exitCode).toBe(0)
    expect(r.passed.map((s) => s.id)).toEqual(['fast'])
    expect(r.unchecked.map((u) => u.step.id)).toEqual(['wall', 'after'])
    expect(r.unchecked[0]!.why).toMatch(/480s time cap was reached while it ran/)
  })

  it('does not start a step with less than MIN_STEP_MS left', async () => {
    const f = fakeDeps({ a: 60_000 - MIN_STEP_MS + 1, b: 1 })
    const r = await runSteps([step('a'), step('b')], 60_000, f.deps)
    expect(f.ran).toEqual(['a'])
    expect(r.unchecked.map((u) => u.step.id)).toEqual(['b'])
  })

  it('skips a step whose last run cannot fit, and still runs the cheaper ones after it', async () => {
    const f = fakeDeps(
      { a: 1000, native: 1000, c: 1000 },
      { estimateMs: (s) => (s.id === 'native' ? 2_000_000 : undefined) },
    )
    const r = await runSteps([step('a'), step('native'), step('c')], 480_000, f.deps)
    expect(f.ran).toEqual(['a', 'c'])
    expect(r.unchecked).toEqual([{ step: expect.objectContaining({ id: 'native' }), why: expect.stringMatching(/last run took 2000s/) }])
  })

  it('a failing step blocks the push and stops the run', async () => {
    const f = fakeDeps({ a: 1000, broken: -1000, c: 1000 })
    const r = await runSteps([step('a'), step('broken'), step('c')], 60_000, f.deps)
    expect(r.exitCode).toBe(1)
    expect(r.failed?.id).toBe('broken')
    expect(f.ran).toEqual(['a', 'broken'])
  })

  it('lists an unavailable toolchain without failing', async () => {
    const f = fakeDeps({})
    const r = await runSteps([step('native', { unavailable: 'kotlinc is not installed' })], 60_000, f.deps)
    expect(r.exitCode).toBe(0)
    expect(r.unchecked[0]!.why).toBe('kotlinc is not installed')
    expect(f.ran).toEqual([])
  })
})

describe('runSteps — the lock', () => {
  it('takes the lock once, only before the first locked step, and releases it at the end', async () => {
    const f = fakeDeps({})
    const order: string[] = []
    f.deps.exec = async (s) => {
      order.push(s.id)
      return { kind: 'pass', ms: 1 }
    }
    const acquire = f.deps.acquireLock
    f.deps.acquireLock = async (b) => {
      order.push('lock')
      return acquire(b)
    }
    const release = f.deps.releaseLock
    f.deps.releaseLock = () => {
      order.push('unlock')
      release()
    }
    await runSteps(
      [step('validate-fast'), step('typecheck', { locked: true }), step('test', { locked: true })],
      60_000,
      f.deps,
    )
    expect(order).toEqual(['validate-fast', 'lock', 'typecheck', 'test', 'unlock'])
  })

  it('releases the lock when a locked step fails', async () => {
    const f = fakeDeps({ t: -1 })
    await runSteps([step('t', { locked: true })], 60_000, f.deps)
    expect(f.events).toEqual(['lock', 'unlock'])
  })

  it('a lock that stays held marks the locked steps unchecked with the holder named', async () => {
    const f = fakeDeps(
      {},
      { acquireLock: async () => ({ ok: false, reason: 'the pre-push lock stayed held by pid 7, branch fix/x' }) },
    )
    const r = await runSteps([step('vf'), step('tc', { locked: true }), step('t', { locked: true })], 60_000, f.deps)
    expect(r.exitCode).toBe(0)
    expect(f.ran).toEqual(['vf'])
    expect(r.unchecked.map((u) => [u.step.id, u.why])).toEqual([
      ['tc', 'the pre-push lock stayed held by pid 7, branch fix/x'],
      ['t', 'the pre-push lock stayed held by pid 7, branch fix/x'],
    ])
    expect(f.events).toEqual([])
  })

  it('the lock wait counts against the cap', async () => {
    const f = fakeDeps({ t: 1000 })
    let now = 0
    f.deps.now = () => now
    f.deps.acquireLock = async (budget) => {
      now += budget - 1 // waited almost the whole budget
      return { ok: true }
    }
    const r = await runSteps([step('t', { locked: true })], 60_000, f.deps)
    expect(r.unchecked.map((u) => u.step.id)).toEqual(['t'])
    expect(f.ran).toEqual([])
  })
})

describe('lock files', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pre-push-lock-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('acquires, refuses a live holder, reclaims a dead one, and releases only its own', () => {
    const lock = join(dir, 'pyreon-pre-push.lock')
    const me = { pid: 100, branch: 'fix/a', worktree: '/tmp/wt-a', startedAt: 0 }
    expect(tryAcquireLock(lock, me, () => true)).toEqual({ ok: true })
    // `pid` stays the first file older hooks read.
    expect(readFileSync(join(lock, 'pid'), 'utf8')).toBe('100\n')
    const held = tryAcquireLock(lock, { pid: 200 }, (pid) => pid === 100)
    expect(held).toEqual({ ok: false, holder: expect.objectContaining({ pid: 100, branch: 'fix/a' }) })
    releaseLock(lock, 200) // not ours: a no-op
    expect(existsSync(lock)).toBe(true)
    // Holder 100 crashed: the next push reclaims the lock.
    expect(tryAcquireLock(lock, { pid: 200 }, () => false)).toEqual({ ok: true })
    releaseLock(lock, 200)
    expect(existsSync(lock)).toBe(false)
  })

  it('reads an older hook lock that holds only a pid', () => {
    const lock = join(dir, 'pyreon-pre-push.lock')
    mkdirSync(lock)
    writeFileSync(join(lock, 'pid'), '4242\n')
    const held = tryAcquireLock(lock, { pid: 1 }, () => true)
    expect(held).toEqual({ ok: false, holder: { pid: 4242 } })
  })

  it('a waiting push names the holder, then gives up inside its budget', async () => {
    const lock = join(dir, 'pyreon-pre-push.lock')
    tryAcquireLock(lock, { pid: 100, branch: 'fix/a', worktree: '/tmp/wt-a', startedAt: 0, step: 'tests @pyreon/core' }, () => true)
    let t = 60_000
    const logs: string[] = []
    const got = await waitForLock({
      lockDir: lock,
      owner: { pid: 200 },
      budgetMs: 90_000,
      now: () => t,
      sleep: async (ms) => {
        t += ms
      },
      log: (l) => logs.push(l),
      alive: () => true,
    })
    expect(got.ok).toBe(false)
    expect(t - 60_000).toBeLessThanOrEqual(90_000)
    expect(logs[0]).toMatch(/held by pid 100, branch fix\/a, in \/tmp\/wt-a, running "tests @pyreon\/core", holding it for 60s/)
    // Repeated every 30s, not every poll.
    expect(logs.length).toBe(3)
    if (!got.ok) expect(got.reason).toMatch(/stayed held by pid 100/)
  })

  it('an empty lock (crash between mkdir and the pid write) is reclaimed after a minute of waiting, not before', async () => {
    const lock = join(dir, 'pyreon-pre-push.lock')
    mkdirSync(lock)
    expect(tryAcquireLock(lock, { pid: 1 }, () => true)).toEqual({ ok: false, holder: null })
    let t = 0
    const got = await waitForLock({
      lockDir: lock,
      owner: { pid: 200 },
      budgetMs: 120_000,
      now: () => t,
      sleep: async (ms) => {
        t += ms
      },
      log: () => {},
      alive: () => true,
    })
    expect(got.ok).toBe(true)
    expect(t).toBeGreaterThanOrEqual(EMPTY_LOCK_RECLAIM_MS)
    expect(t).toBeLessThan(EMPTY_LOCK_RECLAIM_MS + 5_000)
  })

  it('a waiting push takes the lock as soon as the holder releases it', async () => {
    const lock = join(dir, 'pyreon-pre-push.lock')
    tryAcquireLock(lock, { pid: 100 }, () => true)
    let t = 0
    const got = await waitForLock({
      lockDir: lock,
      owner: { pid: 200 },
      budgetMs: 90_000,
      now: () => t,
      sleep: async (ms) => {
        t += ms
        if (t >= 10_000) releaseLock(lock, 100)
      },
      log: () => {},
      alive: () => true,
    })
    expect(got.ok).toBe(true)
    expect(t).toBe(10_000)
  })
})

describe('learned durations', () => {
  it('records the latest duration and bounds the store by age and count', () => {
    let d = parseDurations(null)
    d = recordDuration(d, 'test|old', 5, 0)
    d = recordDuration(d, 'test|a', 10, DURATIONS_MAX_AGE_MS + 1)
    expect(Object.keys(d.entries)).toEqual(['test|a'])
    for (let i = 0; i < DURATIONS_MAX_ENTRIES + 10; i++) d = recordDuration(d, `test|p${i}`, i, DURATIONS_MAX_AGE_MS + 2 + i)
    expect(Object.keys(d.entries).length).toBe(DURATIONS_MAX_ENTRIES)
    expect(parseDurations('not json')).toEqual({ version: 1, entries: {} })
  })
})

describe('buildSteps', () => {
  const ws = (name: string, dir: string): WorkspaceInfo => ({
    name,
    dir: `/r/${dir}`,
    deps: [],
    scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
  })
  const WS = [ws('@pyreon/a', 'packages/a'), ws('@pyreon/b', 'packages/b'), ws('@pyreon/test-utils', 'packages/internals/test-utils'), ws('@pyreon/native-compiler', 'packages/native/compiler')]
  const plan = (over: Partial<Plan>): Plan => ({
    unknownDiff: false,
    rules: [],
    direct: [],
    closureSize: 0,
    groups: { typecheck: [], test: [], 'native-vitest': [], 'native-script': [] },
    targetedTests: null,
    installCheck: false,
    ...over,
  })
  const keys = new Map(WS.map((w) => [w.name, `k-${w.name}`]))

  it('orders cheap gates, then the changed packages\' typecheck, their tests, native suites', () => {
    const { steps } = buildSteps({
      plan: plan({
        groups: { typecheck: ['@pyreon/a'], test: ['@pyreon/a'], 'native-vitest': ['@pyreon/native-compiler'], 'native-script': [] },
        installCheck: true,
      }),
      workspaces: WS,
      keys,
      cache: { version: 1, entries: {} },
      kotlinHome: '/k',
    })
    expect(steps.map((s) => [s.id, s.locked])).toEqual([
      ['validate-fast', false],
      ['install', false],
      ['typecheck', true],
      ['test:@pyreon/a', true],
      ['native-vitest:@pyreon/native-compiler', true],
    ])
    expect(steps[4]!.argv).toEqual(['bun', 'run', 'test', '--', '--maxWorkers=4'])
    expect(steps[4]!.env).toEqual({ KOTLIN_HOME: '/k' })
    expect(steps[4]!.durationKey).toBe('test|@pyreon/native-compiler')
  })

  it('a changed package without a test script gets no test step, so no filtered run can find nothing', () => {
    // #4232 taught the old shell hook to tolerate bun's "no package has a test
    // script" error (bun 1.4.0 and 1.4.4 word it differently). The runner never
    // reaches that case: tests run per package in its own directory, and only
    // for packages that declare `test` (computePlan), so this pins it.
    const p = computePlan({
      changed: ['packages/tools/no-tests/src/x.ts', 'packages/tools/bare/src/y.ts'],
      workspaces: [
        { name: '@pyreon/no-tests', dir: '/r/packages/tools/no-tests', deps: [], scripts: { typecheck: 'tsc --noEmit' } },
        { name: '@pyreon/bare', dir: '/r/packages/tools/bare', deps: [], scripts: {} },
      ],
      root: '/r',
    })
    expect(p.groups.test).toEqual([])
    const { steps } = buildSteps({
      plan: p,
      workspaces: WS,
      keys: new Map(),
      cache: { version: 1, entries: {} },
      kotlinHome: null,
    })
    expect(steps.map((s) => s.id)).toEqual(['validate-fast', 'typecheck'])
    expect(steps[1]!.argv).toEqual(['bun', 'run', '--filter=@pyreon/no-tests', '--sequential', 'typecheck'])
  })

  it('skips what already passed with identical inputs, and a targeted test-utils run records no pass', () => {
    const { steps, cached } = buildSteps({
      plan: plan({
        groups: { typecheck: ['@pyreon/a', '@pyreon/b'], test: ['@pyreon/a', '@pyreon/test-utils'], 'native-vitest': [], 'native-script': [] },
        targetedTests: ['packages/internals/test-utils/src/tests/budgets.test.ts'],
      }),
      workspaces: WS,
      keys,
      cache: { version: 1, entries: { [entryKey('typecheck', '@pyreon/a', 'k-@pyreon/a')]: 1, [entryKey('test', '@pyreon/a', 'k-@pyreon/a')]: 1 } },
      kotlinHome: null,
    })
    expect(cached).toEqual(['typecheck @pyreon/a', 'test @pyreon/a'])
    const tc = steps.find((s) => s.id === 'typecheck')!
    expect(tc.argv).toEqual(['bun', 'run', '--filter=@pyreon/b', '--sequential', 'typecheck'])
    const targeted = steps.find((s) => s.id === 'test:@pyreon/test-utils:targeted')!
    expect(targeted.argv).toEqual(['bun', 'run', 'test', '--', 'src/tests/budgets.test.ts'])
    expect(targeted.cwd).toBe('/r/packages/internals/test-utils')
    expect(targeted.passes).toEqual([])
  })
})
