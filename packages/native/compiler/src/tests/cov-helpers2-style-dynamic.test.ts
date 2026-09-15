// Branch matrix for `emitDynamic` — the `style={cond ? {A} : {B}}` half of
// `style-to-native.ts`, plus the two non-lowerable fall-throughs in
// `styleToNativeModifiers`.
//
// Three outcomes are possible per slot and they are NOT interchangeable:
//   (1) BOTH branches carry it       → one modifier over a native conditional;
//   (2) ONE branch carries it        → the present branch emitted STATICALLY,
//                                      plus an `asymmetric` warning naming it;
//   (3) neither carries it           → the slot is skipped entirely.
// A composite slot (border / frameConstraints / non-uniform padding) can only
// ever take (2), even when both branches have it — folding a conditional into
// a multi-argument modifier is a v1 gap, and the warning is what stops that
// being a silent half-application.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function app(style: string): string {
  return `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const on = signal(true)
  return (<Stack style={${style}}><Text>x</Text></Stack>)
}`
}

const code = (style: string, target: 'swift' | 'kotlin' = 'swift'): string =>
  transform(app(style), { target }).code
const warns = (style: string, target: 'swift' | 'kotlin' = 'swift'): string =>
  transform(app(style), { target }).warnings.join('\n')

// A branch that is NON-EMPTY but carries only a web-only no-op, so the slot is
// genuinely absent WITHOUT tripping the separate empty-object-literal
// diagnostic (which would muddy what each assertion is proving).
const NONE = `{ cursor: 'pointer' }`

describe('BOTH branches carry the slot — one modifier over a conditional', () => {
  it('uniform padding folds into a single conditional value', () => {
    expect(code(`on() ? { padding: 4 } : { padding: 8 }`)).toContain('.padding(((on) ? 4 : 8))')
    expect(code(`on() ? { padding: 4 } : { padding: 8 }`, 'kotlin')).toContain(
      '.padding((if (on) 4 else 8).dp)',
    )
  })

  it('a SLOT value (background) folds inside the modifier, not around it', () => {
    // `.background(cond ? A : B)` — one call, a conditional ARGUMENT. Wrapping
    // the whole modifier in a conditional is not expressible in either target.
    expect(code(`on() ? { background: '#ffffff' } : { background: '#000000' }`)).toContain(
      '.background(((on) ? Color(',
    )
    expect(
      code(`on() ? { background: '#ffffff' } : { background: '#000000' }`, 'kotlin'),
    ).toContain('.background((if (on) Color(0xFFFFFFFF) else Color(0xFF000000)))')
  })

  it('radius and opacity fold the same way, each in its ORDER slot', () => {
    const s = code(`on() ? { opacity: 1, borderRadius: 2 } : { opacity: 0.5, borderRadius: 4 }`)
    expect(s).toContain('.cornerRadius(((on) ? 2 : 4))')
    expect(s).toContain('.opacity(((on) ? 1 : 0.5))')
    expect(s.indexOf('.cornerRadius(')).toBeLessThan(s.indexOf('.opacity('))
  })

  it('the Kotlin float suffix rides each VALUE, not the wrap', () => {
    // `(…)f` is a syntax error in Kotlin (unlike `.dp`, an extension on the
    // result), so `f` must be inside both conditional arms.
    expect(code(`on() ? { opacity: 1 } : { opacity: 0.5 }`, 'kotlin')).toContain(
      '.alpha((if (on) 1f else 0.5f))',
    )
  })

  it('width/height fold per slot', () => {
    expect(code(`on() ? { width: 10 } : { width: 20 }`)).toContain(
      '.frame(width: ((on) ? 10 : 20))',
    )
    expect(code(`on() ? { height: 10 } : { height: 20 }`, 'kotlin')).toContain(
      '.height((if (on) 10 else 20).dp)',
    )
  })

  it('a folded slot produces NO asymmetry warning', () => {
    expect(warns(`on() ? { padding: 4 } : { padding: 8 }`)).not.toContain('differ in shape')
  })
})

describe('ONE branch carries the slot — static emit + a named warning', () => {
  it('padding present only in `then` emits the THEN value and warns', () => {
    expect(code(`on() ? { padding: 4 } : ${NONE}`)).toContain('.padding(4)')
    const w = warns(`on() ? { padding: 4 } : ${NONE}`)
    expect(w).toContain('property [padding] differ in shape or exist in only one branch')
    expect(w).toContain("the first branch's value was emitted statically")
  })

  it('a slot present only in `otherwise` still emits (from whichever branch has it)', () => {
    expect(code(`on() ? ${NONE} : { background: '#ffffff' }`)).toContain('.background(Color(')
    expect(warns(`on() ? ${NONE} : { background: '#ffffff' }`)).toContain('differ in shape')
  })

  it('a SHAPE mismatch (uniform vs per-side padding) takes the same arm', () => {
    expect(code(`on() ? { padding: 4 } : { paddingTop: 8 }`)).toContain('.padding(4)')
    expect(warns(`on() ? { padding: 4 } : { paddingTop: 8 }`)).toContain('property [padding]')
  })

  it('TWO asymmetric properties switch the warning to PLURAL grammar', () => {
    const w = warns(`on() ? { padding: 4, background: '#ffffff' } : ${NONE}`)
    expect(w).toContain('properties [padding, background]')
  })

  it('the asymmetric list is DEDUPED (a slot named once, not once per branch)', () => {
    const w = warns(`on() ? { padding: 4 } : { paddingTop: 8 }`)
    expect(w.match(/padding/g)?.length).toBeLessThan(5)
  })
})

describe('COMPOSITE slots can only ever be emitted statically (v1 gap)', () => {
  it('a border in BOTH branches still emits the THEN branch + warns', () => {
    const style = `on() ? { borderWidth: 1, borderColor: '#ff0000' } : { borderWidth: 2, borderColor: '#00ff00' }`
    expect(code(style)).toContain('lineWidth: 1')
    expect(code(style)).not.toContain('lineWidth: 2')
    expect(warns(style)).toContain('property [border] differ in shape')
  })

  it('a border in ONE branch only takes the same arm', () => {
    const style = `on() ? { borderWidth: 1, borderColor: '#ff0000' } : ${NONE}`
    expect(code(style)).toContain('lineWidth: 1')
    expect(warns(style)).toContain('[border]')
  })

  it('Kotlin composes the same static border', () => {
    const style = `on() ? { borderWidth: 1, borderColor: '#ff0000' } : { borderWidth: 2, borderColor: '#00ff00' }`
    expect(code(style, 'kotlin')).toContain('.border(BorderStroke(1.dp, Color(0xFFFF0000))')
  })

  it('frame constraints in BOTH branches emit the THEN frame + warn by group name', () => {
    const style = `on() ? { minWidth: 1 } : { minWidth: 2 }`
    expect(code(style)).toContain('.frame(minWidth: 1)')
    expect(warns(style)).toContain('property [minWidth/minHeight] differ in shape')
  })

  it('frame constraints in ONE branch only take the same arm', () => {
    expect(code(`on() ? { minHeight: 5 } : ${NONE}`, 'kotlin')).toContain('.heightIn(min = 5.dp)')
    expect(warns(`on() ? { minHeight: 5 } : ${NONE}`)).toContain('[minWidth/minHeight]')
  })

  it('NEITHER branch has a border / frame → the slot is skipped silently', () => {
    const w = warns(`on() ? { padding: 4 } : { padding: 8 }`)
    expect(w).not.toContain('[border]')
    expect(w).not.toContain('[minWidth/minHeight]')
  })
})

describe('per-branch WARNINGS are collected from BOTH branches', () => {
  it('an unknown property in the `otherwise` branch is still reported', () => {
    expect(warns(`on() ? { padding: 4 } : { zIndex: 3 }`)).toContain('[zIndex]')
  })

  it('an unparseable value in either branch is reported', () => {
    expect(warns(`on() ? { background: 'red' } : { background: '#000000' }`)).toContain(
      '[background] could not be parsed',
    )
  })

  it('a margin in either branch gets the shared margin diagnostic', () => {
    expect(warns(`on() ? { margin: 4 } : { padding: 8 }`)).toContain(
      'CSS `margin` has no native equivalent',
    )
  })
})

describe('the non-lowerable fall-throughs', () => {
  it('a ternary whose THEN branch is not an object literal is not a dynamic style', () => {
    const w = warns(`on() ? someStyle : { padding: 4 }`)
    expect(w).toContain('only a static inline-style object literal')
    expect(w).toContain('Reactive style beyond a two-literal ternary is a tracked follow-up')
  })

  it('a ternary whose OTHERWISE branch is not an object literal takes the same arm', () => {
    expect(warns(`on() ? { padding: 4 } : someStyle`)).toContain(
      'only a static inline-style object literal',
    )
  })

  it('a BARE identifier style value takes it too, and emits no modifiers', () => {
    expect(warns(`someStyle`)).toContain('only a static inline-style object literal')
    expect(code(`someStyle`)).not.toContain('.padding(')
  })

  it('Kotlin produces the identical fall-through diagnostic', () => {
    expect(warns(`someStyle`, 'kotlin')).toContain('only a static inline-style object literal')
  })
})
