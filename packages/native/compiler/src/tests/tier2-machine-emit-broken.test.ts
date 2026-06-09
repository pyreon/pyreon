// Tier-2 verification — @pyreon/machine still emits structurally
// broken code BUT now emits a diagnostic warning naming the
// silent-drop (Gap 4 first PR — "honest gate" before the full
// Strategy-B runtime port lands).
//
// machine's API: `const m = createMachine({...})` returns a constrained
// signal-like value with `.send(event)` and `.matches(state)` methods.
//
// PMTC behaviour (post-Gap-4-PR-1):
//   - The `createMachine(...)` declaration is recognized at the
//     parser layer and emits a CLEAR WARNING naming the binding +
//     package + Layer-4 workaround.
//   - The actual binding is STILL silently dropped (no DeclIR yet —
//     full Strategy-B runtime port is multi-PR follow-up); the
//     downstream `.send(...)` / `.matches(...)` references still
//     reference undefined `m` in emitted code.
//   - swiftc/kotlinc still rejects the emit (the platform-compile
//     layer surfaces the breakage), but the PMTC transform now
//     ALSO surfaces it, so authors aren't blindsided.
//
// When the full Strategy-B port for @pyreon/machine lands, this test
// flips again: the warning goes away, the emit becomes correct, and
// machine moves from Tier 2 → Tier 1.
//
// Reference: docs/docs/multiplatform-libraries.md → "Tier 2"

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

  it('the transform NOW emits a diagnostic warning naming the silent-drop (Gap 4 first PR)', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const swift = transform(src, { target: 'swift' })
    const kotlin = transform(src, { target: 'kotlin' })
    const machineWarnings = (warnings: string[]) =>
      warnings.filter((w) => /createMachine|@pyreon\/machine/i.test(w))
    // Both targets surface the warning naming binding + package +
    // Layer-4 workaround pointer. Same shape as Gap-3's lifecycle
    // walled-tag warnings (#1441).
    const swiftMachine = machineWarnings(swift.warnings ?? [])
    const kotlinMachine = machineWarnings(kotlin.warnings ?? [])
    expect(swiftMachine.length).toBe(1)
    expect(kotlinMachine.length).toBe(1)
    expect(swiftMachine[0]!).toContain('@pyreon/machine')
    expect(swiftMachine[0]!).toContain('Layer 4')
    expect(swiftMachine[0]!).toContain('NativeIOS')
    expect(kotlinMachine[0]!).toContain('NativeAndroid')
  })
})
