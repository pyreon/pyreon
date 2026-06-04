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

export interface CodeBlockProps {
  /** Detected language tag (`'typescript'`, `'bash'`, …). */
  lang?: string
  /** Optional filename / label shown above the block. */
  filename?: string
  /** Raw Shiki HTML output. */
  dangerouslySetInnerHTML: { __html: string }
}

export function CodeBlock(props: CodeBlockProps): VNodeChild {
  const lang = props.lang ?? 'text'
  return (
    <div class="code-block" data-lang={lang}>
      {props.filename && (
        <div class="code-block__filename" aria-hidden="true">
          {props.filename}
        </div>
      )}
      <div
        class="code-block__pre"
        dangerouslySetInnerHTML={props.dangerouslySetInnerHTML}
      />
    </div>
  )
}
