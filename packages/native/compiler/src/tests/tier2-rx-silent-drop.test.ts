// Tier-2 verification — @pyreon/rx silent-drop regression.
//
// rx exposes a namespaced API: `rx.filter(signal, predicate)`,
// `rx.sortBy(signal, key)`, `rx.take(signal, n)`, `rx.count(signal)`,
// `rx.average(signal)`, etc. These are signal-aware reactive transforms
// that return Computed<T> when given a signal input.
//
// The multiplatform-libraries.md audit (PR #1296) originally classified
// rx as Tier-2 ("pure-logic, should compile via PMTC, unverified") on
// the theory that rx is a thin wrapper over signals + computed, both of
// which compile cleanly via PMTC.
//
// This test surfaces the gap: PMTC does NOT recognise the `rx.*`
// namespace and silently DROPS calls to it from the emitted Swift /
// Kotlin output. The fixture's `active`, `sortedByPriority`, `top5`,
// `activeCount`, `avgPriority` derivations are all absent from both
// targets' emit — the function body is essentially empty on native.
//
// This is a SILENT correctness bug, worse than a hard error. The audit
// doc has been corrected to move rx into Tier 3 ("needs Pyreon-blessed
// native impl" via PMTC parser update for the rx.* namespace OR per-
// target rx runtime port).
//
// This test LOCKS the current broken behaviour so:
//   1. We have an explicit regression marker — CI fails the day someone
//      changes the silent-drop behaviour.
//   2. When PMTC gains rx support, this test flips green by REMOVING
//      the negative assertions (or moves to a positive test).
//
// Do NOT add tier2-rx.tsx to validate-swift.test.ts / validate-kotlin.
// test.ts fixture loops. Transform "succeeds" with empty output —
// swiftc / kotlinc accept the silent-drop emit cleanly, which makes
// the validation loops misleadingly green.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(HERE, '..', 'fixtures', 'tier2-rx.tsx')

describe('Tier-2 audit — @pyreon/rx silent-drop (known bug)', () => {
  it('Swift: emit omits every rx.* call from the user body', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'swift' })
    // PMTC emits the signal declaration but DROPS the rx.* expressions.
    expect(result.code).toContain('@State private var todos: [Todo] = []')
    // The user wrote 5 distinct rx.* call shapes — none reach the emit.
    expect(result.code).not.toContain('rx.filter')
    expect(result.code).not.toContain('rx.sortBy')
    expect(result.code).not.toContain('rx.take')
    expect(result.code).not.toContain('rx.count')
    expect(result.code).not.toContain('rx.average')
    expect(result.code).not.toContain('rx.map')
  })

  it('Kotlin: emit omits every rx.* call from the user body', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'kotlin' })
    expect(result.code).toContain('var todos by remember { mutableStateOf')
    expect(result.code).not.toContain('rx.filter')
    expect(result.code).not.toContain('rx.sortBy')
    expect(result.code).not.toContain('rx.take')
    expect(result.code).not.toContain('rx.count')
    expect(result.code).not.toContain('rx.average')
    expect(result.code).not.toContain('rx.map')
  })

  it('the transform does NOT emit any warning about the dropped calls (the bug)', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const swift = transform(src, { target: 'swift' })
    const kotlin = transform(src, { target: 'kotlin' })
    // Today: no warning. Ideally PMTC would surface an UNSUPPORTED
    // diagnostic for unknown namespaced calls. Tracking the warning
    // absence locks the current state — when PMTC gains the warning,
    // this test flips and gets removed in the same PR.
    const rxRelatedWarnings = (warnings: string[]) =>
      warnings.filter((w) => /rx\.|unknown.*call|silent.*drop/i.test(w))
    expect(rxRelatedWarnings(swift.warnings ?? [])).toEqual([])
    expect(rxRelatedWarnings(kotlin.warnings ?? [])).toEqual([])
  })
})
