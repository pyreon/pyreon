import { signal } from '@pyreon/reactivity'
import type { VNodeChild } from '@pyreon/core'

// ─── <CodeBlock> — Shiki-highlighted code wrapper ──────────────────────────
//
// Emitted by the markdown pipeline whenever Shiki highlighting is
// enabled. The actual `<pre><code>` markup is pre-rendered by Shiki
// (with the dual light/dark theme inlined) and inserted via
// `dangerouslySetInnerHTML`. This component wraps it so consumers can
// hook a "copy" button / language label / line-number overlay without
// the markdown pipeline knowing about them.
//
// Why dangerouslySetInnerHTML: Shiki emits a fully-formed
// `<pre class="shiki" style="background-color:...">...<code>...</code></pre>`
// with per-token <span> coloring. Round-tripping that through the
// mdast → JSX emitter would mean (a) parsing Shiki's output back to
// JSX nodes and (b) re-emitting them, doubling the work for no gain
// — the output is verbatim HTML, not a Pyreon component tree the
// runtime needs to reconcile.
//
// PR-H authoring features (M1+M2+M3+M12):
//
//   - `filename` — visible header above the rendered block
//   - `showLineNumbers` — renders a left-side gutter via CSS counter
//   - `highlightLines` — array of 1-based line numbers; the component
//     emits a `data-pyreon-highlight-lines` attribute consumers can
//     style with CSS
//   - `source` — original code text; powers the copy button
//   - `copyable` — opt-out flag (default true)
//   - `lineCount` — total lines, used to render the gutter

export interface CodeBlockProps {
  /** Detected language tag (`'typescript'`, `'bash'`, …). */
  lang?: string
  /** Optional filename / label shown above the block. */
  filename?: string
  /** Whether to render a line-number gutter. Default `false`. */
  showLineNumbers?: boolean
  /** 1-based line numbers to highlight. Empty / undefined → none. */
  highlightLines?: number[]
  /** Total line count of the source, drives the gutter render. */
  lineCount?: number
  /** Raw code text; powers the copy button. Omitted when `copyable === false`. */
  source?: string
  /** Whether to render a copy button. Default `true`. */
  copyable?: boolean
  /** Raw Shiki HTML output. */
  dangerouslySetInnerHTML: { __html: string }
}

export function CodeBlock(props: CodeBlockProps): VNodeChild {
  const lang = props.lang ?? 'text'
  const copyable = props.copyable !== false && typeof props.source === 'string'
  const showLineNumbers = props.showLineNumbers === true
  const lineCount = typeof props.lineCount === 'number' ? props.lineCount : 0
  const highlightLines = props.highlightLines ?? []

  // Reactive copied-state for the button label flip. The copy handler
  // runs only in the browser; SSR renders the initial "Copy" label.
  const copied = signal(false)

  const handleCopy = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    if (typeof props.source !== 'string') return
    navigator.clipboard
      .writeText(props.source)
      .then(() => {
        copied.set(true)
        // Reset after 2s — matches `@pyreon/hooks:useClipboard`
        // convention.
        setTimeout(() => copied.set(false), 2000)
      })
      .catch(() => {
        // Clipboard rejection (permissions, secure-context) — silently
        // no-op so a click in an insecure context doesn't crash.
      })
  }

  // Gutter line numbers: render 1..N spans so CSS counter is
  // structural — no need to re-flow the Shiki HTML.
  const gutter: VNodeChild[] = []
  if (showLineNumbers && lineCount > 0) {
    for (let i = 1; i <= lineCount; i++) {
      gutter.push(<span class="code-block__line-number">{i}</span>)
    }
  }

  // Highlight lines are emitted as a data-* so CSS can target them
  // without the component knowing about the rendered DOM structure.
  // Stable JSON encoding so the attribute stays comparable for HMR.
  const highlightAttr =
    highlightLines.length > 0 ? highlightLines.join(',') : undefined

  return (
    <div
      class="code-block"
      data-lang={lang}
      data-pyreon-copyable={copyable ? 'true' : undefined}
      data-pyreon-highlight-lines={highlightAttr}
    >
      {props.filename && (
        <div class="code-block__header">
          <span class="code-block__filename" aria-hidden="true">
            {props.filename}
          </span>
        </div>
      )}
      <div class="code-block__body">
        {showLineNumbers && (
          <div class="code-block__gutter" aria-hidden="true">
            {gutter}
          </div>
        )}
        <div
          class="code-block__pre"
          dangerouslySetInnerHTML={props.dangerouslySetInnerHTML}
        />
        {copyable && (
          <button
            type="button"
            class="code-block__copy"
            aria-label="Copy code"
            data-copied={() => (copied() ? 'true' : undefined)}
            onClick={handleCopy}
          >
            {() => (copied() ? 'Copied' : 'Copy')}
          </button>
        )}
      </div>
    </div>
  )
}
