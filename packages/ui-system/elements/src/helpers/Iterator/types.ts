import type { ComponentFn, VNodeChild } from "@pyreon/core"
import type { HTMLTags } from "@pyreon/ui-core"

export type MaybeNull = undefined | null
export type TObj = Record<string, unknown>
export type SimpleValue = string | number
export type ObjectValue = Partial<{
  id: SimpleValue
  key: SimpleValue
  itemId: SimpleValue
  component: ElementType
}> &
  Record<string, unknown>

export type ElementType<T extends Record<string, unknown> = any> = ComponentFn<T> | HTMLTags

export type ExtendedProps = {
  index: number
  first: boolean
  last: boolean
  odd: boolean
  even: boolean
  position: number
}

export type PropsCallback =
  | TObj
  | ((
      itemProps: Record<string, never> | Record<string, SimpleValue> | ObjectValue,
      extendedProps: ExtendedProps,
    ) => TObj)

export type Props = Partial<{
  /**
   * Valid children
   */
  children: VNodeChild

  /**
   * Array of data passed to `component` prop
   */
  data: Array<SimpleValue | ObjectValue | MaybeNull>

  /**
   * A component to be rendered within list
   */
  component: ElementType

  /**
   * Defines name of the prop to be passed to the iteration component
   * when **data** prop is type of `string[]`, `number[]` or combination
   * of both. Otherwise ignored.
   */
  valueName: string

  /**
   * A component to be rendered within list. `wrapComponent`
   * wraps `component`. Therefore it can be used to enhance the behavior
   * of the list component
   */
  wrapComponent: ElementType

  /**
   * Extension of **item** `component` props to be passed
   */
  itemProps: PropsCallback

  /**
   * Extension of **item** `wrapComponent` props to be passed
   */
  wrapProps?: PropsCallback

  /**
   * Extension of **item** `wrapComponent` props to be passed
   */
  itemKey?:
    | keyof ObjectValue
    | ((item: SimpleValue | Omit<ObjectValue, "component">, index: number) => SimpleValue)
}>
