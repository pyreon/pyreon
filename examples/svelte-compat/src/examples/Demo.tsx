/**
 * Stateless demo shell — one `section.demo` per instance (the e2e gate
 * counts these). Deliberately state-free: per-instance UI state would
 * need a hook-indexed store, but the canonical Svelte pattern (and what
 * every demo here uses) is a MODULE-scope store that persists across the
 * compat wrapper's teardown+rebuild re-renders. The `code` prop is kept
 * for call-site documentation but not rendered (no toggle state needed).
 */
export default function Demo(props: {
  title: string
  apis: string
  code?: string
  children?: unknown
}) {
  return (
    <section class="demo">
      <div class="demo-header">
        <h2>{props.title}</h2>
        <div class="demo-meta">
          <span class="api-tags">{props.apis}</span>
        </div>
      </div>
      {props.children as never}
    </section>
  )
}
