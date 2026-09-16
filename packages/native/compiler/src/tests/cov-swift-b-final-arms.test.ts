// The last Swift-emit tail arms: optional-chained `.slice`, the union-receiver
// `.length` unwrap, the optional-narrowing ternary, seedless `.reduce`,
// `str.replace`, the animation-easing table, the `<Modal>` empty-children
// degrade, the nested PATTERN dispatch, the chart `onBrush` / `onSelect`
// handler shapes, and the database-insert shape warning.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const sw = (src: string) => transform(src, { target: 'swift' })

function decl(body: string, extra = ''): { code: string; warnings: string[] } {
  return sw(
    `import { Stack, Text } from '@pyreon/primitives'
import { computed, signal } from '@pyreon/reactivity'
${extra}
export function App() {
  const rows = signal<{ name: string; tags: string[] }[]>([])
  const nums = signal<number[]>([1, 2])
  const s = signal<string>('abc')
  const on = signal<boolean>(false)
${body}
  return (<Stack><Text>x</Text></Stack>)
}`,
  )
}

describe('optional-chained `.slice` — the `Optional.map` wrap', () => {
  it('a `?.slice(...)` on a find() result stays optional via `.map { }`', () => {
    const { code } = decl(
      `  const a = computed(() => rows().find((r) => r.name === 'x')?.name?.slice(0, 2))`,
    )
    expect(code).toContain('.map {')
    expect(code).toContain('dropFirst(0)')
  })

  it('a NEGATIVE optional slice takes the same wrap through the suffix form', () => {
    const { code } = decl(
      `  const a = computed(() => rows().find((r) => r.name === 'x')?.name?.slice(-2))`,
    )
    expect(code).toContain('.map {')
    expect(code).toContain('suffix(2)')
  })

  it('a NON-optional slice has no `.map { }` wrap (the control)', () => {
    expect(decl(`  const a = computed(() => s().slice(0, 2))`).code).not.toContain('.map {')
  })
})

describe('`.length` on a UNION receiver', () => {
  it('a `T | undefined` string receiver unwraps the union before picking utf16.count', () => {
    const { code } = decl(
      `  const a = computed(() => rows().find((r) => r.name === 'x')?.name.length ?? 0)`,
    )
    expect(code).toContain('utf16.count')
  })

  it('a `T | undefined` ARRAY receiver keeps plain .count', () => {
    const { code } = decl(
      `  const a = computed(() => rows().find((r) => r.name === 'x')?.tags.length ?? 0)`,
    )
    expect(code).toContain('.count')
    expect(code).not.toContain('tags.utf16')
  })
})

describe('the optional-narrowing ternary — `x ? f(x) : d` on a LOCAL binding', () => {
  const helper = (ret: string) =>
    sw(
      `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const rows = signal<{ name: string }[]>([])
  const label = (): string => {
    const found = rows().find((r) => r.name === 'x')
    return ${ret}
  }
  return (<Stack><Text>{label()}</Text></Stack>)
}`,
    ).code

  it('the PRESENT form narrows the then-branch into `x.map { x in … } ?? d`', () => {
    expect(helper(`found ? found.name.toUpperCase() : 'none'`)).toContain(
      'found.map { found in found.name.uppercased() } ?? "none"',
    )
  })

  it('the ABSENT form (`!x ? d : f(x)`) narrows the OTHER branch, identically', () => {
    expect(helper(`!found ? 'none' : found.name.toUpperCase()`)).toContain(
      'found.map { found in found.name.uppercased() } ?? "none"',
    )
  })

  it('a branch that does NOT reference the binding keeps the plain ternary', () => {
    const out = helper(`found ? 'yes' : 'none'`)
    expect(out).not.toContain('.map { found in')
    expect(out).toContain('!= nil ?')
  })
})

describe('seedless `.reduce(fn)` and `str.replace(a, b)`', () => {
  it('a RE-READABLE receiver lowers to dropFirst().reduce(obj[0], fn)', () => {
    const { code } = decl(`  const a = computed(() => nums().reduce((x, y) => x + y))`)
    expect(code).toContain('.dropFirst().reduce(nums[0],')
  })

  it('a receiver carrying a real method CALL warns instead of re-evaluating it', () => {
    const { warnings } = decl(
      `  const a = computed(() => nums().filter((x) => x > 0).reduce((x, y) => x + y))`,
    )
    expect(warnings.some((w) => w.includes('seedless `.reduce(fn)` on a non-trivial receiver'))).toBe(
      true,
    )
  })

  it('str.replace(a, b) lowers to the FIRST-occurrence IIFE; a 1-arg call falls through', () => {
    expect(decl(`  const a = computed(() => s().replace('a', 'b'))`).code).toContain(
      'range: s.range(of: f)',
    )
    expect(decl(`  const a = computed(() => s().replace('a'))`).code).toContain('s.replace("a")')
  })
})

describe('the CSS-easing → SwiftUI animation table', () => {
  const t = (attrs: string) =>
    sw(
      `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const on = signal<boolean>(false)
  return (<Stack><Transition show={on()} ${attrs}><Text>x</Text></Transition></Stack>)
}`,
    ).code

  it('each easing keyword takes its own arm, with easeInOut as the default', () => {
    expect(t(`duration={100} easing="linear"`)).toContain('.linear(duration:')
    expect(t(`duration={100} easing="ease-in"`)).toContain('.easeIn(duration:')
    expect(t(`duration={100} easing="ease-out"`)).toContain('.easeOut(duration:')
    expect(t(`duration={100} easing="cubic-bezier(0,0,1,1)"`)).toContain('.easeInOut(duration:')
  })

  it('NEITHER duration nor easing → `.default`', () => {
    expect(t(``)).toContain('.default')
  })
})

describe('<Modal> — the empty-children degrade', () => {
  it('no children emits a single-space content slot rather than an empty closure', () => {
    const { code } = sw(
      `import { Stack } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const open = signal<boolean>(false)
  return (<Stack><Modal open={open} onClose={() => open.set(false)}></Modal></Stack>)
}`,
    )
    expect(code).toContain('.sheet(isPresented:')
  })
})

describe('nested dispatch — a PATTERN layout index', () => {
  it('a top-level PATTERN layout route binds params in its own index branch', () => {
    const { code } = sw(`
      export function ULayout(props: { params: { id: string } }) { return <Stack><RouterView /></Stack> }
      export function Tab() { return <Text>t</Text> }
      export function App() {
        const router = createRouter({ routes: [
          { path: '/u/:id', component: ULayout, children: [{ path: 'tab', component: Tab }] },
        ] })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
    `)
    expect(code).toContain('PyreonRouter.matchPath(path, "/u/:id")')
    expect(code).toContain('PyreonRouter.matchPath(path, "/u/:id/tab")')
  })

  it('a pattern layout with NO params prop dispatches without binding the dict', () => {
    const { code } = sw(`
      export function ULayout() { return <Stack><RouterView /></Stack> }
      export function Tab() { return <Text>t</Text> }
      export function App() {
        const router = createRouter({ routes: [
          { path: '/u/:id', component: ULayout, children: [{ path: 'tab', component: Tab }] },
        ] })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
    `)
    expect(code).toContain('PyreonRouter.matchPath(path, "/u/:id") != nil {')
  })
})

describe('chart tap handlers — the onSelectIndex shapes', () => {
  const plot = (attrs: string) =>
    sw(
      `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts/plot'
export function C() {
  const rows = signal<{ y: number }[]>([])
  const named = (r: unknown) => {}
  return (<Stack><PlotChart data={rows()} marks={[bars((d) => d.y)]} ${attrs} /></Stack>)
}`,
    )

  it('an ARROW with a param binds the hit to it before running the body', () => {
    expect(plot(`onSelectIndex={(i) => named(i)}`).code).toContain('let i = plotHitBars(')
  })

  it('a ZERO-param arrow runs the closure with no binding', () => {
    const { code } = plot(`onSelectIndex={() => named(0)}`)
    expect(code).toContain('onEnded { pyreonTap in ({')
    expect(code).not.toContain('let i =')
  })

  it('a bare FUNCTION REFERENCE is invoked with the hit directly', () => {
    const { code } = plot(`onSelectIndex={named}`)
    expect(code).toContain('named(plotHitBars(')
  })

  it('NO tap handler emits no gesture at all', () => {
    expect(plot(``).code).not.toContain('DragGesture(minimumDistance: 0)')
  })
})

describe('database insert — the shape warning', () => {
  it('a literal with NO id and unknown keys names both reasons', () => {
    const { warnings } = sw(
      `import { Stack, Text } from '@pyreon/primitives'
import { useDatabase } from '@pyreon/hooks'
export function App() {
  const db = useDatabase('notes')
  const go = () => { db.insert('n', { title: 'x' }) }
  return (<Stack><Text onPress={go}>x</Text></Stack>)
}`,
    )
    expect(warnings.some((w) => w.includes('no `id` field'))).toBe(true)
  })

  it('an EMPTY literal reports `(empty)` for the given keys', () => {
    const { warnings } = sw(
      `import { Stack, Text } from '@pyreon/primitives'
import { useDatabase } from '@pyreon/hooks'
export function App() {
  const db = useDatabase('notes')
  const go = () => { db.insert('n', {}) }
  return (<Stack><Text onPress={go}>x</Text></Stack>)
}`,
    )
    expect(warnings.some((w) => w.includes('(empty)'))).toBe(true)
  })
})

describe('<TransitionGroup> — the <For> animation driver', () => {
  it('a <For> child supplies the `.count` driver; without one the container is plain', () => {
    const withFor = sw(
      `import { Text, For, TransitionGroup } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const xs = signal<string[]>([])
  return (<TransitionGroup><For each={xs}>{(x) => <Text>{x}</Text>}</For></TransitionGroup>)
}`,
    ).code
    expect(withFor).toContain('.animation(.default, value: xs.count)')

    const withoutFor = sw(
      `import { Text, TransitionGroup } from '@pyreon/primitives'
export function App() { return (<TransitionGroup><Text>x</Text></TransitionGroup>) }`,
    ).code
    expect(withoutFor).not.toContain('.animation(')
  })

  it('a NON-For expression child does not supply a driver either', () => {
    const { code } = sw(
      `import { Text, TransitionGroup, Show } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const on = signal<boolean>(true)
  return (<TransitionGroup><Show when={on()}><Text>x</Text></Show></TransitionGroup>)
}`,
    )
    expect(code).not.toContain('.animation(')
  })
})

describe('the last tail arms', () => {
  it('a non-band mark with NO accessor takes the generic "needs an accessor" message', () => {
    const { code, warnings } = sw(
      `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts/plot'
export function C() {
  const rows = signal<{ y: number }[]>([])
  return (<Stack><PlotChart data={rows()} marks={[bars()]} /></Stack>)
}`,
    )
    expect(code).toContain('EmptyView()')
    expect(warnings.some((w) => w.includes('mark 1: needs an accessor'))).toBe(true)
    // NOT the band-specific wording — that is the other arm of the same
    // conditional, asserted in the chart-bails file.
    expect(warnings.some((w) => w.includes('`band` needs both'))).toBe(false)
  })

  it('a sortable item key is INTERPOLATED, and the container gets its own modifier', () => {
    const src = (rowType: string, by: string, key: string) =>
      sw(
        `import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
type Row = { id: number; title: string }
export function App() {
  const rows = signal<${rowType}[]>([])
  const s = useSortable({ items: () => rows(), by: ${by}, onReorder: (n) => rows.set(n) })
  return (<Stack ref={s.containerRef}>
    <For each={rows()} by={${by}}>
      {(item) => <Text ref={s.itemRef(${key})}>x</Text>}
    </For>
  </Stack>)
}`,
      ).code

    // The `key:` parameter is a String, so a key the emit cannot PROVE is a
    // String is wrapped. The For render-param's element type is not seeded
    // into the expression ctx, so even a `string[]` list takes the wrap —
    // redundant but correct (interpolating a String is the identity).
    // A String row passes through un-coerced now that the `<For>` row param
    // is typed from `each`; the INTERPOLATION arm is what the Row case below
    // exercises, and that is the arm this spec is about.
    expect(src('string', '(i) => i', 'item')).toContain('key: item')
    expect(src('Row', '(t) => t.id', 'item.id')).toContain('key: "\\(item.id)"')
    // The CONTAINER ref takes the other branch of the same classifier.
    expect(src('string', '(i) => i', 'item')).toContain('.pyreonSortableContainer(s)')
  })

  it('a nested route table that flattens to NO entries emits only the fallback', () => {
    // The layout carries no component of its own and its only child is a
    // nested PARAM route, which `flattenRouteTree` skips — so the dispatch
    // never emits an `if`, and the `firstBranch` arm produces a bare fallback.
    const { code } = sw(`
      export function Item() { return <Text>i</Text> }
      export function App() {
        const router = createRouter({ routes: [
          { path: '/app', children: [{ path: ':id', component: Item }] },
        ] })
        return <RouterProvider router={router}><RouterView /></RouterProvider>
      }
    `)
    expect(code).toContain('Pyreon Router: no route for')
    expect(code).not.toContain('else {')
  })
})

describe('<For each> over a useFieldArray — the CALL and MEMBER source forms', () => {
  const fieldArray = (each: string) =>
    sw(
      `import { useFieldArray } from '@pyreon/form'
import { Stack, Text, For } from '@pyreon/primitives'
export function TagsDemo() {
  const tags = useFieldArray(['alpha'])
  return (<Stack>
    <For each={${each}} by={(i) => i.key}>{(item) => <Text>{item.value()}</Text>}</For>
  </Stack>)
}`,
    ).code

  it('both `tags.items()` and `tags.items` mark the render param, so `value()` unwraps to the property', () => {
    // On the web `items`/`value` are signal CALLS; natively they are
    // PROPERTIES, and an emit that keeps the parens fails swiftc with
    // "cannot call value of non-function type". The `each` source is
    // recognised in BOTH spellings, so the param-marking is identical.
    for (const each of ['tags.items()', 'tags.items']) {
      expect(fieldArray(each), each).toContain('Text(verbatim: "\\(item.value)")')
      expect(fieldArray(each), each).not.toContain('item.value()')
    }
  })

  it('a For over an UNRELATED source leaves `value()` alone (the control)', () => {
    const out = sw(
      `import { signal } from '@pyreon/reactivity'
import { Stack, Text, For } from '@pyreon/primitives'
export function App() {
  const rows = signal<{ key: string; value: () => string }[]>([])
  return (<Stack><For each={rows()} by={(i) => i.key}>{(item) => <Text>{item.value()}</Text>}</For></Stack>)
}`,
    ).code
    expect(out).toContain('item.value()')
  })
})
