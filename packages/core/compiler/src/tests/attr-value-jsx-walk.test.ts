/**
 * JSX inside an attribute value is WALKED, never sliced (#4797).
 *
 * A render prop (`render={() => <For each={items}>…</For>}`), a handler or a
 * ref that builds JSX used to be sliced as raw source: the signal auto-call
 * ran over the whole span, so a component prop in the nested JSX became a
 * one-time read (`each={items()}`, `when={open()}`) with no `_rp` wrapper, and
 * the `<For>` / `<Show>` never updated. The same prop at a component's top
 * level is `_rp(() => items())`.
 *
 * The rule: the h() path walks an unwrapped attribute value that builds JSX
 * (`walkHPath`: identifier edits outside the JSX, every JSX rule inside it,
 * JSX kept on h()), and a template element whose attribute value builds JSX
 * bails to h() (`hasBailAttr`), because the template emit slices the value
 * into its bind code. Byte-identical in both backends.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (
  ...args: [string, string, boolean, string[] | null, boolean?, unknown?, boolean?]
) => { code: string }

let nativeTransform: NativeTransform | null = null

try {
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  nativeTransform = (
    requireAddon(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as {
      transformJsx: NativeTransform
    }
  ).transformJsx
} catch {
  // The JS contract still runs; native parity runs when the addon is built.
}

const app = (jsx: string) =>
  `import { signal } from '@pyreon/reactivity'\nfunction App(props) {\n  const items = signal([])\n  const open = signal(false)\n  const label = props.label\n  return ${jsx}\n}`

const t = (jsx: string, ssr = false) => transformJSX_JS(app(jsx), 'a.tsx', { ssr }).code

/** Every shape: the JSX a function builds, in every attribute position. */
const SHAPES: Record<string, { jsx: string; has: string[]; not?: string[] }> = {
  'render prop: <For each={signal}>': {
    jsx: '<Slot render={() => <ul><For each={items} by={(x) => x}>{(x) => <li>{x}</li>}</For></ul>} />',
    has: ['each={_rp(() => items())}'],
    not: ['each={items()}'],
  },
  'render prop: <Show when={signal}>': {
    jsx: '<Slot render={() => <Show when={open}><b>open</b></Show>} />',
    has: ['when={_rp(() => open())}'],
    not: ['when={open()}'],
  },
  'render prop: a derived prop': {
    jsx: '<Slot render={() => <Show when={!open}><b>x</b></Show>} />',
    has: ['when={_rp(() => !open())}'],
  },
  'render prop: function expression': {
    jsx: '<Slot render={function () { return <Show when={open}><b>x</b></Show> }} />',
    has: ['when={_rp(() => open())}'],
  },
  'render prop with a parameter and a ternary': {
    jsx: '<Slot render={(x) => (x ? <Show when={open} /> : null)} />',
    has: ['when={_rp(() => open())}'],
  },
  'render prop in an object literal': {
    jsx: '<Slot cfg={{ render: () => <Show when={open} /> }} />',
    has: ['when={_rp(() => open())}'],
  },
  'render prop: DOM attribute and child stay live': {
    jsx: '<Slot render={() => <i title={open}>{open}</i>} />',
    has: ['title={() => open()}', '{() => open()}'],
  },
  'render prop: signal read outside the JSX is still called': {
    jsx: '<Slot render={() => { const v = open; return <Show when={open}>{v}</Show> }} />',
    has: ['const v = open()', 'when={_rp(() => open())}'],
  },
  'render prop: prop-derived const is inlined outside and inside the JSX': {
    jsx: '<Slot render={() => { const v = label; return <Comp v={label}>{v}</Comp> }} />',
    has: ['const v = (props.label)', 'v={_rp(() => (props.label))}'],
  },
  'handler on a component': {
    jsx: '<Btn onClick={() => show(<Show when={open} />)} />',
    has: ['when={_rp(() => open())}'],
  },
  'handler on a template element bails to h()': {
    jsx: '<button onClick={() => show(<Show when={open} />)}>x</button>',
    has: ['<button onClick={() => show(<Show when={_rp(() => open())} />)}>x</button>'],
    not: ['_tpl(', '__ev_click'],
  },
  'ref that builds JSX on a template element bails to h()': {
    jsx: '<div ref={(el) => show(el, <Show when={open} />)}>x</div>',
    has: ['when={_rp(() => open())}'],
    not: ['_tpl('],
  },
  'function-valued DOM attribute on a template element bails to h()': {
    jsx: '<button data-r={() => <Show when={open} />}>x</button>',
    has: ['when={_rp(() => open())}'],
    not: ['_tpl('],
  },
}

describe('JSX in an attribute value is walked, not sliced (#4797)', () => {
  for (const [name, { jsx, has, not = [] }] of Object.entries(SHAPES)) {
    it(name, () => {
      const out = t(jsx)
      for (const h of has) expect(out).toContain(h)
      for (const n of not) expect(out).not.toContain(n)
    })
  }

  it('the handler of a template element that builds no JSX keeps its template', () => {
    const out = t('<button onClick={() => open.set(!open)}>x</button>')
    expect(out).toContain('_tpl(')
    expect(out).toContain('open.set(!open())')
  })

  it('SSR walks the render prop the same way', () => {
    const out = t('<Slot render={() => <For each={items} by={(x) => x}>{(x) => <li>{x}</li>}</For>} />', true)
    expect(out).toContain('each={_rp(() => items())}')
  })
})

describe.runIf(nativeTransform !== null)('JSX in an attribute value: the native backend is byte-identical', () => {
  for (const [name, { jsx }] of Object.entries(SHAPES)) {
    it(name, () => {
      for (const [ssr, ssrTemplate] of [
        [false, false],
        [true, false],
        [true, true],
      ] as const) {
        const js = transformJSX_JS(app(jsx), 'a.tsx', { ssr, ssrTemplate }).code
        const rs = nativeTransform!(app(jsx), 'a.tsx', ssr, null, false, undefined, ssrTemplate).code
        expect(rs, `ssr=${ssr} ssrTemplate=${ssrTemplate}`).toBe(js)
      }
    })
  }
})
