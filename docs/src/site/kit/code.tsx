import { For, Show } from '@pyreon/core'
import { diff, font, radius, syntax, text, weight } from '../theme'
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
  & pre { margin: 0; padding: 0; background: transparent !important; overflow: visible; font: inherit; }
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

/** `.lx-code` — a code card: label, optional caption, highlighted code. state: default | hot. */
export function CodeCard(props: {
  label: string
  caption?: string | undefined
  code: string
  html?: string | undefined
  state?: 'default' | 'hot' | undefined
}) {
  return (
    <GlowCard state={props.state} padding="flush">
      <CodeHead>
        <Eyebrow state={props.state === 'hot' ? 'accent' : 'default'}>{props.label}</Eyebrow>
        <Show when={() => !!props.caption}>
          <Caption>{renderInline(props.caption ?? '')}</Caption>
        </Show>
      </CodeHead>
      <CodeBlock code={props.code} html={props.html} label={props.label} />
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
      <CodeCard label={props.before.label} caption={props.before.caption} code={props.before.code} html={props.before.codeHtml} />
      <CodeCard label={props.after.label} caption={props.after.caption} code={props.after.code} html={props.after.codeHtml} state="hot" />
    </AutoGrid>
  )
}

// ─── CodeDiff ────────────────────────────────────────────────────────────

export type DiffRow = readonly ['-' | '+' | ' ', string]

const DiffBox = el
  .config({ name: 'CodeDiff' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    minWidth: 0,
    borderRadius: radius.pane,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
    overflow: 'hidden',
  }))

const DiffLines = el
  .config({ name: 'CodeDiffLines' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({
    listStyle: 'none',
    margin: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 14,
    paddingBottom: 14,
    overflowX: 'auto',
    fontFamily: font.mono,
    fontSize: text.code.size,
    lineHeight: text.code.lineHeight,
  }))

const DiffLine = el
  .config({ name: 'CodeDiffLine' })
  .attrs({ tag: 'li', block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gridTemplateColumns: '28px max-content',
    minWidth: 'max-content',
    paddingRight: 20,
    whiteSpace: 'pre',
    borderLeft: '3px solid transparent',
    color: m(syntax.light.fg, syntax.dark.fg),
  }))
  .states((_t, m) => ({
    same: {},
    del: { backgroundColor: pair(m, diff.delBg), borderLeftColor: pair(m, diff.delBar), color: pair(m, diff.delText), textDecoration: 'line-through', extendCss: 'text-decoration-thickness: 1px;' },
    ins: { backgroundColor: pair(m, diff.insBg), borderLeftColor: pair(m, diff.insBar), color: pair(m, diff.insText) },
  }))

const DiffSign = txt
  .config({ name: 'CodeDiffSign' })
  .attrs({ tag: 'span' })
  .theme(() => ({ textAlign: 'center', userSelect: 'none', fontWeight: weight.medium }))

const DiffFoot = el
  .config({ name: 'CodeDiffFoot' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', gap: 12 })
  .theme((_t, m) => ({
    flexWrap: 'wrap',
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 20,
    paddingRight: 20,
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.mono,
    fontSize: text.caveat.size,
    color: tone(m, 'fog'),
  }))

/** Count of removed and added lines, for the caption. */
export function diffStats(rows: readonly DiffRow[]): { removed: number; added: number } {
  let removed = 0
  let added = 0
  for (const [k] of rows) {
    if (k === '-') removed++
    else if (k === '+') added++
  }
  return { removed, added }
}

/**
 * "The code you delete" — removed lines struck through on plasma, added lines
 * on cyan, from the marketing cards (G-once-code-diff). Removed/added is
 * carried by the sign column and a screen-reader prefix, never colour alone.
 */
export function CodeDiff(props: { rows: readonly DiffRow[]; label?: string | undefined; caption?: string | undefined }) {
  const stats = diffStats(props.rows)
  return (
    <DiffBox>
      <DiffLines aria-label={props.label ?? 'Code diff'} tabIndex={0}>
        <For each={props.rows.map((r, i) => ({ r, i }))} by={(x) => x.i}>
          {({ r }) => (
            <DiffLine state={r[0] === '-' ? 'del' : r[0] === '+' ? 'ins' : 'same'}>
              <DiffSign aria-hidden="true">{r[0] === ' ' ? '' : r[0] === '-' ? '−' : '+'}</DiffSign>
              <span>
                {r[0] === '-' ? <VisuallyHidden>removed: </VisuallyHidden> : r[0] === '+' ? <VisuallyHidden>added: </VisuallyHidden> : null}
                {r[1]}
              </span>
            </DiffLine>
          )}
        </For>
      </DiffLines>
      <DiffFoot>
        <span>{props.caption ?? ''}</span>
        <span>{`−${stats.removed} +${stats.added}`}</span>
      </DiffFoot>
    </DiffBox>
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
      <CodeCard label={props.lib} code={props.before} html={props.beforeHtml} />
      <CodeCard label="Pyreon" caption={props.note} code={props.after} html={props.afterHtml} state="hot" />
    </AutoGrid>
  )
}
