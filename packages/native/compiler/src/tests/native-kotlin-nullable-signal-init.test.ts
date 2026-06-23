// Kotlin nullable-signal init type annotation (correctness widening).
//
// `signal<T | null>(null)` emitted `var x by remember { mutableStateOf(null) }`
// with NO type param — Kotlin then infers `MutableState<Nothing?>`, which
// poisons every downstream use: assigning a real `T` fails ("type mismatch:
// T vs Nothing?"), and a `derivedStateOf { x?.field }` fails with "cannot
// infer type for T". The declared type already resolves to a nullable `T?`
// via `kotlinType`/`kotlinUnionType`; emit it explicitly:
//
//   signal<Box | null>(null)  → var x by remember { mutableStateOf<Box?>(null) }
//   signal<string | null>(null) → mutableStateOf<String?>(null)
//
// Swift needs NO equivalent — it already emits `@State var x: Box? = nil`.
//
// Verification rungs (honest):
//  - Kotlin: full `kotlinc` semantic typecheck — a fixture that ASSIGNS a
//    real `Box` (and `null`) to the nullable signal, which only typechecks
//    when the signal is `MutableState<Box?>` (the bug's `Nothing?` rejects
//    the `Box` assignment).
//  - emit-shape: the explicit `<T?>` type param is present (not bare
//    `mutableStateOf(null)`).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
type Box = { name: string }
function App() {
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('Kotlin nullable-signal init type annotation', () => {
  it('emits an explicit nullable type param for a data-class | null signal', () => {
    const out = transform(app(`  const a = signal<Box | null>(null)`), {
      target: 'kotlin',
    }).code
    expect(out).toContain('mutableStateOf<Box?>(null)')
    expect(out).not.toContain('mutableStateOf(null)')
  })

  it('emits the param for primitive | null signals too', () => {
    const out = transform(
      app(`  const s = signal<string | null>(null)
  const n = signal<number | null>(null)`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('mutableStateOf<String?>(null)')
    expect(out).toContain('mutableStateOf<Int?>(null)')
  })

  it('leaves a non-null initial unchanged (no spurious type param)', () => {
    const out = transform(app(`  const k = signal<number>(0)`), { target: 'kotlin' }).code
    expect(out).toContain('mutableStateOf(0)')
  })

  it('Swift is unaffected — already emits the optional type', () => {
    const out = transform(app(`  const a = signal<Box | null>(null)`), {
      target: 'swift',
    }).code
    expect(out).toContain('Box? = nil')
  })

  it.skipIf(!isKotlincAvailable())(
    'Kotlin: a nullable signal assigned a real value typechecks via kotlinc',
    () => {
      // `setIt(v: Box) { a = v }` + `clearIt() { a = null }` require `a` to be
      // `MutableState<Box?>` — the bug's `Nothing?` rejects the `Box`
      // assignment, so this fixture is the discriminator.
      const out = transform(
        app(`  const a = signal<Box | null>(null)
  const setIt = (v: Box) => a.set(v)
  const clearIt = () => a.set(null)`),
        { target: 'kotlin' },
      ).code
      expect(out).toContain('mutableStateOf<Box?>(null)')
      const res = validateKotlin(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )
})
