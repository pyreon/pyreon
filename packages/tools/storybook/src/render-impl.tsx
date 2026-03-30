import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'

/**
 * State tracked per canvas element so we can clean up between renders.
 */
const canvasState = new WeakMap<HTMLElement, () => void>()

/**
 * Render a Pyreon story into a Storybook canvas element.
 *
 * This is the core integration point — Storybook calls this function
 * every time a story needs to be displayed or re-rendered (e.g. when
 * the user changes args via the Controls panel).
 *
 * It handles:
 * 1. Cleaning up the previous mount (disposing effects, removing DOM)
 * 2. Building the VNode from the story function or component + args
 * 3. Mounting the new VNode into the canvas
 */
export function renderToCanvas(
  {
    storyFn,
    showMain,
    showError,
  }: {
    storyFn: () => VNodeChild
    storyContext: {
      component?: ComponentFn<any>
      args: Record<string, unknown>
      [key: string]: unknown
    }
    showMain: () => void
    showError: (error: { title: string; description: string }) => void
    forceRemount: boolean
  },
  canvasElement: HTMLElement,
): void {
  // Always clean up the previous render
  const prevUnmount = canvasState.get(canvasElement)
  if (prevUnmount) {
    prevUnmount()
    canvasState.delete(canvasElement)
  }

  try {
    const element = storyFn()
    const unmount = mount(element, canvasElement)
    canvasState.set(canvasElement, unmount)
    showMain()
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    showError({
      title: `Error rendering story`,
      description: error.message,
    })
  }
}

/**
 * Default render implementation used when no custom `render` is provided.
 */
export function defaultRender(
  component: ComponentFn<any>,
  args: Record<string, unknown>,
): VNodeChild {
  const Component = component
  return <Component {...args} />
}
