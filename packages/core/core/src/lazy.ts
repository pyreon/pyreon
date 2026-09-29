import { signal } from '@pyreon/reactivity'
import { h } from './h'
import type { LazyComponent } from './suspense'
import type { ComponentFn, Props } from './types'

export function lazy<P extends object>(
  load: () => Promise<{ default: ComponentFn<P> }>,
): LazyComponent<P> {
  const loaded = signal<ComponentFn<P> | null>(null)
  const error = signal<Error | null>(null)

  // Settles (never rejects) once the chunk has loaded OR failed — the failure is
  // surfaced by the wrapper throwing on its next render, not by this promise.
  // Kept so the SSR renderers can WAIT for a chunk that has not landed yet
  // instead of rendering the still-loading wrapper as nothing (see `__load`).
  const settled: Promise<void> = load().then(
    (m) => loaded.set(m.default),
    (e: unknown) => error.set(e instanceof Error ? e : new Error(String(e))),
  )

  const wrapper = ((props: P) => {
    const err = error()
    if (err) throw err
    const comp = loaded()
    return comp ? h(comp as ComponentFn, props as Props) : null
  }) as LazyComponent<P>

  wrapper.__loading = () => loaded() === null && error() === null
  wrapper.__load = () => settled
  return wrapper
}
