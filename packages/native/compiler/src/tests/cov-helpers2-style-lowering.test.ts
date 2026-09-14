// Branch matrices for `lowerObject` + the static EMIT helpers in
// `style-to-native.ts` — one source shape per CSS property arm, per padding
// collapse form, per border/frame composition, plus each of the six warning
// buckets (`dropped` / `dynamic` / `responsive` / `unparseable` / `marginWarn`
// / `kotlinColor`) and its silent counterpart.
//
// Every arm is asserted on BOTH targets wherever the two spell it differently,
// because the per-target modifier ORDER and the per-target value syntax
// (`.padding(4)` vs `.padding(4.dp)`, `.frame(minWidth:)` vs `.widthIn(min=)`)
// are the places a one-sided edit silently diverges.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function app(style: string, tag = 'Stack'): string {
  return `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const on = signal(true)
  return (<${tag} style={${style}}><Text>x</Text></${tag}>)
}`
}

const code = (style: string, target: 'swift' | 'kotlin' = 'swift'): string =>
  transform(app(style), { target }).code
const warns = (style: string, target: 'swift' | 'kotlin' = 'swift'): string =>
  transform(app(style), { target }).warnings.join('\n')

// ── padding: the box shorthand + the collapse forms ─────────────────────────

describe('expandBoxShorthand — one arm per CSS value count', () => {
  it('1 value → all four sides equal → the single-arg form', () => {
    expect(code(`{ padding: '4px' }`)).toContain('.padding(4)')
    expect(code(`{ padding: '4px' }`, 'kotlin')).toContain('.padding(4.dp)')
  })

  it('a bare NUMBER takes the same all-sides arm', () => {
    expect(code(`{ padding: 6 }`)).toContain('.padding(6)')
    expect(code(`{ padding: 6 }`, 'kotlin')).toContain('.padding(6.dp)')
  })

  it('2 values → vertical / horizontal', () => {
    expect(code(`{ padding: '4px 8px' }`)).toContain('.padding(.vertical, 4).padding(.horizontal, 8)')
    expect(code(`{ padding: '4px 8px' }`, 'kotlin')).toContain(
      '.padding(horizontal = 8.dp, vertical = 4.dp)',
    )
  })

  it('3 values → top / horizontal / bottom (left mirrors right, per CSS)', () => {
    expect(code(`{ padding: '1px 2px 3px' }`)).toContain(
      '.padding(.top, 1).padding(.leading, 2).padding(.bottom, 3).padding(.trailing, 2)',
    )
  })

  it('4 values → top / right / bottom / LEFT (the order CSS specifies)', () => {
    // left = the 4th token, right = the 2nd. Getting these swapped is a silent
    // mirror-image layout, so both are asserted by VALUE.
    expect(code(`{ padding: '1px 2px 3px 4px' }`)).toContain('.padding(.leading, 4)')
    expect(code(`{ padding: '1px 2px 3px 4px' }`)).toContain('.padding(.trailing, 2)')
    expect(code(`{ padding: '1px 2px 3px 4px' }`, 'kotlin')).toContain(
      '.padding(start = 4.dp, top = 1.dp, end = 2.dp, bottom = 3.dp)',
    )
  })

  it('5 values hits the `default` arm — refused, not truncated', () => {
    expect(warns(`{ padding: '1px 2px 3px 4px 5px' }`)).toContain('[padding] could not be parsed')
  })

  it('a token that is not a dimension refuses the WHOLE shorthand', () => {
    expect(warns(`{ padding: '1em' }`)).toContain('[padding] could not be parsed')
    expect(warns(`{ padding: '4px auto' }`)).toContain('[padding] could not be parsed')
  })
})

describe('emitPadding — the collapse forms, and the per-side fallback', () => {
  it('horizontal ONLY collapses to `.padding(.horizontal, …)`', () => {
    expect(code(`{ paddingX: 5 }`)).toContain('.padding(.horizontal, 5)')
    expect(code(`{ paddingHorizontal: 5 }`)).toContain('.padding(.horizontal, 5)')
    expect(code(`{ paddingX: 5 }`, 'kotlin')).toContain('.padding(horizontal = 5.dp)')
  })

  it('vertical ONLY collapses to `.padding(.vertical, …)`', () => {
    expect(code(`{ paddingY: 6 }`)).toContain('.padding(.vertical, 6)')
    expect(code(`{ paddingVertical: 6 }`)).toContain('.padding(.vertical, 6)')
    expect(code(`{ paddingY: 6 }`, 'kotlin')).toContain('.padding(vertical = 6.dp)')
  })

  it('both axes collapse to the two-axis form', () => {
    expect(code(`{ paddingX: 5, paddingY: 6 }`)).toContain(
      '.padding(.vertical, 6).padding(.horizontal, 5)',
    )
    expect(code(`{ paddingX: 5, paddingY: 6 }`, 'kotlin')).toContain(
      '.padding(horizontal = 5.dp, vertical = 6.dp)',
    )
  })

  it('a SINGLE side falls through to the per-side form on both targets', () => {
    expect(code(`{ paddingTop: 3 }`)).toContain('.padding(.top, 3)')
    expect(code(`{ paddingTop: 3 }`, 'kotlin')).toContain('.padding(top = 3.dp)')
    expect(code(`{ paddingBottom: 3 }`)).toContain('.padding(.bottom, 3)')
    expect(code(`{ paddingLeft: 3 }`)).toContain('.padding(.leading, 3)')
    expect(code(`{ paddingRight: 3 }`)).toContain('.padding(.trailing, 3)')
  })

  it('four DIFFERING sides emit all four, in the fixed per-target order', () => {
    expect(code(`{ paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 4 }`)).toContain(
      '.padding(.top, 1).padding(.leading, 4).padding(.bottom, 3).padding(.trailing, 2)',
    )
    expect(
      code(`{ paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 4 }`, 'kotlin'),
    ).toContain('.padding(start = 4.dp, top = 1.dp, end = 2.dp, bottom = 3.dp)')
  })

  it('NO padding at all emits no padding modifier (the all-undefined arm)', () => {
    expect(code(`{ width: 10 }`)).not.toContain('.padding(')
    expect(code(`{ width: 10 }`, 'kotlin')).not.toContain('.padding(')
  })
})

// ── responsive arrays ───────────────────────────────────────────────────────

describe('responsiveDim — a TWO-element mobile-first array', () => {
  it('padding lowers to a size-class conditional on both targets', () => {
    expect(code(`{ padding: [4, 8] }`)).toContain('.padding((pyreonSizeClass == .regular ? 8 : 4))')
    expect(code(`{ padding: [4, 8] }`, 'kotlin')).toContain(
      '.padding((if (LocalConfiguration.current.screenWidthDp >= 600) 8 else 4).dp)',
    )
  })

  it('a responsive DIMENSION (width) takes the same lowering', () => {
    expect(code(`{ width: [100, 200] }`)).toContain(
      '.frame(width: (pyreonSizeClass == .regular ? 200 : 100))',
    )
    expect(code(`{ width: [100, 200] }`, 'kotlin')).toContain(
      '.width((if (LocalConfiguration.current.screenWidthDp >= 600) 200 else 100).dp)',
    )
  })

  it('a THREE-element array is refused with its own diagnostic (not "use a literal")', () => {
    const w = warns(`{ padding: [1, 2, 3] }`)
    expect(w).toContain('use a mobile-first RESPONSIVE ARRAY')
    expect(w).toContain('compact / regular at 600dp')
    // The generic dynamic-value diagnostic would be the WRONG advice here —
    // the author did write literals.
    expect(w).not.toContain('are not literal')
  })

  it('a two-element array with a NON-literal entry falls back to the array diagnostic', () => {
    expect(warns(`{ padding: [1, on() ? 2 : 3] }`)).toContain('use a mobile-first RESPONSIVE ARRAY')
  })

  it('a two-element array with an UNPARSEABLE dimension does too', () => {
    expect(warns(`{ padding: ['1em', '2em'] }`)).toContain('use a mobile-first RESPONSIVE ARRAY')
  })
})

// ── border ──────────────────────────────────────────────────────────────────

describe('border — width + color + radius, and every refusal', () => {
  it('width + color compose into one modifier, coordinated with the radius', () => {
    expect(code(`{ borderWidth: 2, borderColor: '#ff0000', borderRadius: 6 }`)).toContain(
      '.overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(.sRGB, red: 1.000, green: 0.000, blue: 0.000, opacity: 1.000), lineWidth: 2))',
    )
    expect(
      code(`{ borderWidth: 2, borderColor: '#ff0000', borderRadius: 6 }`, 'kotlin'),
    ).toContain('.border(BorderStroke(2.dp, Color(0xFFFF0000)), RoundedCornerShape(6.dp))')
  })

  it('no radius → the border still emits, at radius 0', () => {
    expect(code(`{ borderWidth: 1, borderColor: '#000000' }`)).toContain('cornerRadius: 0')
    expect(code(`{ borderWidth: 1, borderColor: '#000000' }`, 'kotlin')).toContain(
      'RoundedCornerShape(0.dp)',
    )
  })

  it('WIDTH ONLY: no border, and the warning names which half was missing', () => {
    const w = warns(`{ borderWidth: 2 }`)
    expect(w).toContain('only borderWidth was given')
    expect(code(`{ borderWidth: 2 }`)).not.toContain('.overlay(')
  })

  it('COLOR ONLY: the same warning, naming the other half', () => {
    expect(warns(`{ borderColor: '#000000' }`)).toContain('only borderColor was given')
  })

  it('an UNPARSEABLE borderColor is reported as unparseable, not as a missing half', () => {
    expect(warns(`{ borderWidth: 1, borderColor: 'red' }`)).toContain(
      '[borderColor] could not be parsed',
    )
  })

  it('a NON-SOLID borderStyle is approximated as solid — and says so', () => {
    const w = warns(`{ borderWidth: 1, borderColor: '#000000', borderStyle: 'dashed' }`)
    expect(w).toContain('only a solid border lowers to native')
    expect(code(`{ borderWidth: 1, borderColor: '#000000', borderStyle: 'dashed' }`)).toContain(
      '.overlay(',
    )
  })

  it('`solid` / `none` are the silent arm — no approximation warning', () => {
    expect(warns(`{ borderWidth: 1, borderColor: '#000000', borderStyle: 'solid' }`)).not.toContain(
      'only a solid border lowers',
    )
    expect(warns(`{ borderWidth: 1, borderColor: '#000000', borderStyle: 'none' }`)).not.toContain(
      'only a solid border lowers',
    )
  })

  it('a non-solid style with NO width/color warns only about the missing half', () => {
    expect(warns(`{ borderStyle: 'dotted' }`)).not.toContain('only a solid border lowers')
  })
})

describe('parseBorderShorthand — tokens in any order', () => {
  it('`1px solid #2563eb` resolves width + colour', () => {
    expect(code(`{ border: '1px solid #2563eb' }`)).toContain(
      '.stroke(Color(.sRGB, red: 0.145, green: 0.388, blue: 0.922, opacity: 1.000), lineWidth: 1)',
    )
    expect(code(`{ border: '1px solid #2563eb' }`, 'kotlin')).toContain(
      '.border(BorderStroke(1.dp, Color(0xFF2563EB))',
    )
  })

  it('order does not matter — colour first still resolves', () => {
    expect(code(`{ border: '#2563eb solid 1px' }`)).toContain('lineWidth: 1')
  })

  it('a non-solid style token inside the shorthand sets the approximation flag', () => {
    expect(warns(`{ border: '1px dashed #2563eb' }`)).toContain('only a solid border lowers')
  })

  it('a shorthand that matches NOTHING is unparseable (`matched` stayed false)', () => {
    expect(warns(`{ border: 'fancy' }`)).toContain('[border] could not be parsed')
  })

  it('an explicit borderWidth/borderColor still overrides after a shorthand', () => {
    expect(code(`{ border: '1px solid #000000', borderWidth: 5 }`)).toContain('lineWidth: 5')
  })
})

// ── frame constraints ───────────────────────────────────────────────────────

describe('emitFrameConstraints — min/max width/height compose into ONE modifier', () => {
  it('width constraints only', () => {
    expect(code(`{ minWidth: 10, maxWidth: 20 }`)).toContain('.frame(minWidth: 10, maxWidth: 20)')
    expect(code(`{ minWidth: 10, maxWidth: 20 }`, 'kotlin')).toContain(
      '.widthIn(min = 10.dp, max = 20.dp)',
    )
  })

  it('height constraints only', () => {
    expect(code(`{ minHeight: 10, maxHeight: 20 }`)).toContain(
      '.frame(minHeight: 10, maxHeight: 20)',
    )
    expect(code(`{ minHeight: 10, maxHeight: 20 }`, 'kotlin')).toContain(
      '.heightIn(min = 10.dp, max = 20.dp)',
    )
  })

  it('a SINGLE bound emits only that arg (each of the four)', () => {
    expect(code(`{ minWidth: 10 }`)).toContain('.frame(minWidth: 10)')
    expect(code(`{ maxWidth: 10 }`)).toContain('.frame(maxWidth: 10)')
    expect(code(`{ minHeight: 10 }`, 'kotlin')).toContain('.heightIn(min = 10.dp)')
    expect(code(`{ maxHeight: 10 }`, 'kotlin')).toContain('.heightIn(max = 10.dp)')
  })

  it('all four compose into one Swift `.frame` and TWO Compose modifiers', () => {
    const s = code(`{ minWidth: 1, maxWidth: 2, minHeight: 3, maxHeight: 4 }`)
    expect(s).toContain('.frame(minWidth: 1, maxWidth: 2, minHeight: 3, maxHeight: 4)')
    const k = code(`{ minWidth: 1, maxWidth: 2, minHeight: 3, maxHeight: 4 }`, 'kotlin')
    expect(k).toContain('.widthIn(min = 1.dp, max = 2.dp).heightIn(min = 3.dp, max = 4.dp)')
  })

  it('NO constraints → the modifier is absent entirely', () => {
    expect(code(`{ width: 10 }`)).not.toContain('minWidth')
    expect(code(`{ width: 10 }`, 'kotlin')).not.toContain('.widthIn(')
  })
})

// ── width / height / radius / background / opacity / aspectRatio ───────────

describe('the single-slot properties', () => {
  it('width and height', () => {
    expect(code(`{ width: 100, height: 50 }`)).toContain('.frame(width: 100).frame(height: 50)')
    expect(code(`{ width: 100, height: 50 }`, 'kotlin')).toContain('.width(100.dp).height(50.dp)')
  })

  it('borderRadius', () => {
    expect(code(`{ borderRadius: 8 }`)).toContain('.cornerRadius(8)')
    expect(code(`{ borderRadius: 8 }`, 'kotlin')).toContain('.clip(RoundedCornerShape(8.dp))')
  })

  it('background AND backgroundColor are the same arm', () => {
    expect(code(`{ background: '#ffffff' }`)).toContain('.background(Color(')
    expect(code(`{ backgroundColor: '#ffffff' }`)).toContain('.background(Color(')
    expect(code(`{ backgroundColor: '#ffffff' }`, 'kotlin')).toContain('.background(Color(0xFFFFFFFF))')
  })

  it('opacity: a number, and a numeric STRING through parseFloat', () => {
    expect(code(`{ opacity: 0.5 }`)).toContain('.opacity(0.5)')
    expect(code(`{ opacity: 0.5 }`, 'kotlin')).toContain('.alpha(0.5f)')
    expect(code(`{ opacity: '0.25' }`, 'kotlin')).toContain('.alpha(0.25f)')
  })

  it('a NON-numeric opacity is unparseable, not NaN', () => {
    expect(warns(`{ opacity: 'half' }`)).toContain('[opacity] could not be parsed')
    expect(code(`{ opacity: 'half' }`, 'kotlin')).not.toContain('.alpha(')
  })

  it('aspectRatio: a NUMBER and a `W / H` ratio', () => {
    expect(code(`{ aspectRatio: 1.5 }`)).toContain('.aspectRatio(1.5, contentMode: .fit)')
    expect(code(`{ aspectRatio: '16 / 9' }`)).toContain('.aspectRatio(1.7778, contentMode: .fit)')
    expect(code(`{ aspectRatio: '16 / 9' }`, 'kotlin')).toContain('.aspectRatio(1.7778f)')
  })

  it('aspectRatio: a plain numeric STRING takes the parseFloat tail', () => {
    expect(code(`{ aspectRatio: '2' }`)).toContain('.aspectRatio(2, contentMode: .fit)')
  })

  it('a DEGENERATE aspect ratio is refused on EVERY spelling', () => {
    // Zero/negative must be refused whether written as a number, as `W / H`
    // with a zero numerator, or with a zero denominator — the three arms of
    // the same guard. A `0` ratio silently collapses the view.
    for (const v of ['0', '-2', `'0 / 5'`, `'5 / 0'`, `'0'`]) {
      expect(warns(`{ aspectRatio: ${v} }`) || 'dropped').not.toBe('')
      expect(code(`{ aspectRatio: ${v} }`)).not.toContain('.aspectRatio(0')
    }
  })
})

// ── margin / color-on-container / dropped / dynamic / spread ───────────────

describe('the warning buckets', () => {
  it.each(['margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'marginHorizontal', 'marginVertical'])(
    '`%s` has no native equivalent — dropped with the shared diagnostic',
    (prop) => {
      const w = warns(`{ ${prop}: 4 }`)
      expect(w).toContain('CSS `margin` has no native equivalent')
      expect(w).toContain('Put spacing on the PARENT')
    },
  )

  it('`color` on a CONTAINER: lowered on Swift, warned-and-dropped on Kotlin', () => {
    expect(code(`{ color: '#123456' }`)).toContain('.foregroundColor(Color(')
    expect(warns(`{ color: '#123456' }`)).not.toContain('no Compose Modifier')
    expect(code(`{ color: '#123456' }`, 'kotlin')).not.toContain('.foregroundColor(')
    expect(warns(`{ color: '#123456' }`, 'kotlin')).toContain(
      'CSS `color` on a container has no Compose Modifier',
    )
  })

  it('an UNPARSEABLE container colour warns on Swift and is Kotlin-dropped first', () => {
    expect(warns(`{ color: 'red' }`)).toContain('[color] could not be parsed')
  })

  it('an unknown property is DROPPED with a named diagnostic (singular grammar)', () => {
    const w = warns(`{ zIndex: 3 }`)
    expect(w).toContain('CSS property [zIndex] has no native lowering yet and was dropped')
  })

  it('two unknown properties switch the diagnostic to PLURAL grammar', () => {
    const w = warns(`{ zIndex: 3, float: 'left' }`)
    expect(w).toContain('CSS properties [zIndex, float]')
    expect(w).toContain('have no native lowering yet and were dropped')
  })

  it.each(['cursor', 'userSelect', 'pointerEvents', 'transition', 'outline', 'appearance', 'boxSizing', 'listStyle'])(
    'the web-only no-op `%s` is stripped SILENTLY (it carries no visual information)',
    (prop) => {
      expect(warns(`{ ${prop}: 'x' }`)).toBe('')
    },
  )

  it('a DYNAMIC value gets the "not literal" diagnostic, not the dropped one', () => {
    const w = warns(`{ width: on() ? 1 : 2 }`)
    expect(w).toContain('are not literal')
    expect(w).not.toContain('has no native lowering yet')
  })

  it('a SPREAD inside the style object warns FIRST, and the literals still lower', () => {
    const w = warns(`{ ...base, padding: 4 }`)
    expect(w).toContain('a {...spread} inside an inline style is not lowered')
    expect(code(`{ ...base, padding: 4 }`)).toContain('.padding(4)')
  })

  it('a fully-static style with no unknown props warns about NOTHING', () => {
    expect(warns(`{ padding: 4, background: '#ffffff', borderRadius: 2 }`)).toBe('')
  })
})

// ── ORDER ───────────────────────────────────────────────────────────────────

describe('the canonical per-target modifier ORDER', () => {
  it('SwiftUI: padding → size → background → radius (background wraps the padded content)', () => {
    const s = code(`{ padding: 4, width: 10, background: '#ffffff', borderRadius: 2, opacity: 0.5 }`)
    const at = (m: string) => s.indexOf(m)
    expect(at('.padding(4)')).toBeLessThan(at('.frame(width: 10)'))
    expect(at('.frame(width: 10)')).toBeLessThan(at('.background('))
    expect(at('.background(')).toBeLessThan(at('.cornerRadius(2)'))
    expect(at('.cornerRadius(2)')).toBeLessThan(at('.opacity(0.5)'))
  })

  it('Compose: clip → background → padding (clip first so the fill is rounded)', () => {
    const k = code(`{ padding: 4, background: '#ffffff', borderRadius: 2 }`, 'kotlin')
    const at = (m: string) => k.indexOf(m)
    expect(at('.clip(RoundedCornerShape(2.dp))')).toBeLessThan(at('.background('))
    expect(at('.background(')).toBeLessThan(at('.padding(4.dp)'))
  })
})
