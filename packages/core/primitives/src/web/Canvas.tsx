// Web implementation of `<Canvas>` and its shape primitives.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type {
  CanvasCircleProps,
  CanvasLineProps,
  CanvasPathProps,
  CanvasProps,
  CanvasRectProps,
  CanvasTextProps,
  ShapeColor,
  ShapePaintProps,
} from '../types/canvas'
import type { ColorToken } from '../types/shared'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'
import { resolveColor } from './tokens'

/** A token resolves through the theme; a `#hex` literal is used as written. */
export function shapeColor(c: ShapeColor): string {
  return c.startsWith('#') ? c : resolveColor(c as ColorToken)
}

/**
 * The fill / stroke / stroke-width a shape draws with, after the cross-target
 * default: no paint at all means "filled with the `text` colour".
 */
export function shapePaint(p: ShapePaintProps): { fill: string; stroke: string; width: number } {
  const fill = p.fill === undefined ? undefined : shapeColor(p.fill)
  const stroke = p.stroke === undefined ? undefined : shapeColor(p.stroke)
  return {
    fill: fill ?? (stroke === undefined ? resolveColor('text') : 'none'),
    stroke: stroke ?? 'none',
    width: stroke === undefined ? 0 : (p.strokeWidth ?? 1),
  }
}

// Each shape is its own full-canvas `<svg>` layer. One <svg> holding every
// shape would need the canvas to sort its children into SVG and non-SVG,
// which breaks the moment a child is a `<For>` or `<Show>` accessor (its
// output is not known until it runs). Separate layers keep the children
// ordinary JSX, stack in source order like the native ZStack / Box, and let
// `pointer-events: none` pass input through to a surrounding <Gesture>.
const LAYER_STYLE = {
  position: 'absolute',
  left: '0',
  top: '0',
  width: '100%',
  height: '100%',
  overflow: 'visible',
  'pointer-events': 'none',
}

function layer(child: VNode): VNode {
  return h('svg', { style: LAYER_STYLE, 'aria-hidden': 'true' }, child)
}

// The attrs are ACCESSORS: the compiler passes `x={px()}` as a getter on
// props, and reading it here at setup would freeze the shape at its first
// value. A function attr is bound reactively by the renderer.
function paintAttrs(props: ShapePaintProps): Record<string, () => string | number> {
  return {
    fill: () => shapePaint(props).fill,
    stroke: () => shapePaint(props).stroke,
    'stroke-width': () => shapePaint(props).width,
  }
}

/**
 * `<Canvas>` — a fixed-size, clipped drawing surface for the shape primitives.
 *
 * Compiles to:
 * - Web (this impl): `<div style="position: relative">` + one `<svg>` per shape
 * - iOS (via PMTC): `PyreonCanvas(width:height:) { … }`
 * - Android (via PMTC): `PyreonCanvas(width = …, height = …) { … }`
 */
export const Canvas = (props: CanvasProps): VNode => {
  const style: Record<string, string> = {
    position: 'relative',
    overflow: 'hidden',
    flex: '0 0 auto',
  }
  return h(
    'div',
    {
      ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
      style: () => {
        const base: Record<string, string> = { ...style, width: `${props.width}px`, height: `${props.height}px` }
        if (props.background !== undefined) base.background = resolveColor(props.background)
        const merged = mergePassthroughStyle(base, props)
        return typeof merged === 'function' ? merged() : merged
      },
    },
    props.children,
  )
}

export const CanvasRect = (props: CanvasRectProps): VNode =>
  layer(
    h('rect', {
      x: () => props.x,
      y: () => props.y,
      width: () => props.width,
      height: () => props.height,
      rx: () => props.radius ?? 0,
      ...paintAttrs(props),
    }),
  )

export const CanvasCircle = (props: CanvasCircleProps): VNode =>
  layer(h('circle', { cx: () => props.cx, cy: () => props.cy, r: () => props.r, ...paintAttrs(props) }))

export const CanvasLine = (props: CanvasLineProps): VNode =>
  layer(
    h('line', {
      x1: () => props.x1,
      y1: () => props.y1,
      x2: () => props.x2,
      y2: () => props.y2,
      stroke: () => shapeColor(props.stroke ?? 'text'),
      'stroke-width': () => props.strokeWidth ?? 1,
    }),
  )

export const CanvasPath = (props: CanvasPathProps): VNode =>
  layer(h('path', { d: () => props.d, ...paintAttrs(props) }))

export const CanvasText = (props: CanvasTextProps): VNode =>
  layer(
    h(
      'text',
      {
        x: () => props.x,
        y: () => props.y,
        'dominant-baseline': 'hanging',
        'font-size': () => props.size ?? 14,
        fill: () => shapeColor(props.fill ?? 'text'),
      },
      props.children,
    ),
  )
