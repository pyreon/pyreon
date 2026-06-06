import { signal } from '@pyreon/reactivity'
import { createUniqueId, cx, onMount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'

// ─── <Mermaid> — mermaid-rendered diagram (PR-M audit M7) ─────────────────
//
// Renders a mermaid diagram source string as an SVG. mermaid is an
// OPTIONAL peer dependency — when absent the component falls back
// to a `<pre>` block so SSR / no-mermaid builds still surface the
// diagram source.
//
// Use via the `:::mermaid` block directive in markdown:
//
//     :::mermaid
//     graph TD
//       A --> B
//     :::
//
// Or directly in MDX / .tsx:
//
//     <Mermaid>{`graph TD\n  A --> B`}</Mermaid>

export interface MermaidProps {
  /** The mermaid source. */
  children?: string | VNodeChild
  /** Optional class name on the outer wrapper. */
  class?: string
  /** Optional id for the rendered SVG — defaults to a stable hash. */
  id?: string
}

interface MermaidModule {
  initialize?: (config: Record<string, unknown>) => void
  render: (id: string, src: string) => Promise<{ svg: string }>
}

export function Mermaid(props: MermaidProps): VNodeChild {
  const source = typeof props.children === 'string' ? props.children : ''
  const svg = signal<string | null>(null)

  onMount(() => {
    if (source.length === 0) return undefined
    if (typeof window === 'undefined') return undefined
    void (async () => {
      try {
        // mermaid is an OPTIONAL peer dep — runtime-constructed
        // specifier so build-time bundlers don't try to resolve it.
        const specifier = 'mermaid'
        const mod = (await import(/* @vite-ignore */ specifier)) as {
          default?: MermaidModule
        } & MermaidModule
        const mermaid = mod.default ?? mod
        mermaid.initialize?.({ startOnLoad: false })
        const id = props.id ?? `pyreon-mermaid-${createUniqueId()}`
        const result = await mermaid.render(id, source)
        svg.set(result.svg)
      } catch {
        // mermaid not installed — leave the fallback intact.
      }
    })()
    return undefined
  })

  return (
    <div
      class={() =>
        cx(['pyreon-mermaid', props.class])}
    >
      {() => {
        const rendered = svg()
        if (rendered !== null) {
          return (
            <div
              class="pyreon-mermaid__rendered"
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          )
        }
        return <pre class="pyreon-mermaid__source"><code>{source}</code></pre>
      }}
    </div>
  )
}
