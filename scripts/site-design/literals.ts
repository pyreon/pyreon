/**
 * Design-token literals: a value a style rule writes by hand instead of reading
 * a token from `docs/src/site/theme.ts`. Line-based over comment-blanked
 * source, so it reads rocketstyle objects (`gap: 18`, `{ xs: 12, md: 20 }`),
 * CSS in template literals and plain stylesheets alike. Interpolations
 * (`${space[150]}px`) and `var(…)` are tokens, never literals.
 */

export type LiteralRule =
  | 'literal/color'
  | 'literal/space'
  | 'literal/radius'
  | 'literal/font-size'
  | 'literal/shadow'
  | 'literal/z-index'
  | 'literal/media'

export interface LineFinding {
  line: number
  rule: LiteralRule
  detail: string
}

const SIDES = ['', 'Top', 'Right', 'Bottom', 'Left', 'X', 'Y', 'Inline', 'Block', 'InlineStart', 'InlineEnd', 'BlockStart', 'BlockEnd']
const kebab = (camel: string): string => camel.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const withSides = (bases: string[]): string[] => bases.flatMap((b) => SIDES.map((s) => `${b}${s}`))

const SPACE_PROPS = [...withSides(['padding', 'margin', 'scrollMargin', 'scrollPadding']), 'gap', 'rowGap', 'columnGap', 'inset', 'top', 'right', 'bottom', 'left']
const RADIUS_PROPS = ['borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']
const FONT_PROPS = ['fontSize']
const SHADOW_PROPS = ['boxShadow', 'textShadow']
const Z_PROPS = ['zIndex']

const RULE_OF = new Map<string, LiteralRule>()
for (const [rule, props] of [
  ['literal/space', SPACE_PROPS],
  ['literal/radius', RADIUS_PROPS],
  ['literal/font-size', FONT_PROPS],
  ['literal/shadow', SHADOW_PROPS],
  ['literal/z-index', Z_PROPS],
] as const) {
  for (const p of props) {
    RULE_OF.set(p, rule)
    RULE_OF.set(kebab(p), rule)
  }
}
// The CSS `font` shorthand carries a size (`font: 600 12px/1 …`).
RULE_OF.set('font', 'literal/font-size')

const PROP_ALT = [...RULE_OF.keys()].sort((a, b) => b.length - a.length).join('|')
const PROP_RE = new RegExp(`(?<![\\w$.\\-])(${PROP_ALT})\\s*:\\s*`, 'g')
// A calc() multiplier or divisor (`/ 2`, `* 3`) is arithmetic, not a design value.
const NUMBER_RE = /(?<![\w.#$-])(?<![*/]\s*)(-?\d*\.?\d+)(px|rem|em)?(?![\w%(.])/g
const HEX_RE = /(?<![\w&/#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g
const COLOR_FN_RE = /(?<![\w-])(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab)\(\s*[\d.]/g
const MEDIA_RE = /@media[^{`]*/g

/** Drop `${…}` interpolations (one nesting level) and `var(…)` reads: both are tokens. */
export function tokensOut(value: string): string {
  return value.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, ' ').replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' ')
}

const CLOSER: Record<string, string> = { '{': '}', "'": "'", '"': '"', '`': '`' }

/** The value text after `prop:`, up to the end of the declaration. */
export function valueAt(line: string, start: number): string {
  const open = line[start] ?? ''
  const close = CLOSER[open]
  if (close) {
    const end = line.indexOf(close, start + 1)
    return line.slice(start + 1, end < 0 ? line.length : end)
  }
  // Interpolations are masked first, so a `}` inside `${…}` does not end the value.
  const rest = line.slice(start).replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}|\$\{.*$/g, (m) => ' '.repeat(m.length))
  const stop = rest.search(/[;}`\n]|,\s*[A-Za-z_$][\w$-]*\s*:|\)\s*[,)]?\s*$/)
  return stop < 0 ? rest : rest.slice(0, stop)
}

/** Numbers in a value that count as literals for `rule`. Hairlines (|v| ≤ 1 px or unitless) do not. */
export function literalNumbers(value: string, rule: LiteralRule): string[] {
  const out: string[] = []
  for (const m of tokensOut(value).matchAll(NUMBER_RE)) {
    const n = Number(m[1])
    const unit = m[2] ?? ''
    if (n === 0 || Number.isNaN(n)) continue
    if (rule !== 'literal/z-index' && Math.abs(n) <= 1 && unit !== 'rem' && unit !== 'em') continue
    if (rule === 'literal/font-size' && unit === '' && /\//.test(value) && n < 3) continue
    out.push(`${m[1]}${unit}`)
  }
  return out
}

function declarationFindings(line: string, lineNo: number): LineFinding[] {
  const out: LineFinding[] = []
  for (const m of line.matchAll(PROP_RE)) {
    const prop = m[1] as string
    const rule = RULE_OF.get(prop) as LiteralRule
    const value = valueAt(line, m.index + m[0].length)
    // `font:` only counts with a unit, so `font: font.mono` or a weight never does.
    const nums = literalNumbers(value, rule).filter((v) => prop !== 'font' || /(px|rem|em)$/.test(v))
    if (rule === 'literal/shadow') {
      if (nums.length > 0) out.push({ line: lineNo, rule, detail: `${prop}: ${value.trim()}` })
      continue
    }
    for (const v of nums) out.push({ line: lineNo, rule, detail: `${prop}: ${v}` })
  }
  return out
}

function colorFindings(line: string, lineNo: number): LineFinding[] {
  const out: LineFinding[] = []
  const text = tokensOut(line)
  for (const m of text.matchAll(HEX_RE)) {
    const before = text.slice(Math.max(0, m.index - 8), m.index)
    if (/(?:href|id|to|hash)\s*=\s*['"{]?$/.test(before)) continue
    // `#1042` in copy is a number, not a colour: a short hex of digits only is skipped.
    if (/^#\d{3,4}$/.test(m[0])) continue
    out.push({ line: lineNo, rule: 'literal/color', detail: m[0] })
  }
  for (const m of text.matchAll(COLOR_FN_RE)) out.push({ line: lineNo, rule: 'literal/color', detail: `${m[0]}…)` })
  return out
}

function mediaFindings(line: string, lineNo: number): LineFinding[] {
  const out: LineFinding[] = []
  for (const m of line.matchAll(MEDIA_RE)) {
    for (const px of tokensOut(m[0]).matchAll(/(\d+(?:\.\d+)?)px/g)) out.push({ line: lineNo, rule: 'literal/media', detail: `@media ${px[0]}` })
  }
  return out
}

/** Every literal in comment-blanked source, with 1-based line numbers. */
export function scanLiterals(blanked: string): LineFinding[] {
  const out: LineFinding[] = []
  const lines = blanked.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    if (!/[\d#]/.test(line)) continue
    out.push(...declarationFindings(line, i + 1), ...colorFindings(line, i + 1), ...mediaFindings(line, i + 1))
  }
  return out
}
