import { color, diff, font, gradient, palette, radius, syntax, verdict, type Tone } from '../site/theme'

/**
 * The docs reading shell's tokens.
 *
 * Every colour, font and radius comes from `site/theme.ts` (the one file with
 * hex values); this module only names them for the docs stylesheet
 * (`styles/docs-v3.css`), which reads them as `var(--dx-…)` custom properties.
 * The docs layout renders `DOCS_VARS_CSS` once into the page head, so the
 * stylesheet itself carries no colour of its own and a dark/light flip is the
 * same single `data-theme` write the marketing site uses.
 *
 * Why a stylesheet and not kit components for the docs: ~220 Markdown pages
 * render through the same prose rules, and the reading shell must not add
 * JavaScript to a page (the docs budget is "no growth"). Plain class names on
 * real elements cost no runtime; the selling slots inside a page use the kit.
 */

/** Docs layout (visual-alignment.md §D). The stylesheet's media queries use these numbers; `tokens.test.ts` keeps them in step. */
export const docsLayout = {
  sidebar: 264,
  /** Sidebar column width between the drawer and the rail breakpoints. */
  sidebarNarrow: 240,
  content: 780,
  rail: 232,
  gap: 48,
  max: 1440,
  /** Top padding under the floating nav. */
  top: 96,
  /** Below this the right rail hides and its TOC moves under the title. */
  railBreak: 1180,
  /** Below this the sidebar becomes the "Browse docs" drawer. */
  drawerBreak: 960,
  /** At or below this the content padding is 16px and code drops to 12px. */
  narrow: 640,
  /** Anchor offset under the fixed nav. */
  scrollMargin: 90,
  /** Code blocks and the docs cards (§D "Code blocks"). */
  codeRadius: 18,
} as const

/** The code well: ink in dark, the paper well in light (§D "Code blocks"). */
const codeBg: Tone = { dark: palette.ink[1], light: palette.paper[1] }

type VarMap = Record<string, Tone | string>

/** Name → value (a `Tone` flips with the theme; a string is the same in both). */
export const DOCS_VARS: VarMap = {
  bg: color.bg,
  card: color.card,
  raised: color.raised,
  well: color.well,
  'code-bg': codeBg,
  line: color.line,
  line2: color.line2,
  'line-hover': color.lineHover,
  'edge-a': color.edgeA,
  'edge-b': color.edgeB,
  sheen: color.sheen,
  glow: color.glow,
  glass: color.glass,
  panel: color.panel,
  'hover-fill': color.hoverFill,
  shadow: color.shadow,
  'card-shadow': color.cardShadow,
  text: color.text,
  strong: color.strong,
  mist: color.mist,
  fog: color.fog,
  accent: color.accent,
  'accent-text': color.accentText,
  'warm-text': color.warmText,
  ok: color.ok,
  warn: color.warn,
  err: color.err,
  link: color.link,
  prompt: color.prompt,
  focus: color.focus,
  selection: color.selection,
  'solid-bg': color.solidBg,
  'solid-text': color.solidText,
  'current-fill': color.currentFill,
  'current-border': color.currentBorder,
  ember: gradient.ember,
  'win-fill': verdict.winFill,
  'win-text': verdict.winText,
  tie: verdict.tie,
  split: verdict.split,
  loss: verdict.loss,
  info: verdict.info,
  experimental: verdict.experimental,
  'del-bar': diff.delBar,
  'del-bg': diff.delBg,
  'ins-bar': diff.insBar,
  'ins-bg': diff.insBg,
  's-kw': { dark: syntax.dark.kw, light: syntax.light.kw },
  's-str': { dark: syntax.dark.str, light: syntax.light.str },
  's-num': { dark: syntax.dark.num, light: syntax.light.num },
  's-fn': { dark: syntax.dark.fn, light: syntax.light.fn },
  's-type': { dark: syntax.dark.type, light: syntax.light.type },
  's-com': { dark: syntax.dark.com, light: syntax.light.com },
  's-punct': { dark: syntax.dark.punct, light: syntax.light.punct },
  's-fg': { dark: syntax.dark.fg, light: syntax.light.fg },
  sans: font.sans,
  mono: font.mono,
  'r-card': `${radius.card}px`,
  'r-code': `${docsLayout.codeRadius}px`,
  'r-pane': `${radius.pane}px`,
  'r-note': `${radius.note}px`,
  'r-control': `${radius.control}px`,
  'r-pill': `${radius.pill}px`,
}

const isTone = (v: Tone | string): v is Tone => typeof v === 'object'

/** `:root{…}` for dark (the default) plus the `[data-theme="light"]` overrides. Pure; exported for tests. */
export function renderDocsVars(vars: VarMap = DOCS_VARS): string {
  const dark: string[] = []
  const light: string[] = []
  for (const [name, value] of Object.entries(vars)) {
    if (isTone(value)) {
      dark.push(`--dx-${name}:${value.dark}`)
      if (value.light !== value.dark) light.push(`--dx-${name}:${value.light}`)
    } else {
      dark.push(`--dx-${name}:${value}`)
    }
  }
  return `:root{${dark.join(';')}}:root[data-theme="light"]{${light.join(';')}}`
}

export const DOCS_VARS_CSS = renderDocsVars()
