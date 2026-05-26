// Content primitive type definitions — Text / Heading / Image / Icon.

import type { ChildrenProp, ColorToken, HtmlPassthroughProps } from './shared'

/**
 * `<Text>` — text content. Inline-rendering wrapper that picks up
 * the surrounding text style + token color.
 *
 * Per-platform mapping:
 * - Web: `<span>`
 * - iOS: `Text(...)`
 * - Android: `Text(text=..., color=..., ...)`
 */
export interface TextProps extends ChildrenProp, HtmlPassthroughProps {
  color?: ColorToken
  /** Semantic typography scale. Maps to per-platform font-size + weight. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  weight?: 'regular' | 'medium' | 'bold'
  /** Single-line / multi-line behavior. Defaults to multi-line. */
  truncate?: boolean
}

/**
 * `<Heading>` — semantic heading. Maps to platform-canonical heading
 * typography per level.
 *
 * Per-platform mapping:
 * - Web: `<h1>` .. `<h6>`
 * - iOS: `Text(...).font(.largeTitle | .title2 | ...)`
 * - Android: `Text(style=MaterialTheme.typography.headlineLarge | headlineMedium | ...)`
 */
export interface HeadingProps extends ChildrenProp, HtmlPassthroughProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6
  color?: ColorToken
}

/**
 * `<Image>` — bitmap image.
 *
 * Per-platform mapping:
 * - Web: `<img>`
 * - iOS: `Image(...)` / `AsyncImage(url:)` for remote
 * - Android: `AsyncImage(model=...)` (Coil)
 */
export interface ImageProps extends HtmlPassthroughProps {
  src: string
  alt: string
  /** How the image scales within its container. Default `cover`. */
  fit?: 'cover' | 'contain' | 'fill' | 'none'
  width?: number | string
  height?: number | string
}

/**
 * `<Icon>` — vector icon. Names are platform-agnostic semantic
 * identifiers; each platform maps to its native icon system.
 *
 * Per-platform mapping:
 * - Web: `<svg>` (from a named icon set)
 * - iOS: `Image(systemName: ...)` (SF Symbols)
 * - Android: `Icon(imageVector = ..., ...)` (Material Icons)
 */
export interface IconProps extends HtmlPassthroughProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  color?: ColorToken
}
