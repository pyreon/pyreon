/**
 * JSX in an attribute value: render props are WALKED, handlers stay SLICED
 * (#4797).
 *
 * A render prop (`render={() => <For each={items}>…</For>}`) was sliced as
 * raw source: the signal auto-call ran over the whole span, so a component
 * prop in its JSX became a one-time read (`each={items()}`) with no `_rp`
 * wrapper, and the `<For>` / `<Show>` never updated.
 *
 * The rule:
 * - A non-handler, non-ref value that builds JSX is DECLARATIVE: the h() path
 *   walks it (`walkHPath`: identifier edits outside the JSX, every JSX rule
 *   inside it, JSX kept on h()), a template element carrying one bails to h()
 *   (`hasBailAttr`), and a spread argument that builds JSX gets this rule per
 *   property (`walkSpreadArg`).
 * - An `on*` handler or a `ref` is IMPERATIVE code that builds JSX at event
 *   time: it stays a slice on every path (template bind, h(), rocketstyle
 *   collapse), so an explicit read there is the event-time value as written.
 *   Inside that JSX an EXACTLY-BARE signal prop or child is not auto-called
 *   (`sliceHandlerValue`), so the signal itself is passed, as in 0.53.
 * Byte-identical in both backends.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { rocketstyleCollapseKey, transformJSX_JS } from '../jsx'

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
  'function-valued DOM attribute on a template element bails to h()': {
    jsx: '<button data-r={() => <Show when={open} />}>x</button>',
    has: ['when={_rp(() => open())}'],
    not: ['_tpl('],
  },
  'handler on a component: a bare signal prop in its JSX stays the signal': {
    jsx: '<Btn onClick={() => show(<Show when={open} />)} />',
    has: ['show(<Show when={open} />)'],
    not: ['open()', '_rp('],
  },
  'handler on a template element: stays templated, bare prop and child stay bare': {
    jsx: '<button onClick={() => show(<Comp v={open}>{open}</Comp>)}>x</button>',
    has: ['_tpl(', '__ev_click = () => show(<Comp v={open}>{open}</Comp>)'],
  },
  'handler: an explicit read in its JSX is the event-time value': {
    jsx: '<button onClick={() => { show(<Comp row={open()} n={open + 1} />); open.set(false) }}>x</button>',
    has: ['_tpl(', 'row={open()}', 'n={open() + 1}', 'open.set(false)'],
    not: ['_rp(', '_rpd('],
  },
  'ref that builds JSX: stays templated, bare prop stays bare': {
    jsx: '<div ref={(el) => show(el, <Show when={open} />)}>x</div>',
    has: ['_tpl(', '_ref(__root, (el) => show(el, <Show when={open} />))'],
  },
  'spread on a component: render prop walked, handler sliced, plain value called': {
    jsx: '<Comp {...{ render: () => <For each={items}>{(x) => x}</For>, onClick: () => show(<D v={open} w={open()} />), title: open }} />',
    has: [
      '_wrapSpread({ render: () => <For each={_rp(() => items())}>',
      'onClick: () => show(<D v={open} w={open()} />)',
      'title: open()',
    ],
  },
  'spread on a component: non-object argument walked whole': {
    jsx: '<Comp {...(flag ? { r: () => <D v={open} /> } : {})} />',
    has: ['_wrapSpread((flag ? { r: () => <D v={_rp(() => open())} /> } : {}))'],
  },
  'spread: a shorthand property keeps the binding (never auto-called)': {
    jsx: '<Comp {...{ items, open, render: () => <b /> }} />',
    has: ['_wrapSpread({ items, open, render: () => <b /> })'],
    not: ['items()', 'open()'],
  },
  'spread on a DOM element: a shorthand property keeps the binding': {
    jsx: '<div {...{ items, render: () => <b /> }}>t</div>',
    has: ['<div {...{ items, render: () => <b /> }}>t</div>'],
  },
  'spread: method, computed key and nested spread properties': {
    jsx: '<Comp {...{ ...base, [open ? "a" : "b"]: () => <Show when={open} />, render() { return <For each={items}>{(x) => x}</For> } }} />',
    has: ['[open() ? "a" : "b"]: () => <Show when={_rp(() => open())} />', 'each={_rp(() => items())}', '...base'],
  },
  'attribute render callback: its parameter is an item, not props (like the child form)': {
    jsx: '<For each={items} by={(x) => x} children={(item) => <li>{item.text}</li>} />',
    has: ['children={(item) => <li>{item.text}</li>}'],
    not: ['() => item.text'],
  },
  'attribute render callback: a const from its parameter is not inlined per use': {
    jsx: '<List render={(item) => { const id = item.id ?? Math.random(); return <div><label for={id}>L</label><input id={id} /></div> }} />',
    has: ['const id = item.id ?? Math.random()', '<label for={id}>', '<input id={id} />'],
  },
  'spread-object render callback: its parameter is an item': {
    jsx: '<Comp {...{ render: (item) => <li>{item.text}</li> }} />',
    has: ['render: (item) => <li>{item.text}</li>'],
  },
  'spread on a DOM element that builds JSX bails to h()': {
    jsx: '<div {...{ render: () => <For each={items}>{(x) => x}</For> }}>t</div>',
    has: ['<div {...{ render: () => <For each={_rp(() => items())}>'],
    not: ['_tpl(', '_applyProps('],
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
        // Parse each output independently: two backends could agree on invalid code.
        expect(parseSync('a.tsx', js).errors, js).toEqual([])
        expect(parseSync('a.tsx', rs).errors, rs).toEqual([])
        expect(rs, `ssr=${ssr} ssrTemplate=${ssrTemplate}`).toBe(js)
      }
    })
  }
})

describe('rocketstyle collapse: a peeled handler that builds JSX follows the handler rule', () => {
  const SITE = { templateHtml: '<button>Save</button>', lightClass: 'l', darkClass: 'd', rules: ['.l{}', '.d{}'], ruleKey: 'rk' }
  const MODE = { name: 'useMode', source: '@pyreon/ui-core' }

  it('`__rsCollapseH` keeps a bare signal prop bare and an explicit read as written, in both backends', () => {
    const key = rocketstyleCollapseKey('Button', {}, 'Save')
    const src =
      `import { signal } from '@pyreon/reactivity'\nconst count = signal(0)\n` +
      `export const C = () => <Button onClick={() => open(<Dialog v={count} w={count()} />)}>Save</Button>`
    const js = transformJSX_JS(src, 'collapse.tsx', {
      collapseRocketstyle: { candidates: new Set(['Button']), sites: new Map([[key, SITE]]), mode: MODE } as never,
    }).code
    expect(js).toContain('__rsCollapseH(')
    expect(js).toContain('open(<Dialog v={count} w={count()} />)')
    if (nativeTransform) {
      const rs = (nativeTransform as unknown as (...a: unknown[]) => { code: string })(
        src,
        'collapse.tsx',
        false,
        null,
        false,
        { candidates: ['Button'], sites: { [key]: SITE }, mode: MODE },
      ).code
      expect(rs).toBe(js)
    }
  })
})
