// `@pyreon/dnd` → native: the `useSortable` list-reorder crossing.
//
// The web hook returns REF CALLBACKS an author attaches to DOM nodes. On
// native there are no DOM refs, so `ref={s.containerRef}` / `ref={s.itemRef(k)}`
// lower to view modifiers instead — which is what lets ONE source drive the
// drag on all three targets. The reorder ARITHMETIC is a verbatim port of
// `performReorder` (locked in the co-located native tests against values taken
// from running the real web engine), so a reorder produces the same list
// everywhere while each platform keeps its own gesture.
//
// Scope is deliberately ONE hook. useDraggable/useDroppable (imperative
// element-getter registration), useDragMonitor (a page-global drag bus) and
// useFileDrop (OS-level file DnD) have no native analogue and MUST keep
// warning by name — several specs below assert exactly that, so the crossing
// can never quietly over-claim.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

/** The canonical documented usage: a string-keyed list of scalars. */
const SCALAR = `import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const items = signal<string[]>(['a', 'b', 'c'])
  const s = useSortable({ items: () => items(), by: (i) => i, onReorder: (n) => items.set(n) })
  return (<Stack ref={s.containerRef}>
    <For each={items()} by={(i) => i}>
      {(item) => <Text ref={s.itemRef(item)}>{item}</Text>}
    </For>
  </Stack>)
}`

/** A struct row with a NUMBER key + the horizontal axis. */
const STRUCT = `import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: number; title: string }
export function App() {
  const todos = signal<Todo[]>([{ id: 1, title: 'a' }, { id: 2, title: 'b' }])
  const s = useSortable({
    items: () => todos(),
    by: (t) => t.id,
    onReorder: (next) => todos.set(next),
    axis: 'horizontal',
  })
  return (<Stack ref={s.containerRef}>
    <For each={todos()} by={(t) => t.id}>
      {(t) => <Text ref={s.itemRef(t.id)}>{t.title}</Text>}
    </For>
  </Stack>)
}`

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

describe('@pyreon/dnd useSortable → native', () => {
  describe('the crossing is clean', () => {
    it('Swift: correct usage emits ZERO warnings', () => {
      expect(swift(SCALAR).warnings).toEqual([])
      expect(swift(STRUCT).warnings).toEqual([])
    })

    it('Kotlin: correct usage emits ZERO warnings', () => {
      expect(kotlin(SCALAR).warnings).toEqual([])
      expect(kotlin(STRUCT).warnings).toEqual([])
    })

    it('the package-level WEB-ONLY warning is gone (earned by the lowering)', () => {
      // Derived from the manifest's `nativeFrontend`, so this asserts the
      // manifest and the compiler's generated web-only set agree.
      for (const w of [...swift(SCALAR).warnings, ...kotlin(SCALAR).warnings]) {
        expect(w).not.toContain('is WEB-ONLY')
      }
    })
  })

  describe('Swift emit', () => {
    it('declares the engine as @State with the row type', () => {
      expect(swift(SCALAR).code).toContain(
        '@State private var s = PyreonSortableState<String>()',
      )
      expect(swift(STRUCT).code).toContain(
        '@State private var s = PyreonSortableState<Todo>(axis: .horizontal)',
      )
    })

    it('wires items/by/onReorder in .onAppear (a @State init cannot capture @State)', () => {
      const code = swift(SCALAR).code
      expect(code).toContain('.onAppear {')
      expect(code).toContain('s.bind(')
      expect(code).toContain('items: { items }')
      expect(code).toContain('onReorder: { n in')
      expect(code).toContain('items = n')
    })

    it('`ref={s.containerRef}` → the container modifier', () => {
      expect(swift(SCALAR).code).toContain('.pyreonSortableContainer(s)')
    })

    it('`ref={s.itemRef(key)}` → the item modifier, key coerced to String', () => {
      expect(swift(SCALAR).code).toContain('.pyreonSortableItem(s, key: "\\(item)")')
      // A number key is interpolated rather than passed as Int.
      expect(swift(STRUCT).code).toContain('.pyreonSortableItem(s, key: "\\(t.id)")')
    })
  })

  describe('Kotlin emit', () => {
    it('declares the engine in `remember` with the row type', () => {
      expect(kotlin(SCALAR).code).toContain(
        'val s = remember { PyreonSortableState<String>() }',
      )
      expect(kotlin(STRUCT).code).toContain(
        'val s = remember { PyreonSortableState<Todo>(PyreonSortAxis.HORIZONTAL) }',
      )
    })

    it('binds in the composable body (the state object cannot see the component state)', () => {
      const code = kotlin(SCALAR).code
      expect(code).toContain('s.bind({ items }, { i -> (i).toString() }) { n ->')
      expect(code).toContain('items = n')
    })

    it('the reorder sink is a bare statement, NOT a `return`', () => {
      // `return` inside a Kotlin lambda targets the enclosing function, and an
      // assignment is not an expression — so an expression-body `onReorder`
      // must lower to a plain statement or the emit cannot compile.
      expect(kotlin(SCALAR).code).not.toContain('return items = n')
    })

    it('both refs → Modifier extensions', () => {
      const code = kotlin(SCALAR).code
      expect(code).toContain('Modifier.pyreonSortableContainer(s)')
      expect(code).toContain('Modifier.pyreonSortableItem(s, (item).toString())')
    })
  })

  describe('the unlowered members STILL warn by name', () => {
    // Never silence a warning you did not earn: these four are NOT lowered, so
    // each must keep naming itself. A regression here would let an author ship
    // an app whose drag silently does nothing on device.
    for (const hook of ['useDraggable', 'useDroppable', 'useDragMonitor', 'useFileDrop']) {
      it(`${hook} warns that it has no native lowering`, () => {
        const src = `import { ${hook} } from '@pyreon/dnd'
import { Stack } from '@pyreon/primitives'
export function App() { return (<Stack />) }`
        for (const target of ['swift', 'kotlin'] as const) {
          const warnings = transform(src, { target }).warnings
          expect(warnings.some((w) => w.includes(`${hook}()`))).toBe(true)
          expect(warnings.some((w) => w.includes('NO native lowering'))).toBe(true)
        }
      })
    }

    it('their advice NAMES useSortable as the member that does cross', () => {
      const src = `import { useDraggable } from '@pyreon/dnd'
import { Stack } from '@pyreon/primitives'
export function App() { return (<Stack />) }`
      const w = transform(src, { target: 'swift' }).warnings.join('\n')
      expect(w).toContain('useSortable')
      expect(w).toContain('DOES lower')
    })
  })

  describe('options with no native analogue warn rather than dropping silently', () => {
    const withOption = (opt: string) => `import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack } from '@pyreon/primitives'
export function App() {
  const items = signal<string[]>(['a'])
  const s = useSortable({ items: () => items(), by: (i) => i, onReorder: (n) => items.set(n), ${opt} })
  return (<Stack ref={s.containerRef} />)
}`

    it('groupId (cross-list boards) warns', () => {
      const w = transform(withOption(`groupId: 'board'`), { target: 'swift' }).warnings
      expect(w.some((x) => x.includes('groupId') && x.includes('cross-list'))).toBe(true)
    })

    it('onCrossListReceive warns', () => {
      const w = transform(withOption(`onCrossListReceive: (i, n) => items.set([])`), {
        target: 'kotlin',
      }).warnings
      expect(w.some((x) => x.includes('onCrossListReceive'))).toBe(true)
    })

    it('label (screen-reader text) warns and points at accessibilityLabel', () => {
      const w = transform(withOption(`label: (i) => i`), { target: 'swift' }).warnings
      expect(w.some((x) => x.includes('label') && x.includes('accessibilityLabel'))).toBe(true)
    })
  })

  describe('unlowerable shapes warn + silent-drop rather than emitting broken native', () => {
    const bad = (cfg: string) => `import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack } from '@pyreon/primitives'
export function App() {
  const items = signal<string[]>(['a'])
  const s = useSortable(${cfg})
  return (<Stack />)
}`

    it('a non-literal config warns', () => {
      const w = transform(bad('opts'), { target: 'swift' }).warnings
      expect(w.some((x) => x.includes('must be an object literal'))).toBe(true)
    })

    it('a block-body `items` warns', () => {
      const w = transform(
        bad(`{ items: () => { return items() }, by: (i) => i, onReorder: (n) => items.set(n) }`),
        { target: 'swift' },
      ).warnings
      expect(w.some((x) => x.includes('`items` must be an expression-body getter'))).toBe(true)
    })

    it('a missing `by` warns', () => {
      const w = transform(bad(`{ items: () => items(), onReorder: (n) => items.set(n) }`), {
        target: 'swift',
      }).warnings
      expect(w.some((x) => x.includes('`by` must be a single-param'))).toBe(true)
    })

    it('a missing `onReorder` warns', () => {
      const w = transform(bad(`{ items: () => items(), by: (i) => i }`), {
        target: 'swift',
      }).warnings
      expect(w.some((x) => x.includes('`onReorder` must be an arrow function'))).toBe(true)
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
      expect(transform(src, { target }).code).not.toContain('pyreonSortable')
    }
  })

  describe('real-toolchain validation', () => {
    it.skipIf(!isSwiftcAvailable())('Swift: the scalar emit type-checks', () => {
      const r = validateSwiftWithStubs(swift(SCALAR).code)
      expect(r.ok, r.error ?? '').toBe(true)
    })

    it.skipIf(!isSwiftcAvailable())('Swift: the struct/horizontal emit type-checks', () => {
      const r = validateSwiftWithStubs(swift(STRUCT).code)
      expect(r.ok, r.error ?? '').toBe(true)
    })

    it.skipIf(!isKotlincAvailable())('Kotlin: the scalar emit compiles', () => {
      const r = validateKotlin(kotlin(SCALAR).code)
      expect(r.ok, r.error ?? '').toBe(true)
    })

    it.skipIf(!isKotlincAvailable())('Kotlin: the struct/horizontal emit compiles', () => {
      const r = validateKotlin(kotlin(STRUCT).code)
      expect(r.ok, r.error ?? '').toBe(true)
    })
  })
})
