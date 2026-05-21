// Tests for the rocketstyle-dimensions emitter (roadmap PR 7c).
//
// The TSX-source → RocketstyleIR parser lands in a follow-up PR; these
// tests exercise the emitter shape against pre-built IR matching the
// canonical PyreonButton matrix from the PMTC plan (#764).

import { describe, expect, it } from 'vitest'
import {
  emitKotlinRocketstyleModifier,
  emitSwiftRocketstyleModifier,
} from '../emit-rocketstyle'
import type { RocketstyleIR } from '../emit-rocketstyle'

// The canonical PyreonButton matrix from the PMTC plan: state × size.
// state owns background-color; size owns padding. (Rocketstyle's
// structural rule: each property belongs to ONE dimension — no
// overlap.)
const PYREON_BUTTON: RocketstyleIR = {
  name: 'PyreonButton',
  dimensions: [
    {
      name: 'state',
      values: [
        {
          name: 'primary',
          properties: [
            {
              name: 'background-color',
              value: { kind: 'token', group: 'color', entry: 'primary' },
            },
          ],
        },
        {
          name: 'secondary',
          properties: [
            {
              name: 'background-color',
              value: { kind: 'token', group: 'color', entry: 'secondary' },
            },
          ],
        },
        {
          name: 'danger',
          properties: [
            {
              name: 'background-color',
              value: { kind: 'token', group: 'color', entry: 'danger' },
            },
          ],
        },
      ],
    },
    {
      name: 'size',
      values: [
        {
          name: 'small',
          properties: [
            { name: 'padding', value: { kind: 'token', group: 'spacing', entry: 'sm' } },
          ],
        },
        {
          name: 'medium',
          properties: [
            { name: 'padding', value: { kind: 'token', group: 'spacing', entry: 'md' } },
          ],
        },
        {
          name: 'large',
          properties: [
            { name: 'padding', value: { kind: 'token', group: 'spacing', entry: 'lg' } },
          ],
        },
      ],
    },
  ],
}

describe('emit-rocketstyle — Swift ViewModifier', () => {
  it('emits per-dimension enums + a parameterised ViewModifier for the canonical Button matrix', () => {
    expect(emitSwiftRocketstyleModifier(PYREON_BUTTON)).toMatchInlineSnapshot(`
      "enum PyreonButtonState: String {
        case primary, secondary, danger
      }

      enum PyreonButtonSize: String {
        case small, medium, large
      }

      struct PyreonButtonModifier: ViewModifier, PyreonStylable {
        static let pyreonSource = "PyreonButton"
        let state: PyreonButtonState
        let size: PyreonButtonSize
        func body(content: Content) -> some View {
          content
            .background(stateBackgroundColor)
            .padding(sizePadding)
        }
        private var stateBackgroundColor: Color {
          switch state {
          case .primary: return PyreonTokens.Color.primary
          case .secondary: return PyreonTokens.Color.secondary
          case .danger: return PyreonTokens.Color.danger
          }
        }
        private var sizePadding: CGFloat {
          switch size {
          case .small: return PyreonTokens.Spacing.sm
          case .medium: return PyreonTokens.Spacing.md
          case .large: return PyreonTokens.Spacing.lg
          }
        }
      }"
    `)
  })

  it('handles a single-dimension component (size only)', () => {
    expect(
      emitSwiftRocketstyleModifier({
        name: 'PyreonText',
        dimensions: [
          {
            name: 'size',
            values: [
              {
                name: 'small',
                properties: [
                  { name: 'font-size', value: { kind: 'number', value: 12 } },
                ],
              },
              {
                name: 'large',
                properties: [
                  { name: 'font-size', value: { kind: 'number', value: 20 } },
                ],
              },
            ],
          },
        ],
      }),
    ).toMatchInlineSnapshot(`
      "enum PyreonTextSize: String {
        case small, large
      }

      struct PyreonTextModifier: ViewModifier, PyreonStylable {
        static let pyreonSource = "PyreonText"
        let size: PyreonTextSize
        func body(content: Content) -> some View {
          content
            .font(.system(size: sizeFontSize))
        }
        private var sizeFontSize: CGFloat {
          switch size {
          case .small: return 12
          case .large: return 20
          }
        }
      }"
    `)
  })

  it('skips unsupported CSS properties on the chain, retains the accessor', () => {
    // Mystery properties produce no .modifier chain entry but the
    // computed accessor still appears — keeps the IR honest, the
    // emitter conservative.
    const out = emitSwiftRocketstyleModifier({
      name: 'Partial',
      dimensions: [
        {
          name: 'state',
          values: [
            {
              name: 'a',
              properties: [
                { name: 'background', value: { kind: 'string', value: 'red' } },
                { name: 'mystery-prop', value: { kind: 'string', value: 'x' } },
              ],
            },
          ],
        },
      ],
    })
    expect(out).toContain('.background(stateBackground)')
    expect(out).not.toContain('.mystery-prop')
    expect(out).not.toContain('.mystery')
  })
})

describe('emit-rocketstyle — Kotlin Modifier function', () => {
  it('emits per-dimension enum classes + a parameterised Modifier function', () => {
    expect(emitKotlinRocketstyleModifier(PYREON_BUTTON)).toMatchInlineSnapshot(`
      "enum class PyreonButtonState { primary, secondary, danger }

      enum class PyreonButtonSize { small, medium, large }

      fun pyreonButtonModifier(state: PyreonButtonState, size: PyreonButtonSize): Modifier {
        val stateBackgroundColor = when (state) {
          PyreonButtonState.primary -> PyreonTokens.Color.primary
          PyreonButtonState.secondary -> PyreonTokens.Color.secondary
          PyreonButtonState.danger -> PyreonTokens.Color.danger
        }
        val sizePadding = when (size) {
          PyreonButtonSize.small -> PyreonTokens.Spacing.sm
          PyreonButtonSize.medium -> PyreonTokens.Spacing.md
          PyreonButtonSize.large -> PyreonTokens.Spacing.lg
        }
        return Modifier
          .background(stateBackgroundColor)
          .padding(sizePadding)
      }"
    `)
  })

  it('camelCases the function name (PyreonButton → pyreonButtonModifier)', () => {
    expect(
      emitKotlinRocketstyleModifier(PYREON_BUTTON).startsWith('enum class PyreonButtonState'),
    ).toBe(true)
    expect(emitKotlinRocketstyleModifier(PYREON_BUTTON)).toContain(
      'fun pyreonButtonModifier(',
    )
  })

  it('handles opacity → alpha mapping in the chain ref', () => {
    expect(
      emitKotlinRocketstyleModifier({
        name: 'Faded',
        dimensions: [
          {
            name: 'state',
            values: [
              {
                name: 'visible',
                properties: [{ name: 'opacity', value: { kind: 'number', value: 1 } }],
              },
              {
                name: 'dim',
                properties: [{ name: 'opacity', value: { kind: 'number', value: 0.5 } }],
              },
            ],
          },
        ],
      }),
    ).toMatchInlineSnapshot(`
      "enum class FadedState { visible, dim }

      fun fadedModifier(state: FadedState): Modifier {
        val stateOpacity = when (state) {
          FadedState.visible -> 1
          FadedState.dim -> 0.5
        }
        return Modifier
          .alpha(stateOpacity)
      }"
    `)
  })
})
