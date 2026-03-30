import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { renderToCanvas } from './render-impl'

/**
 * Preview entry — Storybook loads this in the preview iframe.
 *
 * Exports the render function and default decorators/parameters
 * that apply to all stories using this renderer.
 */

export { renderToCanvas }

/**
 * Default render function — if the story CSF has a `component` but no
 * explicit `render`, this is used to create the VNode.
 */
export function render<TArgs extends Record<string, unknown>>(
  args: TArgs,
  context: { component?: ComponentFn<any> },
): VNodeChild {
  const Component = context.component
  if (!Component) {
    throw new Error(
      '[@pyreon/storybook] No component provided. Either set `component` in your meta or provide a `render` function.',
    )
  }
  return <Component {...args} />
}
