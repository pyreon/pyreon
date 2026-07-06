/**
 * `render()` — mount a Pyreon VNode into an isolated container appended to
 * `document.body`, returning bound queries + an `unmount`. The Testing-Library
 * entry point users reach for first.
 *
 * Isolation is by construction: each call creates its own container so there
 * is no shared root, no leftover listeners between tests. `cleanup()` (auto-
 * registered when a test runner is present) unmounts every rendered tree.
 */
import type { VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { type BoundQueries, bindQueries } from './queries'

export interface RenderOptions {
  /**
   * Container to mount into. Defaults to a fresh `<div>` appended to
   * `baseElement`. Pass your own when a test needs a specific host element.
   */
  container?: HTMLElement
  /**
   * Root the container is appended to + queries are scoped from when no
   * explicit `container` is given. Defaults to `document.body`.
   */
  baseElement?: HTMLElement
}

export interface RenderResult extends BoundQueries {
  /** The container the tree was mounted into. */
  container: HTMLElement
  /** The base element queries fall back to (`document.body` by default). */
  baseElement: HTMLElement
  /** Unmount the tree, run cleanups, and remove the container. */
  unmount: () => void
  /** `container.innerHTML` — handy for snapshot assertions. */
  debug: () => string
}

// Tracks every live render so `cleanup()` can tear them all down.
const mountedResults = new Set<RenderResult>()

/** @internal — consumed by `cleanup()`. */
export function _mountedResults(): Set<RenderResult> {
  return mountedResults
}

export function render(ui: VNodeChild, options: RenderOptions = {}): RenderResult {
  const baseElement = options.baseElement ?? document.body
  const container = options.container ?? baseElement.appendChild(document.createElement('div'))

  const dispose = mount(ui, container)

  const result: RenderResult = {
    container,
    baseElement,
    ...bindQueries(container),
    debug: () => container.innerHTML,
    unmount() {
      dispose()
      if (container.parentNode) container.parentNode.removeChild(container)
      mountedResults.delete(result)
    },
  }
  mountedResults.add(result)
  return result
}
