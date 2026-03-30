/**
 * @pyreon/storybook — Storybook renderer for Pyreon components.
 *
 * Usage in .storybook/main.ts:
 *   framework: "@pyreon/storybook"
 *
 * Usage in stories:
 *   import type { Meta, StoryObj } from "@pyreon/storybook"
 *   import { Button } from "./Button"
 *
 *   const meta = {
 *     component: Button,
 *     args: { label: "Click me" },
 *   } satisfies Meta<typeof Button>
 *
 *   export default meta
 *   type Story = StoryObj<typeof meta>
 *
 *   export const Primary: Story = {
 *     args: { variant: "primary" },
 *   }
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  DecoratorFn,
  InferProps,
  Meta,
  PyreonRenderer,
  StoryContext,
  StoryFn,
  StoryObj,
} from './types'

// ─── Renderer ────────────────────────────────────────────────────────────────

export { defaultRender, renderToCanvas } from './render'

// ─── Pyreon re-exports for convenience ───────────────────────────────────────

export type { ComponentFn, Props, VNode, VNodeChild } from '@pyreon/core'
export { Fragment, h } from '@pyreon/core'
export { computed, effect, signal } from '@pyreon/reactivity'
export { mount } from '@pyreon/runtime-dom'
