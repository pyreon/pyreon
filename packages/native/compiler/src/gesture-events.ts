// `<Gesture>` — the event payload types, shared by the parser and both emitters.
//
// A gesture handler's parameter is not declared anywhere the compiler can read
// (`onPan={(e) => x.set(e.dx)}` — `e` is unannotated, and even an annotation
// would name `PanEvent`, a type from a package the compiler does not follow).
// Without a type the parameter is `unknown`, and that is not a cosmetic gap:
// the float-widening pass cannot prove `x.set(e.dx)` writes a Double, so `x`
// stays an Int @State / mutableStateOf receiving a Double — an uncompilable
// line on both targets, from the most ordinary gesture handler there is.
//
// So the parser stamps the payload type onto the handler's first parameter
// (`ExprIR.arrow.paramTypes[0]`), and every consumer that already honours
// annotated parameters — the widening pass, the closure emitters — sees it.
// The shapes mirror the runtime types field for field (`PyreonPanEvent` …).

import type { TypeIR } from './types'

const DOUBLE: TypeIR = { kind: 'number', float: true }
const PHASE: TypeIR = { kind: 'string' }

/** Event-attr name (`onPan` → `pan`) → the payload type and its runtime type name. */
export const GESTURE_EVENTS: Readonly<
  Record<'pan' | 'pinch' | 'rotate', { type: TypeIR; swift: string; kotlin: string; param: string }>
> = {
  pan: {
    type: {
      kind: 'object',
      fields: [
        { name: 'dx', type: DOUBLE },
        { name: 'dy', type: DOUBLE },
        { name: 'x', type: DOUBLE },
        { name: 'y', type: DOUBLE },
        { name: 'phase', type: PHASE },
      ],
    },
    swift: 'PyreonPanEvent',
    kotlin: 'PyreonPanEvent',
    param: 'onPan',
  },
  pinch: {
    type: {
      kind: 'object',
      fields: [
        { name: 'scale', type: DOUBLE },
        { name: 'centerX', type: DOUBLE },
        { name: 'centerY', type: DOUBLE },
        { name: 'phase', type: PHASE },
      ],
    },
    swift: 'PyreonPinchEvent',
    kotlin: 'PyreonPinchEvent',
    param: 'onPinch',
  },
  rotate: {
    type: {
      kind: 'object',
      fields: [
        { name: 'degrees', type: DOUBLE },
        { name: 'phase', type: PHASE },
      ],
    },
    swift: 'PyreonRotateEvent',
    kotlin: 'PyreonRotateEvent',
    param: 'onRotate',
  },
}

export type GestureEventName = keyof typeof GESTURE_EVENTS

export const GESTURE_EVENT_NAMES = Object.keys(GESTURE_EVENTS) as GestureEventName[]

export function isGestureEventName(name: string): name is GestureEventName {
  return Object.hasOwn(GESTURE_EVENTS, name)
}
