import { isServer, signal } from '@pyreon/reactivity'
import { cx, onMount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'

// ─── <Math> — KaTeX-rendered formula (PR-M audit M6) ──────────────────────
//
// Renders a LaTeX expression as math. KaTeX is an OPTIONAL peer
// dependency — when absent the component falls back to a `<code>`
// element so SSR / no-KaTeX builds still surface the source.
//
// Use via the `:::math` block directive in markdown:
//
//     :::math
//     E = mc^2
//     :::
//
// Or directly in MDX / .tsx:
//
//     <Math>E = mc^2</Math>
//
// `inline={true}` renders in display:inline mode (`renderToString`
// with `displayMode: false`).

export interface MathProps {
  /** The LaTeX source. */
  children?: string | VNodeChild
  /** Render inline (default `false` = display block). */
  inline?: boolean
  /** Optional class name on the outer wrapper. */
  class?: string
}

interface KatexModule {
  renderToString: (
    source: string,
    options?: { displayMode?: boolean; throwOnError?: boolean },
  ) => string
}

export function Math(props: MathProps): VNodeChild {
  const source = typeof props.children === 'string' ? props.children : ''
  const html = signal<string | null>(null)

  onMount(() => {
    if (source.length === 0) return undefined
    if (isServer) return undefined
    // Dynamic import — KaTeX ships in the user's bundle ONLY when this
    // component mounts on the client. SSR (or no-KaTeX builds)
    // gracefully fall back to a `<code>` element.
    void (async () => {
      try {
        // KaTeX is an OPTIONAL peer dep — when absent the import
        // rejects at runtime and we fall through to the source code
        // fallback. The specifier is constructed at runtime so
        // build-time bundlers don't try to resolve it.
        const specifier = 'katex'
        const mod = (await import(/* @vite-ignore */ specifier)) as {
          default?: KatexModule
        } & KatexModule
        const katex = mod.default ?? mod
        const rendered = katex.renderToString(source, {
          displayMode: !props.inline,
          throwOnError: false,
        })
        html.set(rendered)
      } catch {
        // KaTeX not installed — leave the fallback intact.
      }
    })()
    return undefined
  })

  return (
    <span
      class={() =>
        cx(['pyreon-math', props.inline && 'pyreon-math--inline', props.class])}
    >
      {() => {
        const rendered = html()
        if (rendered !== null) {
          return (
            <span
              class="pyreon-math__rendered"
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          )
        }
        return <code class="pyreon-math__source">{source}</code>
      }}
    </span>
  )
}
