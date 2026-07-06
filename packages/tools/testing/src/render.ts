/**
 * `render()` — mount a Pyreon VNode into an isolated container and bind the
 * full `@testing-library/dom` query set to it.
 *
 * This is the ONLY Pyreon-specific piece of the query/interaction layer: it
 * knows how to mount a Pyreon component. Everything downstream — `screen`,
 * every `getBy*`/`queryBy*`/`findBy*` query (with real ARIA role + accessible-
 * name resolution), `fireEvent`, `waitFor` — comes from `@testing-library/dom`,
 * the same battle-tested foundation under React/Vue/Solid/Svelte testing. So a
 * Pyreon dev's Testing-Library knowledge transfers exactly, and edge cases the
 * ecosystem already solved come for free. (This mirrors how every Pyreon
 * adapter package is built: `@pyreon/query` wraps TanStack, `@pyreon/dnd` wraps
 * pragmatic-drag-and-drop — `@pyreon/testing` wraps testing-library.)
 */
import type { VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { type BoundFunctions, getQueriesForElement, type queries } from '@testing-library/dom'

export interface RenderOptions {
  /**
   * Container to mount into. Defaults to a fresh `<div>` appended to
   * `baseElement`. Pass your own when a test needs a specific host element.
   */
  container?: HTMLElement
  /**
   * Root the container is appended to + `screen`-style queries resolve from
   * when no explicit `container` is given. Defaults to `document.body`.
   */
  baseElement?: HTMLElement
}

export type RenderResult = BoundFunctions<typeof queries> & {
  /** The container the tree was mounted into. */
  container: HTMLElement
  /** The base element queries fall back to (`document.body` by default). */
  baseElement: HTMLElement
  /** Unmount the tree, run cleanups, and remove the container. */
  unmount: () => void
  /** `container.innerHTML` — handy for quick assertions. */
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
    // The full @testing-library/dom query set, scoped to this container.
    ...getQueriesForElement(container),
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
