// The DEGRADE arms — the `unknown` / `null` returns `infer-type.ts` takes when
// a shape is outside the modelled set, plus the one remaining reachable branch
// in `extractTextTypography`.
//
// These matter for a reason that is easy to underrate: degrading is the SAFE
// answer (`Any` compiles, a `null` hands the caller its own path), so a wrong
// degrade never shows up as a crash. It shows up as a type annotation that is
// too wide, and only bites later when a typed consumer touches the value. So
// the assertion is always "it degraded, and it degraded HERE" rather than "it
// did not crash".

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function app(decls: string, ret = '<Text>x</Text>'): string {
  return `import { Stack, Text, Button } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
import { toast } from '@pyreon/toast'
export function App() {
  const n = signal(1)
  const xs = signal<number[]>([1])
  const s2 = signal('a')
  const m = new Map<string, number>()
  const st = new Set<number>()
${decls}
  return (<Stack>${ret}</Stack>)
}`
}

const annot = (decls: string, name: string): string =>
  transform(app(decls), { target: 'swift' })
    .code.split('\n')
    .find((l) => l.includes(`private var ${name}:`))
    ?.trim() ?? '(missing)'

describe('Map / Set methods OUTSIDE the modelled set degrade rather than guessing', () => {
  it('`m.clear()` is not `has`/`delete` — it falls past both guards', () => {
    expect(annot(`  const a = computed(() => m.clear())`, 'a')).toContain('var a: Any')
  })

  it('`set.clear()` falls past the set guard too', () => {
    expect(annot(`  const a = computed(() => st.clear())`, 'a')).toContain('var a: Any')
  })

  it('`m.set(k, v)` is a WRITE, not one of the typed reads', () => {
    expect(annot(`  const a = computed(() => m.set('k', 1))`, 'a')).toContain('var a: Any')
  })

  it('the CONTRAST: the modelled reads are typed precisely', () => {
    expect(annot(`  const a = computed(() => m.get('k'))`, 'a')).toContain('var a: Int?')
    expect(annot(`  const a = computed(() => m.has('k'))`, 'a')).toContain('var a: Bool')
  })
})

describe('array member reads outside `.length`', () => {
  it('`.at(i)` is typed as the OPTIONAL element (a real lowering, not a degrade)', () => {
    expect(annot(`  const a = computed(() => xs().at(0))`, 'a')).toContain('var a: Int?')
  })

  it('an unmodelled array PROPERTY degrades — the `.length` guard is specific', () => {
    expect(annot(`  const a = computed(() => xs().at)`, 'a')).toContain('var a: Any')
  })

  it('`.length` on an array and on a string are the two that do NOT degrade', () => {
    expect(annot(`  const a = computed(() => xs().length)`, 'a')).toContain('var a: Int')
    expect(annot(`  const a = computed(() => s2().length)`, 'a')).toContain('var a: Int')
  })
})

describe('statement-shaped expressions are values with no useful type', () => {
  it('a `toast(...)` used as a value degrades (its native emit returns an id nobody binds)', () => {
    expect(annot(`  const a = computed(() => toast('hi'))`, 'a')).toContain('var a: Any')
    expect(transform(app(`  const a = computed(() => toast('hi'))`), { target: 'swift' }).code).toContain(
      'PyreonToast.shared.add(',
    )
  })

  it('a bare `null` literal has no concrete type to annotate', () => {
    expect(annot(`  const a = computed(() => null)`, 'a')).toContain('var a: Any')
  })
})

describe('extractTextTypography — a NON-object ternary branch on a <Text>', () => {
  it('declines the conditional-colour lift and falls to the generic refusal', () => {
    // The Kotlin ternary path asks each branch for a literal `color`; a branch
    // that is not an object literal answers "none", so the lift declines and
    // the value reaches the generic "not lowerable" arm.
    const src = app('', `<Text style={n() > 0 ? { color: '#00aa00' } : xs()}>x</Text>`)
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.warnings.join('\n')).toContain('only a static inline-style object literal')
      expect(r.code).not.toContain('color = if (')
      expect(r.code).not.toContain('.foregroundColor(')
    }
  })

  it('the CONTRAST: two OBJECT branches with literal colours DO lift on Kotlin', () => {
    const src = app('', `<Text style={n() > 0 ? { color: '#00aa00' } : { color: '#aa0000' }}>x</Text>`)
    expect(transform(src, { target: 'kotlin' }).code).toContain('color = if (')
  })
})
