import type { ElementType, TFn } from './utils'

export type OptionFunc = (...arg: unknown[]) => Record<string, unknown>

export type InitConfiguration<C> = {
  name?: string | undefined
  component: C
}

/**
 * Internal configuration accumulated across the chaining API.
 * Arrays hold the full chain — each `.attrs()` call appends to these.
 */
export type Configuration<C = ElementType | unknown> = InitConfiguration<C> & {
  DEBUG?: boolean | undefined
  /** Chain of default-props callbacks (resolved in order, later wins). */
  attrs: OptionFunc[]
  /** Chain of priority-props callbacks (resolved before `attrs`, can be overridden by both). */
  priorityAttrs: OptionFunc[]
  /** Prop names to omit before passing to the underlying component. */
  filterAttrs: string[]
  /** Named HOCs — set to null/false to remove from chain. */
  compose: Record<string, TFn | null | undefined | false>
  /** Metadata accessible via `Component.meta`. */
  statics: Record<string, any>
} & Record<string, any>

/**
 * Single-item variant of Configuration — represents what a single
 * `.attrs()` / `.config()` call contributes (one function, not an array).
 * Used by `cloneAndEnhance` to merge into the accumulated Configuration.
 */
export type ExtendedConfiguration<C = ElementType | unknown> = InitConfiguration<C> & {
  DEBUG?: boolean | undefined
  attrs: OptionFunc
  priorityAttrs: OptionFunc
  filterAttrs: string[]
  compose: Record<string, TFn | null | undefined | false>
  statics: Record<string, any>
} & Record<string, any>
