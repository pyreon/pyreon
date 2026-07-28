// `useDatabase()` did not persist. On EITHER platform.
//
// The runtimes' `PyreonDatabase` defaulted to an in-memory backend, and the
// emit constructed exactly that default — so an app that inserted records and
// relaunched found them gone. No warning, no error, no failing test: the emit
// compiled, the typecheck passed, and the data was simply not there next
// launch. The whole reason `useDatabase` exists over `useStorage` is
// STRUCTURED data that OUTLIVES the process, so "in-memory by default" was
// not a conservative starting point — it was silent data loss.
//
// The fix is split across three layers, and this file locks the compiler's:
//
//   runtime-swift   FileDatabaseBackend becomes the default of `PyreonDatabase()`
//   runtime-kotlin  FileDatabaseBackend + `PyreonDatabase(context)`; NO no-arg form
//   compiler        Kotlin threads `LocalContext.current` into the constructor
//
// The two targets are asymmetric ON PURPOSE, which is the part worth stating
// plainly so a future reader does not "fix" it: Foundation resolves an
// Application Support directory with no ceremony, so Swift's no-arg initialiser
// can BE the persistent one; Android cannot find app-private storage without a
// Context, so Kotlin has no no-arg form at all and the emit supplies one. Same
// guarantee, different spelling.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, validateKotlin } from '../validate'

const SRC = `import { useDatabase } from '@pyreon/primitives'
import { Stack, Text } from '@pyreon/primitives'
export function Ledger() {
  const db = useDatabase()
  return (
    <Stack>
      <Text>{db.count('txns')}</Text>
    </Stack>
  )
}`

const kotlin = (src: string) => transform(src, { target: 'kotlin' })
const swift = (src: string) => transform(src, { target: 'swift' })

describe('useDatabase persists by default', () => {
  it('Kotlin threads a Context into the constructor', () => {
    const out = kotlin(SRC).code
    expect(out).toContain('val dbCtx = LocalContext.current')
    expect(out).toContain('val db = remember { PyreonDatabase(dbCtx) }')
  })

  it('Kotlin NEVER emits the bare `PyreonDatabase()` — that was the bug', () => {
    // Stated as its own assertion because it is the regression, not a
    // by-product of the assertion above: an emit could satisfy both the
    // Context line and a stray bare construction elsewhere.
    expect(kotlin(SRC).code).not.toContain('PyreonDatabase()')
  })

  it('Swift keeps the no-arg initialiser — there it is the PERSISTENT one', () => {
    // Not an oversight: `FileDatabaseBackend()` is the Swift default, so the
    // no-arg form persists. Threading a Context-equivalent would be noise.
    expect(swift(SRC).code).toContain('@State private var db = PyreonDatabase()')
  })

  it('emits no warnings for a plain useDatabase component', () => {
    expect(kotlin(SRC).warnings ?? []).toEqual([])
    expect(swift(SRC).warnings ?? []).toEqual([])
  })

  it('threads a DISTINCT Context per database in one component', () => {
    // Two databases must not collide on one `dbCtx` binding — the same
    // per-declaration naming `useNativeModule` uses.
    const two = `import { useDatabase } from '@pyreon/primitives'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const ledger = useDatabase()
  const cache = useDatabase()
  return <Stack><Text>{ledger.count('a')}</Text><Text>{cache.count('b')}</Text></Stack>
}`
    const out = kotlin(two).code
    expect(out).toContain('val ledgerCtx = LocalContext.current')
    expect(out).toContain('val ledger = remember { PyreonDatabase(ledgerCtx) }')
    expect(out).toContain('val cacheCtx = LocalContext.current')
    expect(out).toContain('val cache = remember { PyreonDatabase(cacheCtx) }')
  })

  // The stub half of the fix. `kotlin-stubs.ts` mirrors the REAL surface: the
  // Context factory exists and the no-arg constructor is `internal`, so an emit
  // that regressed to `PyreonDatabase()` would FAIL to typecheck rather than
  // sailing through against a permissive stub. Superset stubs mask — that rule
  // has cost this compiler four separate incidents.
  it.skipIf(!isKotlincAvailable())('the emitted Kotlin typechecks against the stubs', () => {
    const res = validateKotlin(kotlin(SRC).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('a REGRESSED bare-constructor emit FAILS the stub typecheck', () => {
    // Proves the stub is load-bearing, not decorative: this is the exact
    // string the emit used to produce.
    const regressed = kotlin(SRC).code.replace('PyreonDatabase(dbCtx)', 'PyreonDatabase()')
    const res = validateKotlin(regressed)
    expect(res.ok).toBe(false)
  })
})
