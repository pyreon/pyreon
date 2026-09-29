import { signal } from '@pyreon/reactivity'
import { h } from './h'
import { useContext } from './context'
import { type LazyComponent, SuspenseBoundaryContext } from './suspense'
import type { ComponentFn, Props, VNodeChild } from './types'

/**
 * Stands where a lazy whose chunk failed AFTER it mounted was: its setup
 * throws, so the error reaches the nearest `<ErrorBoundary>` exactly like any
 * component that throws while mounting. A throw from the render accessor
 * itself would surface as an effect error instead.
 */
function LazyLoadError(props: { error: Error }): VNodeChild {
  throw props.error
}

export function lazy<P extends object>(
  load: () => Promise<{ default: ComponentFn<P> }>,
): LazyComponent<P> {
  const loaded = signal<ComponentFn<P> | null>(null)
  const error = signal<Error | null>(null)

  // Settles (never rejects) once the chunk has loaded OR failed — the failure is
  // surfaced by the wrapper throwing on its next render, not by this promise.
  // Kept so the SSR renderers can WAIT for a chunk that has not landed yet
  // instead of rendering the still-loading wrapper as nothing (see `__load`),
  // and so hydration can DEFER a still-loading lazy's server range until it has.
  const settled: Promise<void> = load().then(
    (m) => loaded.set(m.default),
    (e: unknown) => error.set(e instanceof Error ? e : new Error(String(e))),
  )

  const wrapper = ((props: P) => {
    // Already failed at setup: throw synchronously, so a `<Suspense>` /
    // `<ErrorBoundary>` / `renderToString` sees it the way it sees any
    // component that throws while rendering.
    const err = error()
    if (err) throw err
    // Still loading below a `<Suspense>`: register with the NEAREST boundary,
    // wherever it is above — not only as its direct child — so it shows its
    // fallback until this chunk lands (the React / Vue model).
    if (loaded() === null) useContext(SuspenseBoundaryContext)?.register(settled)
    // Otherwise render REACTIVELY. A component body runs once, so reading
    // `loaded()` here (as this used to) rendered a lazy mounted while its chunk
    // was loading as nothing FOREVER — only a `<Suspense>` re-running its own
    // accessor ever showed it. The accessor also gives the output a stable
    // server range (`<!--$-->…<!--/$-->`) whatever the chunk renders, which is
    // what lets hydration keep that range while the client chunk is loading.
    return () => {
      const e = error()
      if (e) return h(LazyLoadError, { error: e })
      const comp = loaded()
      return comp ? h(comp as ComponentFn, props as Props) : null
    }
  }) as LazyComponent<P>

  wrapper.__loading = () => loaded() === null && error() === null
  wrapper.__load = () => settled
  return wrapper
}
