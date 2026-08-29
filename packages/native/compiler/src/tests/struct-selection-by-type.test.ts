import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/**
 * A struct is selected by field names AND field types, not names alone.
 *
 * The emitters resolve an object literal / object type to a DECLARED struct of
 * the same shape, so a prop typed `{ id, text, done }` and the literal that
 * builds it agree on one nominal type. That resolution keyed on field NAMES
 * only, and kept the FIRST struct registered — so two declared types sharing a
 * shape collapsed into one:
 *
 *     type Px  = { x: Double; y: Double }
 *     type Idx = { x: number; y: number }
 *     const i: Idx = { x: 1, y: 2 }      // emitted Px(x: 1, y: 2)
 *
 * Silent where the field types coerce, and a hard `cannot convert value of type
 * 'Double' to expected argument type 'Int'` where they do not. It blocks any
 * geometry code, where a point, an anchor, an offset and a tick position are
 * all `{ x, y }`.
 *
 * The literal side derives its key from its OWN values (1.5 is a Double, 1 is
 * an Int) and falls back to the name-only lookup whenever a value's type is not
 * locally decidable — so this can only add a correct match, never remove one
 * that already worked. Both emitters share `structShapeKey`, so they can never
 * disagree about which struct a shape resolves to.
 */
const TWO_SHAPES = `
  type Px = { x: Double; y: Double }
  type Idx = { x: number; y: number }
  export function Probe() {
    const p: Px = { x: 1.5, y: 2.5 }
    const i: Idx = { x: 1, y: 2 }
    return <Stack><Text>{\`\${p.x}\${i.x}\`}</Text></Stack>
  }
`

describe('struct selection distinguishes shapes that differ only by field type', () => {
  for (const [target, open, close] of [
    ['swift', '(x: 1.5, y: 2.5)', '(x: 1, y: 2)'],
    ['kotlin', '(x = 1.5, y = 2.5)', '(x = 1, y = 2)'],
  ] as const) {
    describe(target, () => {
      const out = transform(TWO_SHAPES, { target }).code

      it('a float literal resolves to the Double-typed struct', () => {
        expect(out).toContain(`Px${open}`)
      })

      it('an int literal resolves to the Int-typed struct', () => {
        expect(out).toContain(`Idx${close}`)
      })

      /**
       * The load-bearing one. Before the fix BOTH literals emitted `Px`, so
       * asserting only that `Px` appears passes against the bug — the failure
       * mode is the wrong struct being constructed, which is an absence.
       */
      it('the int literal is NOT built as the Double struct', () => {
        expect(out).not.toContain(`Px${close}`)
      })

      it('both declared structs survive with their own field types', () => {
        expect(out).toMatch(/struct Px|data class Px/)
        expect(out).toMatch(/struct Idx|data class Idx/)
      })
    })
  }

  /**
   * The fallback must stay intact: a literal whose values are not locally
   * decidable (a call, an identifier) still resolves through the name-only
   * map exactly as before.
   */
  it('a non-literal field value still resolves through the name-only path', () => {
    const src = `
      type Row = { id: number; label: string }
      export function P() {
        const n = 7
        const r: Row = { id: n, label: 'x' }
        return <Stack><Text>{r.label}</Text></Stack>
      }
    `
    expect(transform(src, { target: 'swift' }).code).toContain('Row(')
  })
})
