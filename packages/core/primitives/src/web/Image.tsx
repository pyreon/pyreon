// Web implementation of `<Image>` — bitmap image.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { ImageProps } from '../types/content'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * Resolve a `width`/`height` prop to a CSS dimension string. A bare
 * number is treated as pixels (`200` → `"200px"`); a string passes
 * through verbatim (`"50%"`, `"10rem"`).
 */
function resolveDimension(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value
}

/**
 * `<Image>` — bitmap image. `src` + `alt` are required (alt is
 * non-optional by design — every image needs alt text for screen
 * readers, even if `alt=""` for decorative images).
 *
 * Compiles to:
 * - Web (this impl): `<img src alt style="object-fit:...">`
 * - iOS (via PMTC): `Image(...)` / `AsyncImage(url:)` for remote
 * - Android (via PMTC): `AsyncImage(model = ...)` (Coil)
 *
 * `fit` (default `cover`) maps to CSS `object-fit`. `width`/`height`
 * accept a number (px) or a CSS string. No children (void element).
 */
export const Image = (props: ImageProps): VNode => {
  const style: Record<string, string> = {
    'object-fit': props.fit ?? 'cover',
  }
  if (props.width !== undefined) style.width = resolveDimension(props.width)
  if (props.height !== undefined) style.height = resolveDimension(props.height)
  return h('img', {
    ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
    src: props.src,
    alt: props.alt,
    style: mergePassthroughStyle(style, props.style),
  })
}
