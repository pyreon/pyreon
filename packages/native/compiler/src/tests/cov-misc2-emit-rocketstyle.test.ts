// Branch matrix for `emit-rocketstyle.ts` (the dimension-matrix ViewModifier /
// Modifier emitter) and `style-fidelity.ts` (the cross-target resolution
// contract built on top of it).
//
// The IR here is built by the REAL `parseRocketstyle` frontend wherever the
// shape can be authored in source, so the emitted strings are asserted against
// what a user's chain actually produces.

import { describe, expect, it } from 'vitest'
import {
  emitKotlinRocketstyleModifier,
  emitSwiftRocketstyleModifier,
  type RocketstyleIR,
} from '../emit-rocketstyle'
import { parseRocketstyle } from '../parse-rocketstyle'
import { checkStyleFidelity } from '../style-fidelity'

/** Parse a rocketstyle chain and return its single IR — the honest route in. */
function irFrom(chain: string, name = 'Btn'): RocketstyleIR {
  const { rocketstyles } = parseRocketstyle(`const ${name} = ${chain}`)
  const ir = rocketstyles[0]
  if (!ir) throw new Error(`no rocketstyle parsed from: ${chain}`)
  return ir
}

describe('emit-rocketstyle — per-property chain entries and accessor types', () => {
  const ALL_PROPS = irFrom(`el.states((t) => ({
    primary: {
      background: 'red',
      backgroundColor: t.color.primary,
      color: '#fff',
      padding: 8,
      borderRadius: 4,
      cornerRadius: 6,
      fontSize: 14,
      opacity: 0.5,
      letterSpacing: 2,
    },
  }))`)

  it('maps every recognised CSS property to its SwiftUI chain entry + accessor type', () => {
    const out = emitSwiftRocketstyleModifier(ALL_PROPS)
    expect(out).toContain('.background(stateBackground)')
    expect(out).toContain('.background(stateBackgroundColor)')
    expect(out).toContain('.foregroundColor(stateColor)')
    expect(out).toContain('.padding(statePadding)')
    expect(out).toContain('.cornerRadius(stateBorderRadius)')
    expect(out).toContain('.cornerRadius(stateCornerRadius)')
    expect(out).toContain('.font(.system(size: stateFontSize))')
    expect(out).toContain('.opacity(stateOpacity)')
    // Colour-ish → Color; length-ish → CGFloat; opacity → Double; unknown → Any.
    expect(out).toContain('private var stateBackground: Color {')
    expect(out).toContain('private var stateColor: Color {')
    expect(out).toContain('private var statePadding: CGFloat {')
    expect(out).toContain('private var stateFontSize: CGFloat {')
    expect(out).toContain('private var stateOpacity: Double {')
    expect(out).toContain('private var stateLetterSpacing: Any {')
  })

  it('emits NO chain entry for a property SwiftUI has no mapping for', () => {
    const out = emitSwiftRocketstyleModifier(ALL_PROPS)
    expect(out).not.toContain('(stateLetterSpacing)')
  })

  it('maps the Kotlin chain entries, routing `color` to a comment and dropping unmapped props', () => {
    const out = emitKotlinRocketstyleModifier(ALL_PROPS)
    expect(out).toContain('.background(stateBackground)')
    expect(out).toContain('.padding(statePadding)')
    expect(out).toContain('.clip(RoundedCornerShape(stateBorderRadius))')
    expect(out).toContain('.alpha(stateOpacity)')
    // Compose applies a foreground colour on the Composable, not the Modifier.
    expect(out).toContain('// color: stateColor (apply on Text/Composable, not Modifier)')
    // `font-size` and `letter-spacing` have no Modifier form at all.
    expect(out).not.toContain('(stateFontSize)')
    expect(out).not.toContain('(stateLetterSpacing)')
    // …but their `val` bindings are still emitted.
    expect(out).toContain('val stateFontSize = when (state) {')
  })

  it('renders every StyleValue kind identically on both targets', () => {
    const ir = irFrom(`el.states((t) => ({
      primary: { color: '#fff', padding: 8, background: t.color.primary },
    }))`)
    for (const out of [emitSwiftRocketstyleModifier(ir), emitKotlinRocketstyleModifier(ir)]) {
      expect(out).toContain('"#fff"')
      expect(out).toContain('PyreonTokens.Color.primary')
    }
    expect(emitKotlinRocketstyleModifier(ir)).toContain('-> 8')
    expect(emitSwiftRocketstyleModifier(ir)).toContain('case .primary: return 8')
  })

  it('emits one enum per dimension and one parameter per dimension', () => {
    const ir = irFrom(`el
      .states((t) => ({ primary: { color: 'red' }, danger: { color: 'blue' } }))
      .sizes((t) => ({ small: { padding: 4 } }))`)
    const swift = emitSwiftRocketstyleModifier(ir)
    expect(swift).toContain('enum BtnState: String {\n  case primary, danger\n}')
    expect(swift).toContain('enum BtnSize: String {\n  case small\n}')
    expect(swift).toContain('  let state: BtnState')
    expect(swift).toContain('  let size: BtnSize')
    const kotlin = emitKotlinRocketstyleModifier(ir)
    expect(kotlin).toContain('enum class BtnState { primary, danger }')
    expect(kotlin).toContain('fun btnModifier(state: BtnState, size: BtnSize): Modifier {')
  })
})

// ─── The omitted-sibling-property shape ──────────────────────────────

const OMITS_SIBLING = irFrom(`el.states((t) => ({
  primary: { backgroundColor: t.color.primary },
  ghost: { opacity: 0.5 },
}))`)

describe('emit-rocketstyle — a dimension value that omits a sibling property', () => {
  it('emits a placeholder arm for the value that does not declare the property', () => {
    // This is the CURRENT emit. It is asserted so the shape is visible, not
    // because it is correct — see the KNOWN BUG locks below.
    expect(emitSwiftRocketstyleModifier(OMITS_SIBLING)).toContain(
      'case .ghost: return /* missing */ nil',
    )
    expect(emitKotlinRocketstyleModifier(OMITS_SIBLING)).toContain(
      'BtnState.ghost -> /* missing */ null',
    )
  })

  it.fails(
    'KNOWN BUG: a value omitting a sibling property emits `return /* missing */ nil` into a ' +
      'NON-optional Swift accessor (`private var stateBackgroundColor: Color`), which cannot compile ' +
      "— emit-rocketstyle.ts emitSwiftRocketstyleModifier's `matched ? swiftValue(…) : '/* missing */ nil'` " +
      'must instead make the accessor optional (`Color?` + a `.background(acc ?? .clear)`-style chain) ' +
      'or skip the whole accessor when any value omits the property',
    () => {
      const swift = emitSwiftRocketstyleModifier(OMITS_SIBLING)
      const typed = /private var stateBackgroundColor: (\S+) \{/.exec(swift)?.[1]
      expect(swift.includes('/* missing */ nil') && typed?.endsWith('?') !== true).toBe(false)
    },
  )

  it.fails(
    'KNOWN BUG: the Kotlin twin emits `-> /* missing */ null` into a `when` whose other arms are ' +
      'non-null, so the inferred type becomes nullable and `.background(stateBackgroundColor)` stops ' +
      'type-checking — emit-rocketstyle.ts emitKotlinRocketstyleModifier needs the same fix as the ' +
      'Swift side (skip the accessor, or emit a declared nullable type plus a null-safe chain entry)',
    () => {
      const kotlin = emitKotlinRocketstyleModifier(OMITS_SIBLING)
      expect(
        kotlin.includes('/* missing */ null') && kotlin.includes('.background(stateBackgroundColor)'),
      ).toBe(false)
    },
  )
})

describe('style-fidelity — the cross-target resolution contract', () => {
  it('reports NO drift for a matrix where every value declares every property', () => {
    const ir = irFrom(`el
      .states((t) => ({
        primary: { backgroundColor: t.color.primary },
        danger: { backgroundColor: t.color.danger },
      }))
      .sizes((t) => ({ small: { padding: 4 }, large: { padding: 16 } }))`)
    const report = checkStyleFidelity(ir)
    expect(report.drift).toEqual([])
    expect(report.swift).toEqual(report.kotlin)
    expect(report.swift).toContainEqual({
      dimension: 'state',
      value: 'primary',
      property: 'background-color',
      literal: 'PyreonTokens.Color.primary',
    })
  })

  it('REPORTS drift for the omitted-property shape — the two targets spell the hole differently', () => {
    const report = checkStyleFidelity(OMITS_SIBLING)
    expect(report.drift).toContainEqual({
      dimension: 'state',
      value: 'ghost',
      property: 'background-color',
      swiftLiteral: '/* missing */ nil',
      kotlinLiteral: '/* missing */ null',
    })
  })

  it('skips a (value, property) tuple whose accessor block cannot be located', () => {
    // Two `.states()` calls produce TWO dimensions both named `state`, so both
    // emit an accessor called `statePadding`. The extractor's regex finds the
    // FIRST block, which has no `case .b:` arm — that tuple is dropped rather
    // than mis-resolved, on both targets, so it produces no drift either.
    const ir = irFrom(`el
      .states((t) => ({ a: { padding: 4 } }))
      .states((t) => ({ b: { padding: 8 } }))`)
    expect(ir.dimensions.map((d) => d.name)).toEqual(['state', 'state'])
    const report = checkStyleFidelity(ir)
    expect(report.swift.map((r) => r.value)).toEqual(['a'])
    expect(report.kotlin.map((r) => r.value)).toEqual(['a'])
    expect(report.drift).toEqual([])
  })
})
