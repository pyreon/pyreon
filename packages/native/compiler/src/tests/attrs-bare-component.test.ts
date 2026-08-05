// `attrs(Text)` — a BARE component — is not a form `@pyreon/attrs` accepts, and
// the compiler no longer pretends otherwise.
//
// THIS FILE PREVIOUSLY ASSERTED THE OPPOSITE, and the reason is worth keeping.
// It was written on the belief that `attrs(component)` is "the form the library
// actually exposes ... in its own README, in CLAUDE.md, and in the multiplatform
// styling table", and it taught the parser to accept it. That belief was false:
// the runtime signature is `attrs({ name, component })`, it VALIDATES its params,
// and the bare call throws at mount —
//
//   Parameter `component` is missing in params!
//
// The README and the package manifest have always shown the options object. The
// belief came from a PROSE shorthand in the manifest's multiplatform line —
// "attrs(Base) default-prop HOC lowers via attrs-native", meaning *attrs over a
// base* — being read as a call signature, after which the docs row was written
// to match and the parser was changed to agree with the docs row.
//
// The cost was the worst shape a multi-target compiler can produce: both native
// targets emitted and compiled clean while the web app died at mount with a
// blank page. Found by the `@pyreon/attrs` device proof, whose web e2e went 0/5
// with `app-root` reported as *hidden* — an empty `#app` div has no box.
//
// WHAT THE OLD FILE WAS RIGHT ABOUT, and what is kept below: a bare-form source
// must not silently produce the verbatim `attrs(` passthrough that fails the
// native build with "cannot find 'attrs' in scope". It still produces it — that
// is what refusing means — but it is no longer SILENT, which was the actual
// defect. The source cannot run on web, so it must not appear to work on the
// other two targets; a named warning naming the fix is the deliverable.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (defn: string) => `import attrs from '@pyreon/attrs'
import { Text } from '@pyreon/primitives'
${defn}
export function C(){ return (<Label>x</Label>) }`

const BARE = app(`const Label = attrs(Text).attrs({ accessibilityLabel: 'labelled' })`)
const CONFIG = app(
  `const Label = attrs({ name: 'Label', component: Text }).attrs({ accessibilityLabel: 'labelled' })`,
)

describe('attrs() requires the options object', () => {
  it('the OPTIONS form lowers to the base primitive with its defaults', () => {
    expect(transform(CONFIG, { target: 'swift' }).code).toContain(
      'Text("x").accessibilityLabel("labelled")',
    )
  })

  it('the options form warns about nothing', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(CONFIG, { target }).warnings ?? [], target).toEqual([])
    }
  })

  // The correction. Not "the bare form lowers" but "the bare form is named".
  it('the BARE form warns, on both targets, naming the fix', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const w = transform(BARE, { target }).warnings ?? []
      const hit = w.find((x) => x.includes('attrs(Text)'))
      expect(hit, `${target}: no warning for the bare form`).toBeDefined()
      // The message must carry the CORRECTED call, not just a complaint.
      expect(hit).toContain('component: Text')
      // ...and say why, since the native build alone would not reveal it.
      expect(hit).toContain('web')
    }
  })

  // Kept from the original file: the emit consequence is real and must stay
  // visible. Refusing means the passthrough returns — the point is that it is
  // now accompanied by the warning above rather than shipping silently.
  it('the bare form does NOT silently become a working native component', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(BARE, { target })
      expect(out.code, target).toContain('attrs(')
      expect(
        (out.warnings ?? []).length,
        `${target}: passthrough must never be silent`,
      ).toBeGreaterThan(0)
    }
  })

  it.skipIf(!isSwiftcAvailable())('the options form type-checks on Swift', () => {
    const res = validateSwiftWithStubs(transform(CONFIG, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the options form type-checks on Kotlin', () => {
    const res = validateKotlin(transform(CONFIG, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  // Kept verbatim in intent: a base with no native primitive must stay loud.
  it('still warns for a NON-primitive base', () => {
    const src = `import attrs from '@pyreon/attrs'
import { Text } from '@pyreon/primitives'
const NotAPrimitive = () => null
const Label = attrs({ name: 'Label', component: NotAPrimitive }).attrs({ accessibilityLabel: 'x' })
export function C(){ return (<Text>x</Text>) }`
    const w = transform(src, { target: 'swift' }).warnings ?? []
    expect(w.some((x) => x.includes('NotAPrimitive'))).toBe(true)
  })
})
