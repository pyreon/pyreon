// Layout primitive type definitions — Stack / Inline / Layer / Scroll / Spacer.
//
// Each primitive's TypeScript surface defines the cross-platform
// contract. Implementations (web in src/web/; iOS/Android via PMTC
// compiler) honor the same prop shape.

import type {
  Align,
  BaseLayoutProps,
  ChildrenProp,
  HtmlPassthroughProps,
  Justify,
  Space,
} from './shared'

/**
 * `<Stack>` — the canonical flex container. The primary layout
 * primitive — most app layouts compose Stacks vertically + Inlines
 * horizontally.
 *
 * Default `direction="column"`. Use `<Inline>` for horizontal layout
 * (it's sugar for `<Stack direction="row">` and the common case).
 *
 * Per-platform mapping:
 * - Web: `<div style="display:flex; flex-direction: column|row">`
 * - iOS: `VStack` / `HStack`
 * - Android: `Column` / `Row`
 */
export interface StackProps extends BaseLayoutProps, ChildrenProp, HtmlPassthroughProps {
  direction?: 'column' | 'row'
  /** Cross-axis alignment of children (flex `alignItems`). */
  align?: Align
  /** Main-axis distribution (flex `justifyContent`). */
  justify?: Justify
  /** Gap between children. */
  gap?: Space
  /** When true, layout wraps to next line on overflow. Default false. */
  wrap?: boolean
}

/**
 * `<Inline>` — horizontal flex container. Sugar for
 * `<Stack direction="row">`. Common-enough usage to deserve its own
 * primitive (toolbar rows, button rows, chip lists, etc.).
 *
 * Per-platform mapping:
 * - Web: `<div style="display:flex; flex-direction:row">`
 * - iOS: `HStack`
 * - Android: `Row`
 */
export interface InlineProps extends BaseLayoutProps, ChildrenProp, HtmlPassthroughProps {
  align?: Align
  justify?: Justify
  gap?: Space
  wrap?: boolean
}

/**
 * `<Layer>` — z-stack / overlay container. Children stack on top of
 * each other (later children render in front).
 *
 * Per-platform mapping:
 * - Web: `<div style="position:relative">` + abs-positioned children
 * - iOS: `ZStack`
 * - Android: `Box`
 */
export interface LayerProps extends BaseLayoutProps, ChildrenProp, HtmlPassthroughProps {
  align?: Align
}

/**
 * `<Scroll>` — scrollable container. Vertically scrollable by default.
 *
 * Per-platform mapping:
 * - Web: `<div style="overflow:auto">`
 * - iOS: `ScrollView`
 * - Android: `Column(verticalScroll)` / `Row(horizontalScroll)`
 */
export interface ScrollProps extends BaseLayoutProps, ChildrenProp, HtmlPassthroughProps {
  axis?: 'vertical' | 'horizontal'
}

/**
 * `<Spacer />` — fills available main-axis space. Useful for pushing
 * siblings to opposite ends of a Stack/Inline.
 *
 * Per-platform mapping:
 * - Web: `<div style="flex:1">`
 * - iOS: `Spacer()`
 * - Android: `Spacer(modifier=Modifier.weight(1f))`
 */
export interface SpacerProps extends HtmlPassthroughProps {
  // No layout props in v1. Future arc may add `size` for fixed-space variants.
}
