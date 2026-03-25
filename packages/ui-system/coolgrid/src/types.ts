/**
 * Type definitions for the coolgrid layout system.
 * Supports responsive values as single values, arrays (mobile-first),
 * or breakpoint-keyed objects. Defines config props for Container/Row/Col
 * and the resolved styled-component prop types.
 */

import type { ComponentFn, VNodeChild } from "@pyreon/core"
import type { BreakpointKeys, config } from "@pyreon/ui-core"
import type { AlignContentAlignXKeys, extendCss } from "@pyreon/unistyle"

type CreateValueType<T> = T | T[] | Partial<Record<BreakpointKeys, T>>

export type Obj = Record<string, unknown>
export type Value = string | number
export type Css = Parameters<typeof extendCss>[0]
export type ExtraStyles = CreateValueType<Css>

export type CssOutput = ReturnType<typeof config.css> | string

export type ValueType = CreateValueType<number>
export type ContainerWidth = CreateValueType<Value>

export type ContentAlignX =
  | "center"
  | "left"
  | "right"
  | "spaceAround"
  | "spaceBetween"
  | "spaceEvenly"

export type ConfigurationProps = Partial<{
  size: ValueType
  padding: ValueType
  gap: ValueType
  gutter: ValueType
  columns: ValueType
  colCss: ExtraStyles
  rowCss: ExtraStyles
  colComponent: ComponentFn<any>
  rowComponent: ComponentFn<any>
  contentAlignX: ContentAlignX
  containerWidth: ContainerWidth
  width: ContainerWidth | ((widths: Record<string, any>) => ContainerWidth)
}>

export type ComponentProps = ConfigurationProps &
  Partial<{
    component: ComponentFn<any>
    css: ExtraStyles
  }>

export type StyledTypes = Partial<{
  size: number | undefined
  padding: number | undefined
  gap: number | undefined
  gutter: number | undefined
  columns: number | undefined
  extraStyles: Css
  contentAlignX: AlignContentAlignXKeys
  width: Value
}>

export type ElementType<O extends string[]> = ComponentFn<
  Omit<ComponentProps, O[number]> & Record<string, unknown> & { children?: VNodeChild }
> & {
  displayName: string
  pkgName: string
  PYREON__COMPONENT: string
}

export type Context = { [K in keyof ConfigurationProps]?: ConfigurationProps[K] | undefined }
