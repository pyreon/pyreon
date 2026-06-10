// Tier-2 verification — @pyreon/machine emit works correctly post
// Gap 4 PR-2 Strategy-B port. (Pre-port history below.)
//
// machine's API: `const m = createMachine({ initial, states })` returns
// a constrained signal-like value with `.send(event)` / `.matches(state)`
// / `.can(event)` / `.nextEvents()` methods, plus `m()` reads current
// state.
//
// PRE-FIX HISTORY:
//   - PR #1317 surfaced @pyreon/rx Tier-2 silent-drop
//   - PR #1319 LOCKED the broken machine state (silent drop)
//   - PR #1444 added Tier-2 silent-drop diagnostics for all 5 Strategy-B
//     callees including createMachine
//   - THIS PR ships the full Strategy-B port + REMOVES createMachine
//     from the tier2StrategyB diagnostic list (rebase contract).
//
// Reference: docs/src/content/docs/multiplatform-libraries.md → "Tier 2"

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(HERE, '..', 'fixtures', 'tier2-machine.tsx')

describe('Tier-2 — @pyreon/machine Strategy-B emit (Gap 4 PR-2)', () => {
  it('Swift: emits @State PyreonMachine with literal initial + transitions', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'swift' })
    expect(result.code).toContain('@State private var m = PyreonMachine(')
    expect(result.code).toContain('initial: "idle"')
    expect(result.code).toContain('"idle": ["FETCH": "loading"]')
    expect(result.code).toContain(
      '"loading": ["SUCCESS": "done", "ERROR": "error"]',
    )
    expect(result.code).toContain('"done": [:]')
    expect(result.code).toContain('"error": ["RETRY": "loading"]')
    expect(result.code).toContain('m.send("FETCH")')
    expect(result.code).toContain('m.send("SUCCESS")')
    expect(result.code).toContain('m.matches("loading")')
  })

  it('Kotlin: emits val + remember PyreonMachine with literal config', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'kotlin' })
    expect(result.code).toContain('val m = remember { PyreonMachine(')
    expect(result.code).toContain('initial = "idle"')
    expect(result.code).toContain('"idle" to mapOf("FETCH" to "loading")')
    expect(result.code).toContain(
      '"loading" to mapOf("SUCCESS" to "done", "ERROR" to "error")',
    )
    expect(result.code).toContain('"done" to mapOf()')
    expect(result.code).toContain('"error" to mapOf("RETRY" to "loading")')
    expect(result.code).toContain('m.send("FETCH")')
    expect(result.code).toContain('m.matches("loading")')
  })

  it('transform emits NO silent-drop warning for createMachine post-port', () => {
    // Post-PR-2 + rebase, createMachine is removed from the
    // tier2StrategyB list in parse.ts. The other 4 callees
    // (defineStore / createI18n / model / defineFeature)
    // still warn until their own ports ship.
    const src = readFileSync(FIXTURE, 'utf8')
    const swift = transform(src, { target: 'swift' })
    const kotlin = transform(src, { target: 'kotlin' })
    const machineWarnings = (warnings: string[]) =>
      warnings.filter((w) => w.startsWith('createMachine()'))
    expect(machineWarnings(swift.warnings ?? [])).toEqual([])
    expect(machineWarnings(kotlin.warnings ?? [])).toEqual([])
  })

  it('`m()` reads current state via callAsFunction / operator invoke', () => {
    // Without _machineNames tracking, `m()` would emit as bare `m`.
    const source = `
import { createMachine } from '@pyreon/machine'
import { Stack, Text } from '@pyreon/primitives'

export function StateView() {
  const m = createMachine({
    initial: 'idle' as const,
    states: { idle: { on: { FETCH: 'loading' } }, loading: {} },
  })
  return (
    <Stack>
      <Text>{m()}</Text>
    </Stack>
  )
}
`
    const swift = transform(source, { target: 'swift' })
    const kotlin = transform(source, { target: 'kotlin' })
    expect(swift.code).toMatch(/m\(\)/)
    expect(kotlin.code).toMatch(/m\(\)/)
  })
})
