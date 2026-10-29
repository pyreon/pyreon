// `<Canvas>` shape primitives — the table both emitters read.
//
// Each shape lowers to ONE runtime path builder (Swift `PyreonCanvasPath.x`,
// Kotlin `PyreonShapeSpec.X`) wrapped in `PyreonShape(…, fill:, stroke:, …)`.
// Keeping the argument order and defaults here means the two targets cannot
// disagree about which prop is which (`radius` defaults to 0 on both, a
// `<CanvasLine>` is never filled on either).

import { parseCssColor } from './style-to-native'
import { resolveColor } from './canonical-primitives'

export interface ShapeArg {
  /** The JSX prop. */
  prop: string
  /** Swift argument label (`''` = unlabelled). */
  label: string
  kind: 'number' | 'string'
  /** Value when the prop is absent; `undefined` = required. */
  default?: number
}

export interface ShapeSpec {
  swift: string
  kotlin: string
  args: readonly ShapeArg[]
  /** `<CanvasLine>` is stroke-only: no fill, stroked with `text` by default. */
  strokeOnly?: boolean
}

const n = (prop: string, dflt?: number): ShapeArg =>
  dflt === undefined ? { prop, label: prop, kind: 'number' } : { prop, label: prop, kind: 'number', default: dflt }

export const CANVAS_SHAPES: Readonly<Record<string, ShapeSpec>> = {
  CanvasRect: {
    swift: 'PyreonCanvasPath.rect',
    kotlin: 'PyreonShapeSpec.Rect',
    args: [n('x'), n('y'), n('width'), n('height'), n('radius', 0)],
  },
  CanvasCircle: {
    swift: 'PyreonCanvasPath.circle',
    kotlin: 'PyreonShapeSpec.Circle',
    args: [n('cx'), n('cy'), n('r')],
  },
  CanvasLine: {
    swift: 'PyreonCanvasPath.line',
    kotlin: 'PyreonShapeSpec.Line',
    args: [n('x1'), n('y1'), n('x2'), n('y2')],
    strokeOnly: true,
  },
  CanvasPath: {
    swift: 'PyreonCanvasPath.svg',
    kotlin: 'PyreonShapeSpec.Svg',
    args: [{ prop: 'd', label: '', kind: 'string' }],
  },
}

export function isCanvasShape(tag: string): boolean {
  return Object.hasOwn(CANVAS_SHAPES, tag)
}

/**
 * A shape colour literal → a native Color expression: a theme token through
 * the shared token table, a `#hex` through the CSS colour parser. `null` for
 * anything else (the caller warns rather than guessing a colour).
 */
export function shapeColorLiteral(v: string, target: 'swift' | 'kotlin'): string | null {
  if (v.startsWith('#')) return parseCssColor(v, target)
  return isColorToken(v) ? resolveColor(v, target) : null
}

const TOKENS = new Set(['text', 'surface', 'primary', 'secondary', 'success', 'warning', 'danger', 'muted'])
function isColorToken(v: string): boolean {
  return TOKENS.has(v)
}
