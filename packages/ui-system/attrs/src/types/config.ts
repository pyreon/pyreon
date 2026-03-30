import type { ElementType } from './utils'

/** A component that has been enhanced by attrs — identified by the `IS_ATTRS` marker. */
export type AttrsComponentType = ElementType & {
  IS_ATTRS: true
}

/** Parameters accepted by the `.config()` chaining method. */
export type ConfigAttrs<C extends ElementType | unknown> = Partial<{
  name: string
  component: C
  DEBUG: boolean
}>
