/**
 * `parseTheme` and `parseRocketstyle` walk object-literal properties via a
 * shared `readKey(prop.key)` helper that reads an `Identifier` key's `.name`
 * unconditionally. For `{ [k]: v }` (a COMPUTED property) oxc represents the
 * key as an `Identifier` too — the variable `k` — with `computed: true` on
 * the property node. `readKey` has no way to tell the two apart, so a
 * computed key was silently read as the literal field/token name (`k`,
 * verbatim) instead of being skipped, the same class the sibling
 * `*-native.ts` walkers already guard against (`|| p.computed) continue`
 * next to their type check). This locks the four call sites now doing the
 * same guard.
 */
import { describe, expect, it } from 'vitest'
import { parseTheme } from '../parse-theme'
import { parseRocketstyle } from '../parse-rocketstyle'

describe('parse-theme skips a computed top-level key', () => {
  it('does not read the variable name as the token name', () => {
    const { ir } = parseTheme(`
      const k = 'rootSize'
      const theme = {
        [k]: 16,
        realSize: 8,
      }
      export default theme
    `)
    // The computed entry must not appear under the literal name 'k' — and
    // the real, non-computed sibling must still parse normally.
    const names = ir.groups.flatMap((g) => g.entries.map((e) => e.name))
    expect(names).not.toContain('k')
    expect(names).toContain('realSize')
  })

  it('does not read a computed key inside a nested group', () => {
    const { ir } = parseTheme(`
      const k = 'xs'
      const theme = {
        spacing: { [k]: 4, sm: 8 },
      }
      export default theme
    `)
    const spacing = ir.groups.find((g) => g.name === 'spacing')
    const names = spacing?.entries.map((e) => e.name) ?? []
    expect(names).not.toContain('k')
    expect(names).toContain('sm')
  })
})

describe('parse-rocketstyle skips a computed dimension-value / property key', () => {
  it('does not read the variable name as the dimension value name', () => {
    const { rocketstyles } = parseRocketstyle(`
      const k = 'primary'
      const Button = rocketstyle('button').states((t) => ({
        [k]: { backgroundColor: t.color.primary },
        secondary: { backgroundColor: t.color.secondary },
      }))
    `)
    const valueNames = rocketstyles[0]?.dimensions[0]?.values.map((v) => v.name) ?? []
    expect(valueNames).not.toContain('k')
    expect(valueNames).toContain('secondary')
  })

  it('does not read the variable name as a style property name', () => {
    const { rocketstyles } = parseRocketstyle(`
      const k = 'color'
      const Button = rocketstyle('button').states((t) => ({
        primary: { [k]: t.color.primary, backgroundColor: t.color.background },
      }))
    `)
    const propNames = rocketstyles[0]?.dimensions[0]?.values[0]?.properties.map((p) => p.name) ?? []
    expect(propNames).not.toContain('k')
    expect(propNames).toContain('background-color')
  })
})
