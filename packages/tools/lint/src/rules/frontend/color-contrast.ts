import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * Opt-in frontend accessibility rule — flags a low-contrast foreground /
 * background pair in a style object literal.
 *
 * WCAG 2.1 AA requires a contrast ratio of at least **4.5:1** for normal
 * text (3:1 for large text — ≥24px, or ≥19px bold). When a style object
 * sets BOTH `color` and `background`/`backgroundColor` to LITERAL hex
 * colors, the ratio is computable at lint time:
 *
 * ```tsx
 * <div style={{ color: '#6b7280', background: '#212121' }} />
 * //                                                       ^ 3.33:1 — fails AA
 * ```
 *
 * **Scope — literal hex pairs ONLY (deliberate, by far the lowest false-
 * positive boundary).** The rule fires only when both values are literal
 * `#rgb` / `#rrggbb` strings in the same object. It does NOT resolve theme
 * tokens (`color: t.color.muted`), CSS template strings (`css\`color: …\``),
 * `rgb()` / `hsl()` / named colors, or any value carrying alpha (alpha
 * changes the effective contrast against whatever is behind it). Theme-
 * token contrast is the more common real-world shape but is impossible
 * for a static AST walker — it would need to evaluate the theme object at
 * its definition site (cross-module, runtime-shaped). That belongs in a
 * theme-loading audit, not a syntactic lint rule; this rule covers the
 * hardcoded-hex case it CAN prove, with zero guessing.
 */
export const colorContrast: Rule = {
  meta: {
    id: 'pyreon/color-contrast',
    category: 'frontend',
    description:
      'Flag a low-contrast `color` / `background` literal-hex pair in a style object (WCAG AA < 4.5:1).',
    severity: 'warn',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    const callbacks: VisitorCallbacks = {
      ObjectExpression(node: any) {
        const props = node.properties ?? []
        let fg: string | null = null
        let bg: string | null = null
        for (const p of props) {
          if (p.type !== 'Property' || p.computed) continue
          const key = keyName(p.key)
          if (key === null) continue
          const value = literalString(p.value)
          if (value === null) continue
          if (key === 'color') fg = value
          else if (key === 'background' || key === 'backgroundColor') bg = value
        }
        if (fg === null || bg === null) return

        const fgRgb = parseHex(fg)
        const bgRgb = parseHex(bg)
        if (!fgRgb || !bgRgb) return // not both literal hex — skip (conservative)

        const ratio = contrastRatio(fgRgb, bgRgb)
        if (ratio < 4.5) {
          const rounded = Math.round(ratio * 100) / 100
          context.report({
            message:
              `Low contrast: \`${fg}\` on \`${bg}\` is ${rounded}:1 — WCAG AA needs ` +
              `4.5:1 for normal text (3:1 for large text ≥24px / ≥19px bold). ` +
              `Darken the background or lighten the text.`,
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}

/** Property key as a string, for Identifier or string-literal keys. */
function keyName(key: any): string | null {
  if (!key) return null
  if (key.type === 'Identifier') return key.name
  if ((key.type === 'Literal' || key.type === 'StringLiteral') && typeof key.value === 'string') {
    return key.value
  }
  return null
}

/** The string value of a string-literal node, else null. */
function literalString(value: any): string | null {
  if (!value) return null
  if ((value.type === 'Literal' || value.type === 'StringLiteral') && typeof value.value === 'string') {
    return value.value
  }
  return null
}

/** Parse `#rgb` / `#rrggbb` to [r,g,b] (0-255). Alpha / non-hex → null. */
function parseHex(input: string): [number, number, number] | null {
  const s = input.trim()
  if (s[0] !== '#') return null
  const hex = s.slice(1)
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null
  if (hex.length === 3) {
    const r = hex[0]!
    const g = hex[1]!
    const b = hex[2]!
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)]
  }
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ]
  }
  // length 4 / 8 → carries alpha; skip (effective contrast depends on the
  // layer behind, which the rule can't know).
  return null
}

/** WCAG 2.x relative luminance of an [r,g,b] (0-255) colour. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c8: number): number => {
    const c = c8 / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio (1–21) between two [r,g,b] colours. */
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}
