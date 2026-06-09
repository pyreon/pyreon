// Tier-2 Strategy-B emit verification — @pyreon/store v1 (Gap 4 PR-4).
//
// First Strategy-B port with NEW PMTC infrastructure:
//   - Top-level store-class emit (sibling of enum / struct emits)
//   - Multi-step member-access chain rewriting at expr-emit time
//     (`useFoo().store.X` → `PyreonStore_foo.shared.X` / `.X`)
//
// v1 SCOPE: setup body of `const X = signal(...)` decls only,
// returned object literal shorthand keys only, use-site shape
// `useStoreName().store.signalName()` (read) +
// `useStoreName().store.signalName.set(v)` (write).
//
// Deferred (v2+): computeds in setup body, methods in setup body,
// patch({...}) batched updates, subscribe() watchers, destructure
// use form `const { store, patch } = useStoreName()`.
//
// Bisect-verify: disable `tryStoreDefnFromTopLevel` in parse.ts →
// each "emits" spec fails. Restored → all pass.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(HERE, '..', 'fixtures', 'tier2-store.tsx')

describe('Tier-2 — @pyreon/store Strategy-B emit v1 (Gap 4 PR-4)', () => {
  it('Swift: emits @Observable singleton class with typed fields + shared accessor', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'swift' })
    expect(result.code).toContain('@Observable')
    expect(result.code).toContain('final class PyreonStore_counter: PyreonStoreProtocol')
    expect(result.code).toContain('static let shared = PyreonStore_counter()')
    expect(result.code).toContain('var count: Int = 0')
    expect(result.code).toContain('var label: String = "counter"')
    expect(result.code).toContain('private init() {}')
  })

  it('Swift: rewrites useFoo().store.X reads as bare property access (no parens)', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'swift' })
    expect(result.code).toContain('PyreonStore_counter.shared.label')
    expect(result.code).toContain('PyreonStore_counter.shared.count')
    // NOT `PyreonStore_counter.shared.count()` — store fields are
    // properties, not callables. The signal-style read shortcut must
    // drop parens.
    expect(result.code).not.toContain('PyreonStore_counter.shared.count()')
    expect(result.code).not.toContain('PyreonStore_counter.shared.label()')
  })

  it('Swift: rewrites useFoo().store.X.set(v) as direct assignment', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'swift' })
    // The Button onPress body is the write site.
    expect(result.code).toMatch(
      /PyreonStore_counter\.shared\.count = PyreonStore_counter\.shared\.count \+ 1/,
    )
  })

  it('Kotlin: emits Kotlin object singleton with by-delegate state', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'kotlin' })
    expect(result.code).toContain('object PyreonStore_counter : PyreonStore')
    expect(result.code).toContain('var count by mutableStateOf(0)')
    expect(result.code).toContain('var label by mutableStateOf("counter")')
  })

  it('Kotlin: rewrites useFoo().store.X reads as bare property access', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'kotlin' })
    expect(result.code).toContain('PyreonStore_counter.label')
    expect(result.code).toContain('PyreonStore_counter.count')
    expect(result.code).not.toContain('PyreonStore_counter.count()')
    expect(result.code).not.toContain('PyreonStore_counter.label()')
  })

  it('Kotlin: rewrites useFoo().store.X.set(v) as direct assignment', () => {
    const src = readFileSync(FIXTURE, 'utf8')
    const result = transform(src, { target: 'kotlin' })
    expect(result.code).toMatch(
      /PyreonStore_counter\.count = PyreonStore_counter\.count \+ 1/,
    )
  })

  it('emits NO silent-drop warning for defineStore post-port', () => {
    // Once #1444 is rebased to drop defineStore from its diagnostic
    // list (this PR ships the real port), the warning vanishes.
    // This test pre-asserts the post-rebase state.
    const src = readFileSync(FIXTURE, 'utf8')
    const swift = transform(src, { target: 'swift' })
    const kotlin = transform(src, { target: 'kotlin' })
    const storeWarnings = (warnings: string[]) =>
      warnings.filter((w) => w.startsWith('defineStore()'))
    expect(storeWarnings(swift.warnings ?? [])).toEqual([])
    expect(storeWarnings(kotlin.warnings ?? [])).toEqual([])
  })

  it('warns + falls through on unsupported setup body shape', () => {
    // v1 only supports `const X = signal(...)` decls in the setup
    // body. A function decl should bail with a warning.
    const source = `
import { defineStore } from '@pyreon/store'
import { signal } from '@pyreon/reactivity'

const useCounter = defineStore('counter', () => {
  const count = signal(0)
  function inc() { count.set(count() + 1) }
  return { count }
})

export function View() { return null }
`
    const result = transform(source, { target: 'swift' })
    const storeWarning = result.warnings.find((w) =>
      w.includes('defineStore `useCounter`'),
    )
    expect(storeWarning).toBeDefined()
    // No singleton class in emit (silent-drop preserved).
    expect(result.code).not.toContain('PyreonStore_counter')
  })
})
