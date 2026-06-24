import { signal } from '@pyreon/reactivity'
import { onUnmount } from '@pyreon/core'
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
  // Track the reset timer so it can be cleared on unmount. Without
  // this, navigating away within 2s of a copy click leaves a pending
  // `setTimeout` that fires on a disposed signal (silent no-op today
  // but classic Class-I leak shape — see anti-patterns.md). Capture
  // + clear is idempotent: re-clicking copy clears the prior timer
  // before scheduling a new one.
  let _resetTimer: ReturnType<typeof setTimeout> | null = null
  onUnmount(() => {
    if (_resetTimer !== null) clearTimeout(_resetTimer)
  })

  const handleCopy = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    if (typeof props.source !== 'string') return
    navigator.clipboard
      .writeText(props.source)
      .then(() => {
        copied.set(true)
        // Reset after 2s — matches `@pyreon/hooks:useClipboard`
        // convention. Clear any in-flight timer so a quick second
        // click restarts the 2s window cleanly.
        if (_resetTimer !== null) clearTimeout(_resetTimer)
        _resetTimer = setTimeout(() => {
          copied.set(false)
          _resetTimer = null
        }, 2000)
      })
      .catch(() => {
        // Clipboard rejection (permissions, secure-context) — silently
        // no-op so a click in an insecure context doesn't crash.
      })
  }

  // Gutter line numbers (1..N). Built as an HTML STRING and set via
  // `dangerouslySetInnerHTML` — mirroring how `code-block__pre` carries the
  // Shiki output. This is deliberate, not lazy:
  //   - A bare array-typed VNode child (`{gutter}` / `{() => gutter}`) is baked
  //     to `textContent` by the compiler's sole-dynamic-child heuristic, which
  //     stringifies the span VNodes to `[object Object]`.
  //   - A `<For>` (component child) renders correctly BUT forces the compiler to
  //     drop the whole-tree `_tpl` fusion in favour of `h()` composition — that
  //     would de-optimise EVERY code block (the overwhelmingly common no-line-
  //     numbers case) to fix the rare one.
  // An innerHTML string keeps the gutter a static template element (single
  // cloneNode preserved) and renders the numbers as real spans. The content is
  // a fixed template over integers we generate, so there is no XSS surface.
  const gutterHtml =
    showLineNumbers && lineCount > 0
      ? Array.from(
          { length: lineCount },
          (_, i) => `<span class="code-block__line-number">${i + 1}</span>`,
        ).join('')
      : ''

  // Highlight lines are emitted as a data-* so CSS can target them
  // without the component knowing about the rendered DOM structure.
  // Stable JSON encoding so the attribute stays comparable for HMR.
  const highlightAttr =
    highlightLines.length > 0 ? highlightLines.join(',') : undefined

  // STRUCTURE NOTE — the header + gutter wrappers are ALWAYS rendered (an
  // `--empty` modifier class hides them via CSS when they have no content)
  // rather than `{cond && <wrapper>}`. This is load-bearing, not cosmetic: a
  // conditional wrapper child compiles to a `_mountSlot` placeholder, and the
  // compiler's static-element refs for the later siblings (`code-block__body`,
  // `code-block__pre`) are computed by `.firstElementChild.nextElementSibling`
  // walks emitted AFTER those slots. On a fresh client mount (e.g. SPA navigation)
  // an empty slot removes its `<!>` placeholder, the walk lands on the wrong node,
  // and the copy-button slot's parent becomes a Comment node →
  // `HierarchyRequestError: insertBefore … node type does not support this method`
  // (the docs code blocks render broken after navigating in). Keeping the wrappers
  // static means no `_mountSlot` precedes a ref'd element, so the refs stay valid.
  // (Underlying compiler bug — interleaved `__eN` refs + `_mountSlot` — tracked in
  // .claude/rules/anti-patterns.md; this is the local, backend-agnostic fix.)
  //
  // The empty-state is expressed as a STATIC, prop-derived class (not a dynamic
  // `hidden` attribute): `filename` / `showLineNumbers` are fixed per instance,
  // and the compiled template path emits a raw `el.setAttribute("hidden", value)`
  // with no boolean-attr guard — so `hidden={false}` would set `hidden="false"`
  // (attribute PRESENT → still hidden). A className is normalized correctly.
  const headerClass = props.filename
    ? 'code-block__header'
    : 'code-block__header code-block__header--empty'
  const gutterClass =
    showLineNumbers && lineCount > 0
      ? 'code-block__gutter'
      : 'code-block__gutter code-block__gutter--empty'

  return (
    <div
      class="code-block"
      data-lang={lang}
      data-pyreon-copyable={copyable ? 'true' : undefined}
      data-pyreon-highlight-lines={highlightAttr}
    >
      <div class={headerClass}>
        {props.filename && (
          <span class="code-block__filename" aria-hidden="true">
            {props.filename}
          </span>
        )}
      </div>
      <div class="code-block__body">
        <div
          class={gutterClass}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: gutterHtml }}
        />
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
