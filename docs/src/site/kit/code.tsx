import { For, Show } from '@pyreon/core'
import { diff, font, gradient, radius, syntax, text, weight } from '../theme'
import { el, focusRing, pair, tone, txt } from './bases'
import { GlowCard } from './cards'
import { AutoGrid } from './layout'
import { Eyebrow, renderInline, VisuallyHidden } from './type'

/**
 * Code surfaces. Code is highlighted at BUILD time (vite-plugins/product-content.ts
 * runs Shiki on content JSON; `html` is its output, with per-token
 * `--shiki-light` / `--shiki-dark` variables). The kit picks the variable by
 * the page theme, so no highlighter ships to the browser. Without `html` the
 * code renders as plain text in the theme's foreground colour.
 */
const CodeHead = el
  .config({ name: 'CodeHead' })
  .attrs({ block: true, gap: 6 })
  .theme((_t, m) => ({
    paddingTop: 18,
    paddingBottom: 16,
    paddingLeft: { xs: 20, sm: 26 },
    paddingRight: { xs: 20, sm: 26 },
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
  }))

const Caption = txt
  .config({ name: 'CodeCaption' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    fontFamily: font.sans,
    fontSize: text.small.size,
    lineHeight: text.small.lineHeight,
    color: tone(m, 'mist'),
  }))

const shikiCss = `
  & pre { margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent !important; overflow: visible; font: inherit; }
  & pre code { font: inherit; background: none; padding: 0; border: 0; }
  & span { color: var(--shiki-light); font-style: var(--shiki-light-font-style, inherit); }
  [data-theme='dark'] & span { color: var(--shiki-dark); font-style: var(--shiki-dark-font-style, inherit); }
`

const CodeBody = el
  .config({ name: 'CodeBody' })
  .attrs({ block: true, tag: 'div' })
  .theme((_t, m) => ({
    minWidth: 0,
    margin: 0,
    paddingTop: 22,
    paddingBottom: 22,
    paddingLeft: { xs: 20, sm: 26 },
    paddingRight: { xs: 20, sm: 26 },
    overflowX: 'auto',
    fontFamily: font.mono,
    fontSize: text.code.size,
    lineHeight: text.code.lineHeight,
    whiteSpace: 'pre',
    color: m(syntax.light.fg, syntax.dark.fg),
    borderRadius: 4,
    focus: focusRing(m),
    extendCss: shikiCss,
  }))

/**
 * The code itself: Shiki HTML when there is some, else the plain text. The
 * box scrolls on its own (never the page) and is focusable, so keyboard users
 * can scroll it; it is labelled by its card's eyebrow.
 */
export function CodeBlock(props: { code: string; html?: string | undefined; label?: string | undefined }) {
  if (props.html) {
    // Build-time Shiki output of repo-owned content (vite-plugins/product-content.ts).
    return <CodeBody tag="section" tabIndex={0} aria-label={props.label ?? 'Code'} dangerouslySetInnerHTML={{ __html: props.html }} />
  }
  return (
    <CodeBody tag="pre" tabIndex={0} aria-label={props.label ?? 'Code'}>
      <code>{props.code}</code>
    </CodeBody>
  )
}

const Rail = el
  .config({ name: 'CodeRail' })
  .attrs({ block: true, contentAlignX: 'block', contentAlignY: 'top' })
  .theme(() => ({ minWidth: 0 }))
  .states((_t, m) => ({
    none: {},
    del: { boxShadow: `inset 4px 0 0 ${pair(m, diff.delBar)}` },
    ins: { boxShadow: `inset 4px 0 0 ${pair(m, diff.insBar)}` },
  }))

/**
 * `.lx-code` — a code card: label, optional caption, highlighted code.
 * state: default | hot. rail: a 4px plasma (del) or cyan (ins) edge, for
 * before/after pairs (C2 at page scale).
 */
export function CodeCard(props: {
  label: string
  caption?: string | undefined
  code: string
  html?: string | undefined
  state?: 'default' | 'hot' | undefined
  rail?: 'none' | 'del' | 'ins' | undefined
}) {
  return (
    <GlowCard state={props.state} padding="flush">
      <Rail state={props.rail ?? 'none'}>
        <CodeHead>
          <Eyebrow state={props.state === 'hot' ? 'accent' : 'default'}>{props.label}</Eyebrow>
          <Show when={() => !!props.caption}>
            <Caption>{renderInline(props.caption ?? '')}</Caption>
          </Show>
        </CodeHead>
        <CodeBlock code={props.code} html={props.html} label={props.label} />
      </Rail>
    </GlowCard>
  )
}

/** `.p-ps` — before / after, side by side from 960px; "after" is the hot card. */
export function BeforeAfter(props: {
  before: { label: string; caption: string; code: string; codeHtml?: string | undefined }
  after: { label: string; caption: string; code: string; codeHtml?: string | undefined }
}) {
  return (
    <AutoGrid cols={2} gap={16}>
      <CodeCard label={props.before.label} caption={props.before.caption} code={props.before.code} html={props.before.codeHtml} rail="del" />
      <CodeCard label={props.after.label} caption={props.after.caption} code={props.after.code} html={props.after.codeHtml} state="hot" rail="ins" />
    </AutoGrid>
  )
}

// ─── CodeDiff (C2) ────────────────────────────────────────────────────────

export type DiffRow = readonly ['-' | '+' | ' ', string]

const DiffPane = el
  .config({ name: 'CodeDiff' })
  .attrs({ tag: 'ul', block: true })
  .theme((_t, m) => ({
    listStyle: 'none',
    margin: 0,
    minWidth: 0,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 0,
    paddingRight: 0,
    overflowX: 'auto',
    borderRadius: radius.pane,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: m(syntax.light.bg, syntax.dark.bg),
    fontFamily: font.mono,
    fontSize: { xs: 12, md: 14 },
    lineHeight: 1.55,
    focus: focusRing(m),
    extendCss: 'font-variant-ligatures: none;',
  }))

const DiffLine = el
  .config({ name: 'CodeDiffLine' })
  // A row, not a column: Element stacks its children by default, which put
  // the sign above the code.
  .attrs({ tag: 'li', block: true, contentDirection: 'inline', contentAlignX: 'left', contentAlignY: 'top' })
  .theme((_t, m) => ({
    minWidth: 'max-content',
    paddingTop: { xs: 5, md: 6 },
    paddingBottom: { xs: 5, md: 6 },
    paddingLeft: { xs: 14, md: 22 },
    paddingRight: { xs: 14, md: 22 },
    whiteSpace: 'pre',
    borderLeft: '4px solid transparent',
    color: m(syntax.light.fg, syntax.dark.fg),
  }))
  .states((_t, m) => ({
    same: {},
    del: { backgroundColor: pair(m, diff.delBg), borderLeftColor: pair(m, diff.delBar), color: pair(m, diff.delText) },
    ins: { backgroundColor: pair(m, diff.insBg), borderLeftColor: pair(m, diff.insBar), color: pair(m, diff.insText) },
  }))

const DiffSign = txt
  .config({ name: 'CodeDiffSign' })
  .attrs({ tag: 'span' })
  .theme(() => ({ display: 'inline-block', width: '2ch', userSelect: 'none' }))

const DiffCaption = txt
  .config({ name: 'CodeDiffCaption' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    marginTop: 24,
    fontFamily: font.sans,
    fontSize: 'clamp(20px, 1.9vw, 26px)',
    lineHeight: 1.25,
    letterSpacing: '-.02em',
    fontWeight: weight.bold,
    color: tone(m, 'strong'),
  }))

const Payoff = txt
  .config({ name: 'CodeDiffPayoff' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    backgroundImage: pair(m, gradient.ember),
    backgroundClip: 'text',
    color: 'transparent',
    extendCss: '-webkit-background-clip: text; -webkit-box-decoration-break: clone; box-decoration-break: clone;',
  }))

/** Count of removed and added lines. */
export function diffStats(rows: readonly DiffRow[]): { removed: number; added: number } {
  let removed = 0
  let added = 0
  for (const [k] of rows) {
    if (k === '-') removed++
    else if (k === '+') added++
  }
  return { removed, added }
}

/** The caption's last sentence is the payoff, set in the display gradient. */
export function splitPayoff(caption: string): [string, string] {
  const t = caption.trim()
  const i = t.lastIndexOf('. ', t.length - 2)
  if (i < 0) return ['', t]
  return [t.slice(0, i + 2), t.slice(i + 2)]
}

/**
 * "The code you delete" (C2): rows with a 4px rail, a real `−`/`+` sign and
 * a screen-reader prefix (so it never reads by colour alone), then the
 * caption with its payoff in the display gradient. The pane scrolls inside
 * itself on phones; there is no copy button (it is not runnable on its own).
 */
export function CodeDiff(props: { rows: readonly DiffRow[]; caption?: string | undefined; label?: string | undefined }) {
  const [lead, payoff] = splitPayoff(props.caption ?? '')
  const rows = props.rows.map((r, i) => ({ r, i }))
  return (
    // min-width 0: the rows are max-content wide, and in a flex or grid parent
    // this box would otherwise grow to them instead of letting the pane scroll.
    <div style="min-width:0;max-width:100%">
      <DiffPane tabIndex={0} aria-label={props.label ?? 'Code diff: removed and added lines'}>
        <For each={rows} by={(x) => x.i}>
          {({ r }) => (
            <DiffLine state={r[0] === '-' ? 'del' : r[0] === '+' ? 'ins' : 'same'}>
              <DiffSign aria-hidden="true">{r[0] === '-' ? '−' : r[0] === '+' ? '+' : ' '}</DiffSign>
              {r[0] === '-' ? <VisuallyHidden>removed: </VisuallyHidden> : r[0] === '+' ? <VisuallyHidden>added: </VisuallyHidden> : null}
              {r[1]}
            </DiffLine>
          )}
        </For>
      </DiffPane>
      <Show when={() => !!props.caption}>
        <DiffCaption>
          {lead}
          <Payoff>{payoff}</Payoff>
        </DiffCaption>
      </Show>
    </div>
  )
}

// ─── ComingFrom ───────────────────────────────────────────────────────────

/** "Coming from X?" — the same thing in the library you use today and in Pyreon. */
export function ComingFrom(props: {
  lib: string
  before: string
  after: string
  beforeHtml?: string | undefined
  afterHtml?: string | undefined
  note?: string | undefined
}) {
  return (
    <AutoGrid cols={2} gap={16}>
      <CodeCard label={props.lib} code={props.before} html={props.beforeHtml} rail="del" />
      <CodeCard label="Pyreon" caption={props.note} code={props.after} html={props.afterHtml} state="hot" rail="ins" />
    </AutoGrid>
  )
}
