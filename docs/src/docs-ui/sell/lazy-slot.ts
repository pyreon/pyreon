import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h, lazy } from '@pyreon/core'

/**
 * An MDX slot whose code loads only on a page that renders it.
 *
 * The Markdown compiler imports every component a page names, and the bundler
 * groups the components many pages share into one chunk, so anything a slot
 * imports statically (the kit's benchmark chips, the demo registry, the
 * product summaries) would ride along on every docs page. The slot is a stub
 * that creates its `lazy()` on FIRST RENDER (core's `lazy()` starts loading
 * when it is created): the server waits for it while prerendering, and the
 * client hydrates the server HTML once the chunk lands.
 */
export function lazySlot<P extends object>(load: () => Promise<{ default: ComponentFn<P> }>): ComponentFn<P> {
  let Impl: ComponentFn<P> | undefined
  return (props: P): VNodeChild => {
    Impl ??= lazy(load) as unknown as ComponentFn<P>
    return h(Impl as ComponentFn, props as Record<string, unknown>)
  }
}
