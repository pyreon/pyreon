// Tests for the rocketstyle() chain parser — TS source → RocketstyleIR.

import { describe, expect, it } from 'vitest'
import {
  emitKotlinRocketstyleModifier,
  emitSwiftRocketstyleModifier,
} from '../emit-rocketstyle'
import { parseRocketstyle } from '../parse-rocketstyle'

describe('parse-rocketstyle — single dimension', () => {
  it('parses .states((t) => ({...})) into a state dimension', () => {
    const { rocketstyles, warnings } = parseRocketstyle(`
      const Button = rocketstyle('button').states((t) => ({
        primary: { backgroundColor: t.color.primary },
        secondary: { backgroundColor: t.color.secondary },
      }))
    `)
    expect(warnings).toHaveLength(0)
    expect(rocketstyles).toHaveLength(1)
    expect(rocketstyles[0]).toEqual({
      name: 'Button',
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
          ],
        },
      ],
    })
  })
})

describe('parse-rocketstyle — multiple dimensions', () => {
  it('parses .states + .sizes + .variants in source order', () => {
    const { rocketstyles } = parseRocketstyle(`
      const Button = rocketstyle('button')
        .states((t) => ({
          primary: { backgroundColor: t.color.primary },
        }))
        .sizes((t) => ({
          small: { padding: t.spacing.sm },
          large: { padding: t.spacing.lg },
        }))
        .variants((t) => ({
          rounded: { borderRadius: t.radius.lg },
        }))
    `)
    const dims = rocketstyles[0]?.dimensions.map((d) => d.name)
    expect(dims).toEqual(['state', 'size', 'variant'])
  })

  it('handles the el-factory chain head with intervening .config/.attrs/.theme', () => {
    const { rocketstyles } = parseRocketstyle(`
      const Button = el
        .config({ name: 'Button' })
        .attrs({ tag: 'button' })
        .theme((t) => ({ fontSize: t.fontSize.base }))
        .states((t) => ({
          primary: { backgroundColor: t.color.primary },
        }))
    `)
    // Theme/config/attrs are walked through — only states matters
    // for the matrix.
    expect(rocketstyles).toHaveLength(1)
    expect(rocketstyles[0]?.dimensions).toHaveLength(1)
    expect(rocketstyles[0]?.dimensions[0]?.name).toBe('state')
  })
})

describe('parse-rocketstyle — theme-token flattening', () => {
  it('flattens deeper-than-2 theme chains with underscore', () => {
    const { rocketstyles } = parseRocketstyle(`
      const Button = rocketstyle('button').states((t) => ({
        primary: { backgroundColor: t.color.system.primary.base },
      }))
    `)
    expect(rocketstyles[0]?.dimensions[0]?.values[0]?.properties[0]).toEqual({
      name: 'background-color',
      value: { kind: 'token', group: 'color', entry: 'system_primary_base' },
    })
  })

  it('handles bracket-indexed deep chains (t.color.primary[500])', () => {
    const { rocketstyles } = parseRocketstyle(`
      const Button = rocketstyle('button').states((t) => ({
        primary: { backgroundColor: t.color.primary[500] },
      }))
    `)
    expect(rocketstyles[0]?.dimensions[0]?.values[0]?.properties[0]?.value).toEqual({
      kind: 'token',
      group: 'color',
      entry: 'primary_500',
    })
  })
})

describe('parse-rocketstyle — value shapes', () => {
  it('accepts string literals', () => {
    const { rocketstyles } = parseRocketstyle(`
      const Button = rocketstyle('button').states((t) => ({
        primary: { cursor: 'pointer' },
      }))
    `)
    expect(rocketstyles[0]?.dimensions[0]?.values[0]?.properties[0]).toEqual({
      name: 'cursor',
      value: { kind: 'string', value: 'pointer' },
    })
  })

  it('accepts numeric literals', () => {
    const { rocketstyles } = parseRocketstyle(`
      const Button = rocketstyle('button').states((t) => ({
        primary: { opacity: 0.5 },
      }))
    `)
    expect(rocketstyles[0]?.dimensions[0]?.values[0]?.properties[0]).toEqual({
      name: 'opacity',
      value: { kind: 'number', value: 0.5 },
    })
  })

  it('accepts negative numbers (UnaryExpression)', () => {
    const { rocketstyles } = parseRocketstyle(`
      const Button = rocketstyle('button').states((t) => ({
        a: { marginTop: -10 },
      }))
    `)
    expect(rocketstyles[0]?.dimensions[0]?.values[0]?.properties[0]).toEqual({
      name: 'margin-top',
      value: { kind: 'number', value: -10 },
    })
  })

  it('camelCase → kebab-case for property names', () => {
    const { rocketstyles } = parseRocketstyle(`
      const Button = rocketstyle('button').states((t) => ({
        primary: {
          backgroundColor: 'red',
          borderRadius: 8,
          fontFamily: 'sans-serif',
        },
      }))
    `)
    const props = rocketstyles[0]?.dimensions[0]?.values[0]?.properties.map((p) => p.name)
    expect(props).toEqual(['background-color', 'border-radius', 'font-family'])
  })
})

describe('parse-rocketstyle — nested pseudo-states (warned + skipped)', () => {
  it('warns + skips hover/focus/active nested objects', () => {
    const { rocketstyles, warnings } = parseRocketstyle(`
      const Button = rocketstyle('button').states((t) => ({
        primary: {
          backgroundColor: t.color.primary,
          hover: { backgroundColor: t.color.primary_hover },
          focus: { outline: 'none' },
        },
      }))
    `)
    const primary = rocketstyles[0]?.dimensions[0]?.values[0]
    // Only top-level backgroundColor lands. hover/focus skipped.
    expect(primary?.properties).toHaveLength(1)
    expect(primary?.properties[0]?.name).toBe('background-color')
    expect(warnings.some((w) => w.includes('pseudo-state'))).toBe(true)
  })
})

describe('parse-rocketstyle — chain heads', () => {
  it('recognises rocketstyle(component)', () => {
    const { rocketstyles } = parseRocketstyle(`
      const X = rocketstyle(Inner).states((t) => ({ a: { color: t.color.fg } }))
    `)
    expect(rocketstyles).toHaveLength(1)
  })

  it('recognises bare `el` head', () => {
    const { rocketstyles } = parseRocketstyle(`
      const X = el.states((t) => ({ a: { color: t.color.fg } }))
    `)
    expect(rocketstyles).toHaveLength(1)
  })

  it('recognises `txt` and `list` heads', () => {
    const { rocketstyles } = parseRocketstyle(`
      const Y = txt.sizes((t) => ({ small: { fontSize: t.fontSize.small } }))
      const Z = list.variants((t) => ({ flat: { padding: t.spacing.xs } }))
    `)
    expect(rocketstyles).toHaveLength(2)
  })

  it('skips chains with unknown heads', () => {
    const { rocketstyles } = parseRocketstyle(`
      const X = someOther().states((t) => ({ a: { x: 1 } }))
    `)
    expect(rocketstyles).toHaveLength(0)
  })

  it('skips chains without dimension methods', () => {
    const { rocketstyles } = parseRocketstyle(`
      const X = el.config({ name: 'X' }).attrs({ tag: 'div' })
    `)
    expect(rocketstyles).toHaveLength(0)
  })
})

describe('parse-rocketstyle — edge cases', () => {
  it('handles arrow with block body + single return', () => {
    const { rocketstyles } = parseRocketstyle(`
      const X = rocketstyle('button').states((t) => {
        return {
          primary: { color: t.color.fg },
        }
      })
    `)
    expect(rocketstyles[0]?.dimensions[0]?.values[0]?.properties[0]?.value).toEqual({
      kind: 'token',
      group: 'color',
      entry: 'fg',
    })
  })

  it('handles direct object literal arg (no arrow wrapper)', () => {
    const { rocketstyles } = parseRocketstyle(`
      const X = rocketstyle('button').states({
        primary: { color: 'red' },
      })
    `)
    expect(rocketstyles[0]?.dimensions[0]?.values[0]?.properties[0]).toEqual({
      name: 'color',
      value: { kind: 'string', value: 'red' },
    })
  })

  it('throws on parse error', () => {
    expect(() => parseRocketstyle('const X = rocketstyle(')).toThrow()
  })
})

describe('parse-rocketstyle → emit-rocketstyle end-to-end', () => {
  it('parsed Button matrix emits canonical Swift ViewModifier', () => {
    const { rocketstyles } = parseRocketstyle(`
      const PyreonButton = rocketstyle('button')
        .states((t) => ({
          primary: { backgroundColor: t.color.primary },
          secondary: { backgroundColor: t.color.secondary },
          danger: { backgroundColor: t.color.danger },
        }))
        .sizes((t) => ({
          small: { padding: t.spacing.sm },
          medium: { padding: t.spacing.md },
          large: { padding: t.spacing.lg },
        }))
    `)
    expect(emitSwiftRocketstyleModifier(rocketstyles[0]!)).toMatchInlineSnapshot(`
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

  it('parsed Button matrix emits canonical Kotlin Modifier', () => {
    const { rocketstyles } = parseRocketstyle(`
      const PyreonButton = rocketstyle('button')
        .states((t) => ({
          primary: { backgroundColor: t.color.primary },
        }))
        .sizes((t) => ({
          small: { padding: t.spacing.sm },
        }))
    `)
    expect(emitKotlinRocketstyleModifier(rocketstyles[0]!)).toMatchInlineSnapshot(`
      "enum class PyreonButtonState { primary }

      enum class PyreonButtonSize { small }

      fun pyreonButtonModifier(state: PyreonButtonState, size: PyreonButtonSize): Modifier {
        val stateBackgroundColor = when (state) {
          PyreonButtonState.primary -> PyreonTokens.Color.primary
        }
        val sizePadding = when (size) {
          PyreonButtonSize.small -> PyreonTokens.Spacing.sm
        }
        return Modifier
          .background(stateBackgroundColor)
          .padding(sizePadding)
      }"
    `)
  })
})
