// Web implementation of `<Heading>` — semantic heading.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { HeadingProps } from '../types/content'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'
import { resolveColor } from './tokens'

/**
 * Per-level typographic scale. The browser's default `<h1>`–`<h6>`
 * sizes are inconsistent (and `<h4>`–`<h6>` render SMALLER than body
 * text), so a cross-platform design primitive sets an explicit scale —
 * matching the intent of iOS `.largeTitle`/`.title`/`.title2`… and
 * Compose `headlineLarge`/`headlineMedium`… All weights are bold.
 */
const LEVEL_FONT_SIZE: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: '32px',
  2: '24px',
  3: '20px',
  4: '18px',
  5: '16px',
  6: '14px',
}

/**
 * `<Heading>` — semantic heading. `level` (default 1) picks both the
 * HTML element (`<h1>`–`<h6>`, so screen readers + document outline
 * work) AND the typographic scale.
 *
 * Compiles to:
 * - Web (this impl): `<h1>` … `<h6>` with explicit size + weight 700
 * - iOS (via PMTC): `Text(...).font(.largeTitle | .title2 | …)`
 * - Android (via PMTC): `Text(style = MaterialTheme.typography.headlineLarge | …)`
 */
export const Heading = (props: HeadingProps): VNode => {
  const level = props.level ?? 1
  const style: Record<string, string> = {
    // `level` is typed 1–6 and `LEVEL_FONT_SIZE` is keyed by exactly
    // that union, so the lookup is `string` (no undefined / no branch).
    'font-size': LEVEL_FONT_SIZE[level],
    'font-weight': '700',
    margin: '0',
  }
  if (props.color !== undefined) style.color = resolveColor(props.color)
  return h(
    `h${level}`,
    {
      ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
      style: mergePassthroughStyle(style, props.style),
    },
    props.children,
  )
}
