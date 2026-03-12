import { signal } from "@pyreon/reactivity"
import { h } from "./h"
import type { LazyComponent } from "./suspense"
import type { ComponentFn, Props, VNode } from "./types"

export function lazy<P extends Props>(
  load: () => Promise<{ default: ComponentFn<P> }>,
): LazyComponent<P> {
  const loaded = signal<ComponentFn<P> | null>(null)
  const error = signal<Error | null>(null)

  load()
    .then((m) => loaded.set(m.default))
    .catch((e) => error.set(e instanceof Error ? e : new Error(String(e))))

  const wrapper = ((props: P) => {
    const err = error()
    if (err) throw err
    const comp = loaded()
    return comp ? h(comp as ComponentFn, props as Props) : null
  }) as LazyComponent<P>

  wrapper.__loading = () => loaded() === null && error() === null
  return wrapper
}
