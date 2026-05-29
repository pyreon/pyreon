// Tests for the styled() → ViewModifier emitter (roadmap PR 7b).
//
// Snapshot per-target output for representative styles. The CSS-in-JS
// tagged-template → StyleIR parser is a follow-up PR; these tests
// exercise the emitter against pre-built IR.

import { describe, expect, it } from 'vitest'
import { emitKotlinStyleModifier, emitSwiftStyleModifier } from '../emit-style'
import type { StyleIR } from '../emit-style'

// The canonical primary-button style — covers token refs for colors
// + spacing + radius, which are the load-bearing properties for
// rocketstyle's dimension system (PR 7c).
const PRIMARY_BUTTON: StyleIR = {
  name: 'PyreonPrimaryButton',
  properties: [
    {
      name: 'background-color',
      value: { kind: 'token', group: 'color', entry: 'primary' },
    },
    {
      name: 'foreground-color',
      value: { kind: 'token', group: 'color', entry: 'background' },
    },
    {
      name: 'padding',
      value: { kind: 'token', group: 'spacing', entry: 'md' },
    },
    {
      name: 'border-radius',
      value: { kind: 'token', group: 'radius', entry: 'md' },
    },
  ],
}

describe('emit-style — Swift ViewModifier', () => {
  it('emits idiomatic ViewModifier for the primary button', () => {
    expect(emitSwiftStyleModifier(PRIMARY_BUTTON)).toMatchInlineSnapshot(`
      "struct PyreonPrimaryButton: ViewModifier, PyreonStylable {
        static let pyreonSource = "PyreonPrimaryButton"
        func body(content: Content) -> some View {
          content
            .background(PyreonTokens.Color.primary)
            .foregroundColor(PyreonTokens.Color.background)
            .padding(PyreonTokens.Spacing.md)
            .cornerRadius(PyreonTokens.Radius.md)
        }
      }"
    `)
  })

  it('handles literal-string values', () => {
    expect(
      emitSwiftStyleModifier({
        name: 'Inline',
        properties: [{ name: 'background', value: { kind: 'string', value: '#FF0000' } }],
      }),
    ).toMatchInlineSnapshot(`
      "struct Inline: ViewModifier, PyreonStylable {
        static let pyreonSource = "Inline"
        func body(content: Content) -> some View {
          content
            .background("#FF0000")
        }
      }"
    `)
  })

  it('handles numeric values for sizing', () => {
    expect(
      emitSwiftStyleModifier({
        name: 'Numeric',
        properties: [{ name: 'opacity', value: { kind: 'number', value: 0.5 } }],
      }),
    ).toMatchInlineSnapshot(`
      "struct Numeric: ViewModifier, PyreonStylable {
        static let pyreonSource = "Numeric"
        func body(content: Content) -> some View {
          content
            .opacity(0.5)
        }
      }"
    `)
  })

  it('silently skips unsupported CSS properties', () => {
    // Unknown CSS properties produce no chain entry — the rest of the
    // style still emits. Phase 0 supports a curated set; the rest will
    // grow as needed.
    expect(
      emitSwiftStyleModifier({
        name: 'Partial',
        properties: [
          { name: 'background', value: { kind: 'string', value: 'red' } },
          { name: 'mystery-future-prop', value: { kind: 'string', value: 'x' } },
        ],
      }),
    ).toMatchInlineSnapshot(`
      "struct Partial: ViewModifier, PyreonStylable {
        static let pyreonSource = "Partial"
        func body(content: Content) -> some View {
          content
            .background("red")
        }
      }"
    `)
  })
})

describe('emit-style — Kotlin Modifier', () => {
  it('emits idiomatic Modifier chain for the primary button', () => {
    expect(emitKotlinStyleModifier(PRIMARY_BUTTON)).toMatchInlineSnapshot(`
      "fun pyreonPrimaryButton(): Modifier =
        Modifier
          .background(PyreonTokens.Color.primary)
          // color: PyreonTokens.Color.background (apply on Text/Composable, not Modifier)
          .padding(PyreonTokens.Spacing.md)
          .clip(RoundedCornerShape(PyreonTokens.Radius.md))"
    `)
  })

  it('camelCases the function name (struct PyreonPrimaryButton → fn pyreonPrimaryButton)', () => {
    expect(emitKotlinStyleModifier(PRIMARY_BUTTON).startsWith('fun pyreonPrimaryButton()')).toBe(
      true,
    )
  })

  it('handles literal-color value', () => {
    expect(
      emitKotlinStyleModifier({
        name: 'Inline',
        properties: [{ name: 'background', value: { kind: 'string', value: 'red' } }],
      }),
    ).toMatchInlineSnapshot(`
      "fun inline(): Modifier =
        Modifier
          .background("red")"
    `)
  })

  it('handles opacity → alpha mapping', () => {
    expect(
      emitKotlinStyleModifier({
        name: 'Faded',
        properties: [{ name: 'opacity', value: { kind: 'number', value: 0.5 } }],
      }),
    ).toMatchInlineSnapshot(`
      "fun faded(): Modifier =
        Modifier
          .alpha(0.5)"
    `)
  })
})
