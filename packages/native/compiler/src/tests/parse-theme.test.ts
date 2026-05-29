// Tests for the theme parser — `@pyreon/ui-theme` source → ThemeIR.
//
// Tests both the parser's handling of theme shapes (1-level scalars,
// 2-level groups, 3-level nested via flatten) AND the end-to-end
// chain (parser → emitter) against the canonical PyreonTokens output
// shape.

import { describe, expect, it } from 'vitest'
import { emitKotlinTokens, emitSwiftTokens } from '../emit-tokens'
import { parseTheme } from '../parse-theme'

describe('parse-theme — top-level scalars', () => {
  it('promotes top-level scalars to a `globals` group', () => {
    const { ir, warnings } = parseTheme(`
      const theme = {
        rootSize: 16,
      }
      export default theme
    `)
    expect(warnings).toHaveLength(0)
    expect(ir.groups).toEqual([
      { name: 'globals', entries: [{ name: 'rootSize', value: { kind: 'number', value: 16 } }] },
    ])
  })

  it('emits scalars + nested groups in source order (globals first)', () => {
    const { ir } = parseTheme(`
      const theme = {
        rootSize: 16,
        spacing: { xs: 4, sm: 8 },
      }
      export default theme
    `)
    expect(ir.groups[0]?.name).toBe('globals')
    expect(ir.groups[1]?.name).toBe('spacing')
  })
})

describe('parse-theme — 2-level groups', () => {
  it('parses a spacing group with integer values', () => {
    const { ir, warnings } = parseTheme(`
      const theme = {
        spacing: { xs: 4, sm: 8, md: 12 },
      }
      export default theme
    `)
    expect(warnings).toHaveLength(0)
    expect(ir.groups).toHaveLength(1)
    const spacing = ir.groups[0]
    expect(spacing?.name).toBe('spacing')
    expect(spacing?.entries).toHaveLength(3)
    // Spacing-like groups get `dp` kind (length type).
    expect(spacing?.entries[0]).toEqual({ name: 'xs', value: { kind: 'dp', value: 4 } })
  })

  it('parses a color group with string values', () => {
    const { ir } = parseTheme(`
      const theme = {
        color: { primary: '#0066FF', danger: 'rgb(255,0,0)' },
      }
      export default theme
    `)
    const color = ir.groups[0]
    expect(color?.entries).toEqual([
      { name: 'primary', value: { kind: 'string', value: '#0066FF' } },
      { name: 'danger', value: { kind: 'string', value: 'rgb(255,0,0)' } },
    ])
  })

  it('uses `number` (not `dp`) for non-length groups like zIndex / fontWeight', () => {
    const { ir } = parseTheme(`
      const theme = {
        zIndex: { modal: 3000 },
        fontWeight: { bold: 700 },
      }
      export default theme
    `)
    const z = ir.groups.find((g) => g.name === 'zIndex')
    const fw = ir.groups.find((g) => g.name === 'fontWeight')
    expect(z?.entries[0]?.value).toEqual({ kind: 'number', value: 3000 })
    expect(fw?.entries[0]?.value).toEqual({ kind: 'number', value: 700 })
  })

  it('handles negative numbers via UnaryExpression', () => {
    const { ir } = parseTheme(`
      const theme = {
        offset: { up: -10, down: 10 },
      }
      export default theme
    `)
    const offset = ir.groups[0]
    expect(offset?.entries[0]?.value).toEqual({ kind: 'number', value: -10 })
    expect(offset?.entries[1]?.value).toEqual({ kind: 'number', value: 10 })
  })
})

describe('parse-theme — 3-level nested objects', () => {
  it('flattens nested objects with underscore + warns', () => {
    const { ir, warnings } = parseTheme(`
      const theme = {
        color: {
          system: {
            light: '#FFFFFF',
            dark: '#000000',
          },
          primary: '#0066FF',
        },
      }
      export default theme
    `)
    const color = ir.groups[0]
    expect(color?.entries.map((e) => e.name)).toEqual(['system_light', 'system_dark', 'primary'])
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('flattened color.system')
  })

  it('flattens 3-level zIndex (popover.content) to underscored names', () => {
    const { ir } = parseTheme(`
      const theme = {
        zIndex: {
          base: 10,
          popover: { content: 101, overlay: 100 },
        },
      }
      export default theme
    `)
    const z = ir.groups[0]
    expect(z?.entries.map((e) => e.name)).toEqual(['base', 'popover_content', 'popover_overlay'])
  })

  it('handles 4-level nesting (color.system.light.base → color.system_light_base)', () => {
    const { ir } = parseTheme(`
      const theme = {
        color: {
          system: {
            light: { base: '#FFF', 900: '#EEE' },
          },
        },
      }
      export default theme
    `)
    const color = ir.groups[0]
    expect(color?.entries.map((e) => e.name)).toEqual(['system_light_base', 'system_light_900'])
  })
})

describe('parse-theme — source-discovery shapes', () => {
  it('finds `const theme = {...}` + `export default theme`', () => {
    const { ir } = parseTheme(`
      const theme = { spacing: { xs: 4 } }
      export default theme
    `)
    expect(ir.groups).toHaveLength(1)
  })

  it('finds `export default {...}` directly', () => {
    const { ir } = parseTheme(`
      export default { spacing: { xs: 4 } }
    `)
    expect(ir.groups).toHaveLength(1)
  })

  it('throws on missing theme object', () => {
    expect(() => parseTheme('export const notTheme = { spacing: {} }')).toThrow(
      /no theme object found/,
    )
  })

  it('throws on parse error', () => {
    expect(() => parseTheme('const theme = { invalid')).toThrow()
  })
})

describe('parse-theme — TypeScript wrapper layers', () => {
  it('unwraps `as const` (the canonical `@pyreon/ui-theme` shape)', () => {
    const { ir } = parseTheme(`
      const theme = {
        spacing: { xs: 4 },
      } as const
      export default theme
    `)
    expect(ir.groups).toHaveLength(1)
    expect(ir.groups[0]?.name).toBe('spacing')
  })

  it('unwraps `satisfies` annotation', () => {
    const { ir } = parseTheme(`
      const theme = {
        spacing: { xs: 4 },
      } satisfies Record<string, any>
      export default theme
    `)
    expect(ir.groups).toHaveLength(1)
  })

  it('unwraps parenthesized + `as` chain', () => {
    const { ir } = parseTheme(`
      const theme = ({ spacing: { xs: 4 } } as const)
      export default theme
    `)
    expect(ir.groups).toHaveLength(1)
  })
})

describe('parse-theme — numeric property keys', () => {
  it('accepts numeric keys (canonical color-subgroup convention: 900, 800, 700)', () => {
    const { ir } = parseTheme(`
      const theme = {
        color: { 900: '#EEE', 800: '#DDD' },
      }
      export default theme
    `)
    const color = ir.groups[0]
    expect(color?.entries.map((e) => e.name)).toEqual(['900', '800'])
  })
})

describe('parse-theme — real @pyreon/ui-theme source', () => {
  // Integration test against the actual canonical theme. The exact
  // entry count is not load-bearing — what matters is (a) parsing
  // doesn't throw, (b) the structural top-level groups land, (c) the
  // emit count grows roughly with the theme. If this snapshot drifts
  // because the theme grew a group, that's noise — update the snapshot
  // by running `vitest -u`.
  const REAL_THEME = `
    const theme = {
      rootSize: 16,
      breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
      spacing: { xSmall: 4, small: 8, medium: 12, large: 16 },
      color: {
        system: {
          light: { base: 'rgba(255,255,255,1)', 900: 'rgba(255,255,255,0.9)' },
          dark: { base: 'rgba(15,23,42,1)' },
        },
        primary: 'rgba(0,102,255,1)',
      },
      zIndex: {
        base: 10,
        popover: { content: 101, overlay: 100 },
      },
    } as const
    export default theme
  `

  it('parses the canonical multi-level shape without throwing', () => {
    const { ir, warnings } = parseTheme(REAL_THEME)
    // Top-level groups: globals (rootSize), breakpoints, spacing, color, zIndex.
    expect(ir.groups.map((g) => g.name)).toEqual([
      'globals',
      'breakpoints',
      'spacing',
      'color',
      'zIndex',
    ])
    // color has 5 flattened entries: system_light_base, system_light_900,
    // system_dark_base, primary. zIndex has 3: base, popover_content,
    // popover_overlay.
    const color = ir.groups.find((g) => g.name === 'color')
    expect(color?.entries.map((e) => e.name)).toEqual([
      'system_light_base',
      'system_light_900',
      'system_dark_base',
      'primary',
    ])
    const zIndex = ir.groups.find((g) => g.name === 'zIndex')
    expect(zIndex?.entries.map((e) => e.name)).toEqual([
      'base',
      'popover_content',
      'popover_overlay',
    ])
    expect(warnings.length).toBeGreaterThan(0) // color + zIndex both trigger flatten
  })
})

describe('parse-theme → emit-tokens end-to-end', () => {
  const SAMPLE = `
    const theme = {
      rootSize: 16,
      spacing: { xs: 4, sm: 8, md: 12 },
      color: { primary: '#0066FF' },
    }
    export default theme
  `

  it('parsed theme emits canonical Swift PyreonTokens', () => {
    const { ir } = parseTheme(SAMPLE)
    expect(emitSwiftTokens(ir)).toMatchInlineSnapshot(`
      "// Auto-generated by @pyreon/native-compiler — do not edit.
      import SwiftUI

      public enum PyreonTokens {
        public enum Globals {
          public static let rootSize: Int = 16
        }
        public enum Spacing {
          public static let xs: CGFloat = 4
          public static let sm: CGFloat = 8
          public static let md: CGFloat = 12
        }
        public enum Color {
          public static let primary: String = "#0066FF"
        }
      }"
    `)
  })

  it('parsed theme emits canonical Kotlin PyreonTokens', () => {
    const { ir } = parseTheme(SAMPLE)
    expect(emitKotlinTokens(ir)).toMatchInlineSnapshot(`
      "// Auto-generated by @pyreon/native-compiler — do not edit.
      import androidx.compose.ui.unit.dp

      object PyreonTokens {
        object Globals {
          val rootSize = 16
        }
        object Spacing {
          val xs = 4.dp
          val sm = 8.dp
          val md = 12.dp
        }
        object Color {
          val primary = "#0066FF"
        }
      }"
    `)
  })
})
