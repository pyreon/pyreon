/**
 * Built-in panels whose BODY loads on first open.
 *
 * Twelve of the thirteen tabs are closed on any given visit, and most of them
 * are the heavy ones (the role cards, the graph readers, the Lens). Their
 * tab metadata — id, title, hint — stays in the main bundle so the strip and
 * `?p=` links work before anything loads; the body is a separate chunk,
 * fetched the first time the tab opens and reused after.
 *
 * Memory (anti-patterns "Memory Leak Classes"): each lazy panel holds at most
 * ONE loaded render and one in-flight promise, bounded by the panel count. A
 * failed load clears the promise (class F), so reopening the tab retries.
 */
import { untrack, signal } from '@pyreon/reactivity'
import * as C from '../../components'
import type { AddonPanelDef, AddonPanelRender } from '../../panels'

export function lazyPanel(
  meta: { id: string; title: string; hint: string },
  load: () => Promise<{ render: AddonPanelRender }>,
): AddonPanelDef {
  let loaded: AddonPanelRender | null = null
  let pending: Promise<AddonPanelRender> | null = null
  const get = (): Promise<AddonPanelRender> => {
    pending ??= load().then(
      (mod) => (loaded = mod.render),
      (err: unknown) => {
        pending = null
        throw err
      },
    )
    return pending
  }
  return {
    ...meta,
    render: (model) => {
      if (loaded) return loaded(model)
      const body = signal<AddonPanelRender | null>(null)
      const failed = signal<string | null>(null)
      // Built ONCE per render call. The shell keeps a panel's node across tab
      // switches by re-mounting it, so the body must be the same node every
      // time — building it in the accessor anew would drop a recording in
      // progress (Perf, Reactive coverage) on every switch.
      let built: ReturnType<AddonPanelRender> | null = null
      get().then(
        (render) => body.set(render),
        (err: unknown) => failed.set(err instanceof Error ? err.message : String(err)),
      )
      return (
        <>
          {() => {
            const render = body()
            // Built untracked: the body's own setup reads must not subscribe
            // this accessor, or a signal it reads would rebuild the panel.
            if (render) {
              built ??= untrack(() => render(model))
              return built
            }
            const reason = failed()
            if (reason !== null) {
              return (
                <C.ActionsEmpty data-testid="panel-load-error" role="alert">
                  {`The ${meta.title} panel failed to load (${reason}). Open the tab again to retry.`}
                </C.ActionsEmpty>
              )
            }
            return (
              <C.ActionsEmpty data-testid="panel-loading" aria-live="polite">
                {`Loading ${meta.title}…`}
              </C.ActionsEmpty>
            )
          }}
        </>
      )
    },
  }
}
