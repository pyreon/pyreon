// `@pyreon/dnd` → native: the `useDraggable` / `useDroppable` crossing.
//
// The web hooks register DOM elements; on native `ref={d.ref}` lowers to the platform's own drag source / drop target
// instead (SwiftUI `.onDrag` / `.onDrop(of:delegate:)`, Compose `dragAndDropSource` / `dragAndDropTarget`). The payload
// is JSON text, so the two hooks never share a type: a draggable carries the object literal it was written with and a
// droppable decodes it into the type its `onDrop` source parameter is ANNOTATED with.
//
// What cannot cross MUST warn by name — several specs below assert exactly that, so the crossing can never quietly
// over-claim (a drag that stops calling a handler without a word is the failure this lowering must not have).

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const IMPORTS = `import { signal } from '@pyreon/reactivity'
import { useDraggable, useDroppable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
type Card = { id: string; kind: string }`

/** The canonical documented usage: a card dragged onto a column. */
const BOARD = `${IMPORTS}
export function App() {
  const moved = signal('')
  const { ref: dragRef, isDragging } = useDraggable({ data: { id: 'c1', kind: 'card' } })
  const { ref: dropRef, isOver, overEdge } = useDroppable({
    edges: ['top', 'bottom'],
    canDrop: (src: Card) => src.kind === 'card',
    onDrop: (src: Card, loc) => moved.set(src.id + (loc.edge ?? '')),
  })
  return (<Stack>
    <Text ref={dragRef}>{isDragging() ? 'dragging' : 'idle'}</Text>
    <Stack ref={dropRef}><Text>{moved()}</Text><Text>{isOver() ? overEdge() ?? 'over' : 'out'}</Text></Stack>
  </Stack>)
}`

/** The non-destructured spelling, a reactive `disabled`, and an arrow-returned `data`. */
const MEMBER = `${IMPORTS}
export function App() {
  const locked = signal(false)
  const d = useDraggable({ data: () => ({ id: 'c2', n: 3 }), disabled: () => locked() })
  const z = useDroppable({ onDrop: (src: Card) => { locked.set(true) }, onDragEnter: () => locked.set(false) })
  return (<Stack><Text ref={d.ref}>a</Text><Stack ref={z.ref}><Text>b</Text></Stack></Stack>)
}`

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

describe('@pyreon/dnd useDraggable / useDroppable → native', () => {
  describe('the crossing is clean', () => {
    it('correct usage emits ZERO warnings on both targets', () => {
      for (const src of [BOARD, MEMBER]) {
        expect(swift(src).warnings).toEqual([])
        expect(kotlin(src).warnings).toEqual([])
      }
    })

    it('the package-level WEB-ONLY warning is gone (earned by the lowering)', () => {
      for (const w of [...swift(BOARD).warnings, ...kotlin(BOARD).warnings]) {
        expect(w).not.toContain('is WEB-ONLY')
      }
    })
  })

  describe('Swift emit', () => {
    const code = swift(BOARD).code

    it('declares both engines; the droppable decodes the ANNOTATED type', () => {
      expect(code).toContain('@State private var __pyHook0 = PyreonDraggableState()')
      expect(code).toContain('PyreonDroppableState<Card>(edges: [.top, .bottom])')
    })

    it('binds the data object as a map of scalars', () => {
      expect(code).toContain('bind(data: { ["id": PyreonDragValue("c1"), "kind": PyreonDragValue("card")] })')
    })

    it('binds canDrop as an expression and onDrop as void statements', () => {
      expect(code).toContain('canDrop: { src in src.kind == "card" }')
      expect(code).toContain('onDrop: { src, loc in')
      expect(code).not.toMatch(/onDrop: \{ src, loc in\s+return /)
    })

    it('ref={…} becomes the drag source / drop target modifiers', () => {
      expect(code).toContain('.pyreonDraggable(__pyHook0)')
      expect(code).toContain('.pyreonDroppable(__pyHook1)')
    })

    it('a reactive disabled and an arrow-returned data both bind', () => {
      const m = swift(MEMBER).code
      expect(m).toContain('bind(data: { ["id": PyreonDragValue("c2"), "n": PyreonDragValue(3)] }, disabled: { locked })')
      expect(m).toContain('onDragEnter: {')
    })

    it('an onDrop that ignores the location leaves the argument anonymous', () => {
      expect(swift(MEMBER).code).toContain('onDrop: { src, _ in')
    })
  })

  describe('Kotlin emit', () => {
    const code = kotlin(BOARD).code

    it('declares both engines with the decoder for the annotated type', () => {
      expect(code).toContain('remember { PyreonDraggableState() }')
      expect(code).toContain(
        'PyreonDroppableState<Card>(listOf(PyreonDropEdge.TOP, PyreonDropEdge.BOTTOM), { pyreonDecodeDrag<Card>(it) })',
      )
    })

    it('binds the data map, canDrop, and a void onDrop (no `return` inside the lambda)', () => {
      expect(code).toContain('bind({ mapOf("id" to "c1", "kind" to "card") })')
      expect(code).toContain('canDrop = { src -> src.kind == "card" }')
      expect(code).toContain('onDrop = { src, loc ->')
      expect(code).not.toMatch(/onDrop = \{ src, loc ->\s+return /)
    })

    it('ref={…} becomes the drag source / drop target modifiers', () => {
      expect(code).toContain('Modifier.pyreonDraggable(__pyHook0)')
      expect(code).toContain('Modifier.pyreonDroppable(__pyHook1)')
    })
  })

  describe('what cannot cross warns BY NAME', () => {
    const drag = (cfg: string) => `${IMPORTS}
export function App() {
  const { ref } = useDraggable(${cfg})
  return (<Stack><Text ref={ref}>a</Text></Stack>)
}`
    const drop = (cfg: string) => `${IMPORTS}
export function App() {
  const { ref } = useDroppable(${cfg})
  return (<Stack ref={ref}><Text>a</Text></Stack>)
}`
    const warnings = (src: string) => swift(src).warnings

    it.each(['onDragStart: () => {}', 'onDragEnd: () => {}', 'preview: { render: () => {} }', 'handle: () => null', 'element: () => null'])(
      'useDraggable `%s` is reported, not silently dropped',
      (opt) => {
        const key = opt.split(':')[0] as string
        const w = warnings(drag(`{ data: { id: 'a' }, ${opt} }`))
        expect(w.some((x) => x.includes('useDraggable') && x.includes(`\`${key}\``))).toBe(true)
      },
    )

    it.each(['data: { id: 1 }', 'sticky: true', 'element: () => null'])('useDroppable `%s` is reported', (opt) => {
      const key = opt.split(':')[0] as string
      const w = warnings(drop(`{ onDrop: (s: Card) => {}, ${opt} }`))
      expect(w.some((x) => x.includes('useDroppable') && x.includes(`\`${key}\``))).toBe(true)
    })

    it('onDragEnter cannot receive the source natively — it names isOver()', () => {
      const w = warnings(drop(`{ onDrop: (s: Card) => {}, onDragEnter: (s: Card) => {} }`))
      expect(w.some((x) => x.includes('onDragEnter') && x.includes('isOver()'))).toBe(true)
    })

    it('a droppable without an annotated source parameter bails with the reason', () => {
      const w = warnings(drop(`{ onDrop: (s) => {} }`))
      expect(w.some((x) => x.includes('needs a type annotation'))).toBe(true)
      expect(swift(drop(`{ onDrop: (s) => {} }`)).code).not.toContain('PyreonDroppableState')
    })

    it('canDrop and onDrop annotating different types bails', () => {
      const w = warnings(drop(`{ canDrop: (s: Card) => true, onDrop: (s: string) => {} }`))
      expect(w.some((x) => x.includes('annotate different source types'))).toBe(true)
    })

    it('a multi-statement canDrop bails rather than accepting every drop', () => {
      const w = warnings(drop(`{ canDrop: (s: Card) => { const k = s.kind; return k === 'card' }, onDrop: (s: Card) => {} }`))
      expect(w.some((x) => x.includes('`canDrop` must be a one-parameter expression-body'))).toBe(true)
    })

    it('a non-literal data bails', () => {
      const w = warnings(drag(`{ data: card }`))
      expect(w.some((x) => x.includes('`data` must be an object literal'))).toBe(true)
    })

    it('a missing data bails', () => {
      const w = warnings(drag(`{ disabled: true }`))
      expect(w.some((x) => x.includes('`data` is required'))).toBe(true)
    })

    it('a spread inside data bails', () => {
      const w = warnings(drag(`{ data: { ...card } }`))
      expect(w.some((x) => x.includes('static key'))).toBe(true)
    })
  })

  it('an UNRELATED ref is untouched (no mis-lowering)', () => {
    const src = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const other = signal(0)
  return (<Stack><Text ref={other}>x</Text></Stack>)
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const code = transform(src, { target }).code
      expect(code).not.toContain('pyreonDraggable')
      expect(code).not.toContain('pyreonDroppable')
    }
  })

  describe('real-toolchain validation', () => {
    for (const [label, src] of [['board', BOARD], ['member', MEMBER]] as const) {
      it.skipIf(!isSwiftcAvailable())(`Swift: the ${label} emit type-checks`, () => {
        const r = validateSwiftWithStubs(swift(src).code)
        expect(r.ok, r.error ?? '').toBe(true)
      })

      it.skipIf(!isKotlincAvailable())(`Kotlin: the ${label} emit compiles`, () => {
        const r = validateKotlin(kotlin(src).code)
        expect(r.ok, r.error ?? '').toBe(true)
      })
    }
  })
})
