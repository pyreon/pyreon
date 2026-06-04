// Tier-2 verification — @pyreon/machine emit is structurally broken.
//
// machine's API: `const m = createMachine({...})` returns a constrained
// signal-like value with `.send(event)` and `.matches(state)` methods.
//
// PMTC behaviour: the `createMachine(...)` declaration is SILENTLY
// DROPPED (same shape as the rx bug from PR #1317), but the call sites
// `m.send(...)` and `m.matches(...)` are PRESERVED. This yields emit
// that references an undefined `m`:
//
//   Swift: private func start() { m.send("FETCH") }  // m: nowhere
//   Kotlin: fun start() = m.send("FETCH")            // m: nowhere
//
// This is a HARD swiftc/kotlinc compile error — different from rx's
// silent-drop. The bug is loud at the platform-compile layer, silent
// at the PMTC-transform layer (no warning surfaces).
//
// Audit consequence: machine moves Tier 2 → Tier 3 alongside rx.
// Fix paths (same as rx):
//   1. Teach PMTC's parser the `createMachine` shape — emit the binding
//      as Swift `@State private var m: PyreonMachine = ...` / Kotlin
//      `var m by remember { mutableStateOf(...) }` and lower .send/.matches
//      to native equivalents.
//   2. Per-target Swift / Kotlin machine runtime ports.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(HERE, '..', 'fixtures', 'tier2-machine.tsx')

describe('Tier-2 audit — @pyreon/machine structurally-broken emit (known bug)', () => {
  it('Swift: emit drops the createMachine binding but keeps the method calls (broken)', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'swift' })
    // The createMachine binding is silently dropped — NO `var m` /
    // `let m` / `m =` anywhere in the emitted struct body.
    expect(result.code).not.toContain('createMachine')
    expect(result.code).not.toMatch(/\b(var|let)\s+m\b/)
    // But the method calls are preserved, referencing the dropped m.
    expect(result.code).toContain('m.send("FETCH")')
    expect(result.code).toContain('m.send("SUCCESS")')
    expect(result.code).toContain('m.matches("loading")')
  })

  it('Kotlin: same bug shape — dropped binding, kept method calls', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'kotlin' })
    expect(result.code).not.toContain('createMachine')
    expect(result.code).not.toMatch(/\b(var|val)\s+m\b/)
    expect(result.code).toContain('m.send("FETCH")')
    expect(result.code).toContain('m.matches("loading")')
  })

  it('the transform does NOT emit any warning about the dropped binding (the bug)', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const swift = transform(src, { target: 'swift' })
    const kotlin = transform(src, { target: 'kotlin' })
    const machineWarnings = (warnings: string[]) =>
      warnings.filter((w) => /createMachine|@pyreon\/machine|unknown.*call/i.test(w))
    expect(machineWarnings(swift.warnings ?? [])).toEqual([])
    expect(machineWarnings(kotlin.warnings ?? [])).toEqual([])
  })
})
