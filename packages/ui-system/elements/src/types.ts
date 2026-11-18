/**
 * Shared type definitions for the elements package. Provides responsive
 * value types (single | array | breakpoint-map) for layout props like
 * alignment and direction, plus utility types for merging prop objects.
 */
import type { ComponentFn } from '@pyreon/core'
import type { BreakpointKeys, config, render } from '@pyreon/ui-core'
import type { ITheme, MakeItResponsiveStyles } from '@pyreon/unistyle'

// Each Element-layer styled component (Wrapper, Content, Text) supplies a
// `ThemeProps` shape describing its per-breakpoint resolved theme. Pass it
// as the generic argument so the callback's `theme` parameter is strictly
// typed (`t.alignX === 'block'` etc.) without per-callback casts. The
// default `Partial<Record<string, unknown>>` reflects the underlying
// `MakeItResponsiveStyles` default — un-typed callers see `unknown` per
// key, which forces narrowing.
export type ResponsiveStylesCallback<
  T extends Partial<Record<string, unknown>> = Partial<Record<string, unknown>>,
> = MakeItResponsiveStyles<T>

type ExtractNullableKeys<T> = {
  [P in keyof T as T[P] extends null | undefined ? never : P]: T[P]
}

type Id<T> = T extends infer U ? { [K in keyof U]: U[K] } : never

type SpreadTwo<L, R> = Id<Pick<L, Exclude<keyof L, keyof R>> & R>

type Spread<A extends readonly [...any]> = A extends [infer L, ...infer R]
  ? SpreadTwo<L, Spread<R>>
  : unknown

export type MergeTypes<A extends readonly [...any]> = ExtractNullableKeys<Spread<A>>

export type InnerRef = HTMLElement | ((el: HTMLElement | null) => void) | null

export type CssCallback = (css: typeof config.css) => ReturnType<typeof css>

/**
 * The `css` escape hatch: a `css\`…\`` result or a `(css) => css\`…\``
 * callback. A raw CSS string is NOT accepted: the typed per-instance override
 * is the `styles` prop ({@link StylesProp}); `css` is for what that cannot
 * express (a selector, an at-rule), and has to be written as an explicit
 * tagged template so it reads as an escape hatch.
 */
export type Css = CssCallback | ReturnType<typeof config.css>

/** One style value: a single value, a mobile-first array, or a breakpoint object. */
export type StyleValue<T> =
  | T
  | readonly (T | null | undefined)[]
  | Partial<Record<BreakpointKeys, T | null | undefined>>

/**
 * A style object keyed by the `@pyreon/unistyle` property mappings: the keys a
 * component's `.theme()` uses (`paddingTop`, `borderWidthTop`,
 * `gridTemplateColumns`, …), each value responsive exactly as in a theme.
 * `extendCss` (free CSS text) is deliberately not a key.
 */
export type StyleProps = {
  [K in Exclude<keyof ITheme, 'extendCss'>]?: StyleValue<NonNullable<ITheme[K]>> | null | undefined
}

/**
 * The typed per-instance style override: {@link StyleProps} plus the four
 * pseudo-state groups a component's `.theme()` uses (`hover` → `:hover`,
 * `focus` → `:focus-visible`, `active` → `:active`, `disabled` →
 * `:disabled, [aria-disabled='true']`). No selectors, no CSS text: an override
 * can only style the element it is on.
 */
export type StyleOverride = StyleProps &
  Partial<Record<'hover' | 'focus' | 'active' | 'disabled', StyleProps | undefined>>

/** `mode(light, dark)` inside a {@link StylesCallback}: the value for the current colour mode. */
export type StylesMode = <A, B>(light: A, dark: B) => A | B

/**
 * The theme a {@link StylesCallback} receives (the `<PyreonUI>` theme). An app
 * types it by augmenting this interface, as it augments rocketstyle's
 * `ThemeDefault` for `.theme()` callbacks.
 */
export interface StylesThemeDefault {
  [key: string]: unknown
}

/** The callback form of `styles`, with the same arguments as a `.theme()` callback. */
export type StylesCallback = (theme: StylesThemeDefault, mode: StylesMode) => StyleOverride

/** The `styles` prop: a {@link StyleOverride} object or a `(theme, mode) => object` callback. */
export type StylesProp = StyleOverride | StylesCallback

export type Content = Parameters<typeof render>['0']

export type ContentAlignX = 'left' | 'center' | 'right' | 'spaceBetween' | 'spaceAround' | 'block'

export type ContentAlignY = 'top' | 'center' | 'bottom' | 'spaceBetween' | 'spaceAround' | 'block'

export type ContentDirection = 'inline' | 'rows' | 'reverseInline' | 'reverseRows'

export type ContentBoolean = boolean
export type ContentSimpleValue = string | number

export type Ref = HTMLElement

export type AlignY =
  | ContentAlignY
  | ContentAlignY[]
  | Partial<Record<BreakpointKeys, ContentAlignY>>

export type AlignX =
  | ContentAlignX
  | ContentAlignX[]
  | Partial<Record<BreakpointKeys, ContentAlignX>>

export type Direction =
  | ContentDirection
  | ContentDirection[]
  | Partial<Record<BreakpointKeys, ContentDirection>>

export type ResponsiveBoolType =
  | ContentBoolean
  | ContentBoolean[]
  | Partial<Record<BreakpointKeys, ContentBoolean>>

export type Responsive =
  | ContentSimpleValue
  | ContentSimpleValue[]
  | Partial<Record<BreakpointKeys, number | string>>

export type ExtendCss = Css | Css[] | Partial<Record<BreakpointKeys, Css>>

/**
 * Extracts the props type from a Pyreon component function — multi-overload
 * aware. Matches up to 4 call signatures and produces the UNION of their
 * first-argument types. Iterator / List ship 3-overload primitives whose
 * LAST overload is `ChildrenProps` (the loosest); without overload-aware
 * extraction, `ExtractProps<Iterator>` returned just `ChildrenProps` and
 * lost `SimpleProps<T>` / `ObjectProps<T>` shapes. Mirrors vitus-labs
 * PR #222.
 *
 * Kept in sync with the copies in `@pyreon/core` / `@pyreon/attrs` /
 * `@pyreon/rocketstyle`.
 */
export type ExtractProps<TComponentOrTProps> = TComponentOrTProps extends {
  (props: infer P1, ...args: any): any
  (props: infer P2, ...args: any): any
  (props: infer P3, ...args: any): any
  (props: infer P4, ...args: any): any
}
  ? P1 | P2 | P3 | P4
  : TComponentOrTProps extends {
        (props: infer P1, ...args: any): any
        (props: infer P2, ...args: any): any
        (props: infer P3, ...args: any): any
      }
    ? P1 | P2 | P3
    : TComponentOrTProps extends {
          (props: infer P1, ...args: any): any
          (props: infer P2, ...args: any): any
        }
      ? P1 | P2
      : TComponentOrTProps extends ComponentFn<infer TProps>
        ? TProps
        : TComponentOrTProps

export type PyreonComponent<P extends Record<string, any> = {}> = ComponentFn<P> & PyreonStatic

export interface PyreonStatic {
  displayName?: string | undefined
  pkgName?: string
  PYREON__COMPONENT?: `@pyreon/${string}`
}
