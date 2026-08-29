// ─── Signal seeded from SIBLING SIGNAL reads (Swift) ────────────────────────
//
// THE BUG: `const count = signal(5); const derived = signal(count() * 2)`
// emitted `@State private var derived = count * 2` — a stored-property
// initializer referencing a sibling `@State` member, which swiftc rejects
// ("cannot use instance member within property initializer") with ZERO
// compiler warnings from the emit. Kotlin was never broken (its `var x by
// remember` lines share one function scope). Computeds were never broken
// either (a computed PROPERTY getter may read self) — only
// `signal(<sibling read>)`.
//
// THE FIX: a per-component pre-pass substitutes each sibling read with that
// sibling's own construction-time seed expression — semantically faithful,
// because Pyreon reads the sibling exactly once at construction. Source
// order is a valid topological order, so one forward pass with cumulative
// seeds handles chains. Shapes that cannot be substituted faithfully
// (storage-backed source — its runtime value is NOT its default; enum-typed
// decls; non-pure seeds; walker-uncovered nodes caught by the TOTAL residual
// check) keep the old emit and warn LOUDLY — the warning-free silence was
// the actual bug.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

const warningsOf = (r: { warnings?: unknown[] }): string[] =>
  (r.warnings ?? []).map((w) => (typeof w === 'string' ? w : (w as { message: string }).message))

describe('signal seeded from sibling signal reads', () => {
  it('Swift: substitutes the sibling read with its construction-time seed', () => {
    const r = transform(
      app(`  const count = signal(5)\n  const derived = signal(count() * 2)`),
      { target: 'swift' },
    )
    expect(r.code).toContain('@State private var derived: Int = (5) * 2')
    expect(r.code).not.toMatch(/var derived[^=]*= count/)
    expect(warningsOf(r).filter((m) => m.includes('sibling'))).toHaveLength(0)
  })

  it('Swift: a CHAIN substitutes transitively in source order', () => {
    const r = transform(
      app(
        `  const count = signal(5)\n  const derived = signal(count() * 2)\n  const chained = signal(derived() + 1)`,
      ),
      { target: 'swift' },
    )
    expect(r.code).toContain('@State private var chained: Int = ((5) * 2) + 1')
  })

  it('Swift: mixes with value-const inlining', () => {
    const r = transform(
      app(`  const base = 10\n  const count = signal(5)\n  const mixed = signal(count() + base)`),
      { target: 'swift' },
    )
    expect(r.code).toContain('@State private var mixed: Int = (5) + (10)')
  })

  it('Swift: a STORAGE-BACKED source bails with a loud, named warning', () => {
    // Substituting a persisted signal's DEFAULT would silently ignore what is
    // in UserDefaults — the one thing worse than not compiling.
    const r = transform(
      app(`  const stored = useStorage('count-key', 5)\n  const derived = signal(stored() + 1)`),
      { target: 'swift' },
    )
    const w = warningsOf(r).filter((m) => m.includes("signal 'derived'"))
    expect(w).toHaveLength(1)
    expect(w[0]).toContain("'stored'")
    expect(w[0]).toContain('computed()')
  })

  it('Swift: a computed over a sibling signal is untouched (property getters may read self)', () => {
    const r = transform(
      app(`  const count = signal(5)\n  const doubled = computed(() => count() * 2)`),
      { target: 'swift' },
    )
    expect(r.code).toMatch(/private var doubled[^{]*\{/)
    expect(warningsOf(r).filter((m) => m.includes('sibling'))).toHaveLength(0)
  })

  it('Kotlin: emit is unchanged — remember lines share one function scope', () => {
    const r = transform(
      app(`  const count = signal(5)\n  const derived = signal(count() * 2)`),
      { target: 'kotlin' },
    )
    expect(r.code).toContain('var derived by remember { mutableStateOf(count * 2) }')
    expect(warningsOf(r).filter((m) => m.includes('sibling'))).toHaveLength(0)
  })

  it.runIf(isSwiftUIAvailable())('REAL-SDK typecheck: sibling-seeded signals compile', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const count = signal(5)
  const derived = signal(count() * 2)
  const chained = signal(derived() + 1)
  const base = 10
  const mixed = signal(count() + base)
  return (<Stack><Text>{derived()}</Text><Text>{chained()}</Text><Text>{mixed()}</Text></Stack>)
}`
    const r = validateSwiftTypecheck(transform(src, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error).slice(0, 400)).toBe(true)
  })

  it.runIf(isKotlincAvailable())('kotlinc: the Kotlin twin still compiles', async () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const count = signal(5)
  const derived = signal(count() * 2)
  return (<Stack><Text>{derived()}</Text></Stack>)
}`
    const r = await validateKotlin(transform(src, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String((r as { error?: string }).error).slice(0, 400)).toBe(true)
  })
})
