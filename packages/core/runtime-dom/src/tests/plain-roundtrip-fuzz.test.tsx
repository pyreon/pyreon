/**
 * Round-trip fuzz oracle: CLASSIC program → `migrateToPlain` codemod →
 * plain compile → behavioral diff against the DIRECT classic compile.
 *
 * The codemod (classic → plain) and the compiler (plain → classic
 * primitives) form a loop — so they verify each other. A seeded grammar
 * generates classic programs (signals, computeds over ternaries/arith,
 * effects, mutators via .set/.update, JSX text/attr/ternary children); each
 * seed is codemodded, BOTH dialects are compiled through the real
 * `transformJSX`, mounted, and driven through every mutator with the DOM
 * compared at each step. A divergence indicts exactly one of two components.
 *
 * Seed count: PYREON_FUZZ_SEEDS (default 40). Failures print the seed, the
 * classic source, and the migrated source for direct reproduction.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { migrateToPlain } from '@pyreon/compiler'
import { compilePlainModule, mountComponent } from './plain-harness'

afterEach(() => {
  document.body.innerHTML = ''
})

// Deterministic PRNG (mulberry32) — Date.now()/Math.random() would make a
// failing seed unreproducible.
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1))

interface Program {
  classic: string
  mutators: string[]
}

/** Generate a CLASSIC program: signals, computeds, mutators, a View. */
function generate(seed: number): Program {
  const r = rng(seed)
  const nSignals = int(r, 1, 3)
  const signals = Array.from({ length: nSignals }, (_, i) => `s${i}`)
  const decls: string[] = []
  for (const s of signals) decls.push(`const ${s} = signal(${int(r, 0, 9)})`)

  const nComputed = int(r, 0, 2)
  const computeds: string[] = []
  for (let i = 0; i < nComputed; i++) {
    const a = pick(r, signals)
    const b = pick(r, signals)
    const body = pick(r, [
      `${a}() + ${b}()`,
      `${a}() * 2`,
      `${a}() > 3 ? ${b}() + 10 : ${b}() - 1`,
      `${a}() % 2 === 0 ? 'even' : 'odd'`,
    ])
    computeds.push(`c${i}`)
    decls.push(`const c${i} = computed(() => ${body})`)
  }

  const mutators: string[] = []
  let m = 0
  for (const s of signals) {
    const forms = [
      `export const m${m} = () => { ${s}.set(${s}() + ${int(r, 1, 3)}) }`,
      `export const m${m} = () => { ${s}.set(${int(r, 0, 9)}) }`,
      `export const m${m} = () => { ${s}.update((v) => v * 2 + 1) }`,
    ]
    decls.push(pick(r, forms))
    mutators.push(`m${m}`)
    m++
  }

  const readables = [...signals.map((s) => `${s}()`), ...computeds.map((c) => `${c}()`)]
  const children: string[] = []
  const nChildren = int(r, 1, 3)
  for (let i = 0; i < nChildren; i++) {
    const v = pick(r, readables)
    children.push(
      pick(r, [
        `{${v}}`,
        `<span>{${v}}</span>`,
        `{${v} > 2 ? 'hi' : 'lo'}`,
        `<b data-v={${v}}>x</b>`,
      ]),
    )
  }
  const title = pick(r, readables)
  const view = `export function View() {\n  return <div title={${title}}>${children.join('|')}</div>\n}`

  const effectPart =
    r() > 0.5 ? `effect(() => { void (${pick(r, readables)}) })\n` : ''

  const classic = `import { computed, effect, signal } from '@pyreon/reactivity'
${decls.join('\n')}
${effectPart}${view}
`
  return { classic, mutators }
}

const SEEDS = Math.max(1, Number((process.env as Record<string, string | undefined>).PYREON_FUZZ_SEEDS) || 40)

describe(`plain round-trip fuzz (${SEEDS} seeds)`, () => {
  it('codemodded programs behave byte-identically to their classic originals', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { classic, mutators } = generate(seed)
      const migrated = migrateToPlain(classic, `fuzz-${seed}.tsx`)
      // The grammar emits only convertible shapes — a decline is itself a bug.
      expect(migrated.declined, `seed ${seed} declined\n${classic}`).toEqual([])
      expect(migrated.code, `seed ${seed} did not convert\n${classic}`).not.toBeNull()

      type Mod = { View: unknown } & Record<string, () => void>
      const classicMod = compilePlainModule<Mod>(classic, ['View', ...mutators])
      const plainMod = compilePlainModule<Mod>(migrated.code!, ['View', ...mutators])

      const a = mountComponent(classicMod.exports.View)
      const b = mountComponent(plainMod.exports.View)
      const ctx = `seed ${seed}\n--- classic:\n${classic}\n--- migrated:\n${migrated.code}`
      expect(b.container.innerHTML, `initial render diverged: ${ctx}`).toBe(a.container.innerHTML)
      for (const name of mutators) {
        classicMod.exports[name]!()
        plainMod.exports[name]!()
        expect(b.container.innerHTML, `after ${name}(): ${ctx}`).toBe(a.container.innerHTML)
      }
      a.cleanup()
      b.cleanup()
    }
  })
})
