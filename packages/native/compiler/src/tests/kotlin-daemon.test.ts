// The warm Kotlin compiler (kotlin-daemon.ts) is a SPEED-UP, never a second
// source of verdicts. These specs hold that line: the same emitted shapes
// compile to the same outcome through the daemon and through one `kotlinc`
// per check, a rejection carries the compiler's own diagnostic either way,
// and every "cannot run here" path degrades to the plain path rather than
// to a skipped or forged verdict.
//
// Gated on a real kotlinc like every other validate spec — a parity claim
// made against a stub would be the exact hole this file exists to close.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  _kotlinDaemonActive,
  _resetKotlinDaemon,
  compileKotlinViaDaemon,
  kotlinDaemonDisabledReason,
  kotlinLibDir,
} from '../kotlin-daemon'
import { KOTLIN_COMPOSE_STUBS } from '../kotlin-stubs'
import { isKotlincAvailable, validateKotlin } from '../validate'
import { _resetValidateCache } from '../validate-cache'

const app = (body: string) =>
  `import { Stack, Text, Button } from '@pyreon/primitives'
function App() {
  const base = signal<number>(2)
${body}
  return (<Stack><Text>{base()}</Text><Button onPress={() => base.set(base() + 1)}>+</Button></Stack>)
}`

const VALID = transform(app(`  const sq = computed(() => base() ** 2)`), { target: 'kotlin' }).code
// A shape kotlinc must reject: a String initialiser on an Int declaration.
// (Not a swapped state literal — `String + Int` is legal Kotlin, so that
// would have been an "invalid" shape the compiler accepts.)
const INVALID = `val pyreonDaemonParityProbe: Int = "not an int"\n${VALID}`

/** Strip the temp-dir prefix so two runs' diagnostics compare on substance. */
const diagnostics = (error: string | undefined) =>
  (error ?? '')
    .split('\n')
    .filter((l) => l.includes('error:'))
    .map((l) => l.replace(/^.*Input\.kt:/, 'Input.kt:').trim())

describe.runIf(isKotlincAvailable())('kotlin daemon — parity with per-check kotlinc', () => {
  const previous = process.env.PYREON_KOTLIN_DAEMON
  beforeAll(() => {
    _resetKotlinDaemon()
  })
  afterAll(() => {
    _resetKotlinDaemon()
    if (previous === undefined) delete process.env.PYREON_KOTLIN_DAEMON
    else process.env.PYREON_KOTLIN_DAEMON = previous
  })

  const both = (source: string) => {
    // The verdict cache would otherwise answer the second call from the first —
    // and `_resetValidateCache` clears only the in-memory tier, so a RESTORED
    // on-disk cache (CI) answers both calls, no compiler runs, and the daemon
    // reads inactive with no reason. Bypass both tiers for the comparison.
    const prevNoCache = process.env.PYREON_VALIDATE_NO_CACHE
    process.env.PYREON_VALIDATE_NO_CACHE = '1'
    _resetValidateCache()
    _resetKotlinDaemon()
    delete process.env.PYREON_KOTLIN_DAEMON
    const viaDaemon = validateKotlin(source)
    const daemonActive = _kotlinDaemonActive()
    const daemonDisabled = kotlinDaemonDisabledReason()
    _resetValidateCache()
    _resetKotlinDaemon()
    process.env.PYREON_KOTLIN_DAEMON = '0'
    const viaCli = validateKotlin(source)
    delete process.env.PYREON_KOTLIN_DAEMON
    if (prevNoCache === undefined) delete process.env.PYREON_VALIDATE_NO_CACHE
    else process.env.PYREON_VALIDATE_NO_CACHE = prevNoCache
    _resetValidateCache()
    return { viaDaemon, viaCli, daemonActive, daemonDisabled }
  }

  it('the daemon actually runs here (the speed-up is not silently a fallback)', () => {
    expect(INVALID).not.toBe(VALID)
    expect(kotlinLibDir(), 'kotlin-compiler.jar must be resolvable beside kotlinc').not.toBeNull()
    const { daemonActive, daemonDisabled } = both(VALID)
    expect(daemonDisabled).toBeNull()
    expect(daemonActive).toBe(true)
  })

  it('an accepted emit is accepted both ways', () => {
    const { viaDaemon, viaCli } = both(VALID)
    expect(viaDaemon).toEqual({ ok: true })
    expect(viaCli).toEqual({ ok: true })
  })

  it('a rejected emit is rejected both ways, with the same compiler diagnostic', () => {
    const { viaDaemon, viaCli } = both(INVALID)
    expect(viaDaemon.ok).toBe(false)
    expect(viaCli.ok).toBe(false)
    expect(viaDaemon.transient).toBeUndefined()
    expect(diagnostics(viaDaemon.error).length).toBeGreaterThan(0)
    expect(diagnostics(viaDaemon.error)).toEqual(diagnostics(viaCli.error))
  })

  it('PYREON_KOTLIN_DAEMON=0 disables the daemon and names why', () => {
    _resetKotlinDaemon()
    process.env.PYREON_KOTLIN_DAEMON = '0'
    expect(compileKotlinViaDaemon(VALID, KOTLIN_COMPOSE_STUBS, '', 'v', 10_000)).toBeNull()
    expect(kotlinDaemonDisabledReason()).toContain('PYREON_KOTLIN_DAEMON=0')
    expect(_kotlinDaemonActive()).toBe(false)
    delete process.env.PYREON_KOTLIN_DAEMON
  })

  it('a missing toolchain home disables the daemon rather than faking a verdict', () => {
    _resetKotlinDaemon()
    const home = process.env.KOTLIN_HOME
    const path = process.env.PATH
    process.env.KOTLIN_HOME = '/nonexistent/kotlin-home'
    process.env.PATH = '/nonexistent/bin'
    try {
      expect(compileKotlinViaDaemon(VALID, KOTLIN_COMPOSE_STUBS, '', 'v', 10_000)).toBeNull()
      expect(kotlinDaemonDisabledReason()).toContain('kotlin-compiler.jar')
    } finally {
      if (home === undefined) delete process.env.KOTLIN_HOME
      else process.env.KOTLIN_HOME = home
      process.env.PATH = path
      _resetKotlinDaemon()
    }
  })
})
