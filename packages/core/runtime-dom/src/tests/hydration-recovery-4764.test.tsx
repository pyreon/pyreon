/**
 * #4764 — hydration recovery after a server/client divergence, and refs over
 * slot placeholders. Real pipeline throughout: the real compiler
 * (`transformJSX`, with and without `templatizeComponentChildren`, plus the
 * hand-written h() path), real `renderToString`, real `hydrateRoot` / `mount`.
 * Every case compares the hydrated DOM with a fresh client render of the same
 * client tree, then flips the client's signals in both and compares again.
 *
 * 1. A `<For>` with no block at its cursor claimed "the rest of the parent":
 *    inside a reactive range that deleted the range's boundary (the next
 *    insert threw, `<App> threw during hydration`) and every later sibling.
 * 2. A static child's divergence left the cursor on its stale server node; the
 *    next sibling, an accessor or a `<For>` whose server output opens with a
 *    marker, took that node as its content: no row adopted, later siblings
 *    re-created.
 * 3. A compiled literal slot (`_setChildAt`) left the server nodes its value
 *    did not claim inside the range.
 * 4. A client mount threw when a ref cleared its element before the element's
 *    slot lines ran (the compiler emitted `_ref` first). Refs now run after the
 *    element's children, as on the h() path.
 * 5. A ref that adds to an element whose content is a marked range or a mount
 *    hole ran before hydration claimed that content.
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { For, Fragment, h } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import * as server from '@pyreon/runtime-server'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as dom from '../index'
import { bindPolymorphicText } from '../mount'
import * as cases from './_hydration-recovery-4764-cases'

const DEPS: Record<string, unknown> = {
  ...Object.fromEntries(Object.entries(dom).filter(([k]) => k.startsWith('_'))),
  ...Object.fromEntries(Object.entries(core).filter(([k]) => k.startsWith('_'))),
  bindPolymorphicText,
  _bind,
  renderEffect,
  signal,
  h,
  Fragment,
  For,
}

const SSR_DEPS = {
  ...DEPS,
  ...Object.fromEntries(Object.entries(server).filter(([k]) => k.startsWith('_'))),
}

const lower = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, ''), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

type Client = 'compiled' | 'compiled, tcc' | 'h()'
type Side = Client | 'server' | 'server, tcc'

const CLIENTS: Client[] = ['compiled', 'compiled, tcc', 'h()']

function build(src: string, scope: Record<string, unknown>, side: Side): () => unknown {
  const code =
    side === 'h()'
      ? src
      : transformJSX(src, 'case.tsx', {
          templatizeComponentChildren: side === 'compiled, tcc' || side === 'server, tcc',
          ...(side.startsWith('server') ? { ssr: true } : {}),
        }).code
  const deps = { ...(side.startsWith('server') ? SSR_DEPS : DEPS), ...scope }

  return new Function(...Object.keys(deps), `${lower(code)}\nreturn App`)(
    ...Object.values(deps),
  ) as () => unknown
}

/** The server a client pairs with: the SSR compile with the same options; h() with h(). */
const serverFor = (client: Client): Side =>
  client === 'h()' ? 'h()' : client === 'compiled, tcc' ? 'server, tcc' : 'server'

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

function host(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  hosts.push(el)

  return el
}

const sameNodes = (a: Node[], b: Node[]) => a.length === b.length && a.every((n, i) => n === b[i])

/** DOM without comments: adoption keeps the server's markers where a fresh render has its own. */
const shape = (el: Element) => el.innerHTML.replace(/<!--[^>]*-->/g, '')

interface Run {
  hydrated: HTMLElement
  fresh: HTMLElement
  errors: string[]
  mismatches: string[]
}

/**
 * Render `src` on `srv` with `serverScope`, hydrate it with `client` and
 * `clientScope()`, and mount a fresh copy with another `clientScope()`.
 */
async function run(
  src: string,
  srv: Side,
  client: Client,
  serverScope: Record<string, unknown>,
  clientScope: () => Record<string, unknown>,
): Promise<Run & { hydratedScope: Record<string, unknown>; freshScope: Record<string, unknown> }> {
  const hydrated = host()
  hydrated.innerHTML = await renderToString(h(build(src, serverScope, srv) as never, null) as never)
  const errors: string[] = []
  const mismatches: string[] = []
  const origError = console.error
  console.error = (...a: unknown[]) => {
    errors.push(a.map(String).join(' '))
  }
  const off = dom.onHydrationMismatch((ctx) => {
    mismatches.push(`${ctx.type}: ${String(ctx.expected)} vs ${String(ctx.actual)}`)
  })
  const hydratedScope = clientScope()
  dom.disableHydrationWarnings()
  try {
    dom.hydrateRoot(hydrated, h(build(src, hydratedScope, client) as never, null))
  } finally {
    dom.enableHydrationWarnings()
    off()
    console.error = origError
  }
  const fresh = host()
  const freshScope = clientScope()
  dom.mount(h(build(src, freshScope, client) as never, null), fresh)

  return { hydrated, fresh, errors, mismatches, hydratedScope, freshScope }
}

/** Apply the same write to both scopes and compare. */
function flip(
  r: {
    hydrated: HTMLElement
    fresh: HTMLElement
    hydratedScope: Record<string, unknown>
    freshScope: Record<string, unknown>
  },
  name: string,
  value: unknown,
): void {
  ;(r.hydratedScope[name] as { set(v: unknown): void }).set(value)
  ;(r.freshScope[name] as { set(v: unknown): void }).set(value)
  expect(shape(r.hydrated)).toBe(shape(r.fresh))
}

const FOR_IN_RANGE = cases.FOR_IN_RANGE_SRC

const divergentScope = () => ({ show: signal(true), rows: signal([1, 2]), v: [h('i', null, '1')] })

const serverScope = {
  show: signal(true),
  rows: signal([1, 2]),
  v: [h('b', null, '1'), h('b', null, '2')],
}

describe('#4764 (1): a <For> with no block at its cursor stays inside its range', () => {
  // The issue's repro: an h() client against the compiled server. The h()
  // client does not consume the `{v}` slot range, so the accessor adopts that
  // range and its `<For>` meets `<b>1</b>`: the fallback deleted to the end of
  // the parent, the accessor's boundary included.
  for (const client of CLIENTS) {
    it(`${client} client, compiled server`, async () => {
      const r = await run(
        FOR_IN_RANGE,
        client === 'compiled, tcc' ? 'server, tcc' : 'server',
        client,
        serverScope,
        divergentScope,
      )
      expect(r.errors).toEqual([])
      expect(shape(r.hydrated)).toBe(shape(r.fresh))
      expect(shape(r.hydrated)).toBe('<div><i>1</i><li>1</li><li>2</li><span>after</span></div>')
      flip(r, 'rows', [1, 2, 3])
      flip(r, 'show', false)
      flip(r, 'show', true)
      flip(r, 'rows', [3])
    })
  }

  it('a value with more nodes than its server range keeps its recoveries inside the range', async () => {
    // The server renders `<b>` in the accessor's range; the client's first
    // value is longer. The walk's cursor skips plain comments, so after `<b>` it
    // stood on the range's `<!--/$-->`, PAST the accessor's boundary: `<i>`
    // mounted outside the range, and the `<For>` swept the parent from there,
    // `<span>after</span>` included.
    const src =
      'const App = () => <div>{() => (k(), both ? [<b>b</b>, <i>i</i>, () => (on() ? <u>u</u> : null), <For each={() => [1]} by={(r) => r}>{(r) => <li>{r}</li>}</For>] : <b>b</b>)}<span>after</span></div>'
    const scope = (both: boolean) => () => ({ both, on: signal(false), k: signal(0) })
    const r = await run(src, 'h()', 'h()', scope(false)(), scope(true))
    expect(r.errors).toEqual([])
    expect(shape(r.hydrated)).toBe('<div><b>b</b><i>i</i><li>1</li><span>after</span></div>')
    expect(shape(r.hydrated)).toBe(shape(r.fresh))
    flip(r, 'on', true)
    // The accessor re-renders: everything it mounted is cleared first.
    flip(r, 'k', 1)
    expect(shape(r.hydrated)).toBe(
      '<div><b>b</b><i>i</i><u>u</u><li>1</li><span>after</span></div>',
    )
  })
})

describe('#4764 (2): a sibling whose server output opens with a marker skips the stale node a divergence left', () => {
  it('an accessor after a divergent static array adopts its own range', async () => {
    const r = await run(FOR_IN_RANGE, 'h()', 'h()', serverScope, divergentScope)
    expect(r.errors).toEqual([])
    expect(shape(r.hydrated)).toBe(shape(r.fresh))
    flip(r, 'rows', [1, 2, 3])
    flip(r, 'show', false)
    flip(r, 'show', true)
  })

  it('keeps the identity of the server rows and of the trailing sibling', async () => {
    const el = host()
    el.innerHTML = await renderToString(
      h(build(FOR_IN_RANGE, serverScope, 'h()') as never, null) as never,
    )
    const lis = [...el.querySelectorAll('li')]
    const span = el.querySelector('span')
    const mismatches: string[] = []
    const off = dom.onHydrationMismatch((ctx) => {
      mismatches.push(ctx.type)
    })
    dom.disableHydrationWarnings()
    try {
      dom.hydrateRoot(el, h(build(FOR_IN_RANGE, divergentScope(), 'h()') as never, null))
    } finally {
      dom.enableHydrationWarnings()
      off()
    }
    expect(shape(el)).toBe('<div><i>1</i><li>1</li><li>2</li><span>after</span></div>')
    expect(sameNodes([...el.querySelectorAll('li')], lis)).toBe(true)
    expect(el.querySelector('span')).toBe(span)
    // The divergence itself is still reported.
    expect(mismatches).toEqual(['tag'])
  })

  it('a static <For> after a divergent static array adopts its block', async () => {
    const src =
      'const App = () => <div>{v}<For each={() => rows()} by={(r) => r}>{(r) => <li>{r}</li>}</For><span>after</span></div>'
    const el = host()
    el.innerHTML = await renderToString(h(build(src, serverScope, 'h()') as never, null) as never)
    const lis = [...el.querySelectorAll('li')]
    const span = el.querySelector('span')
    const scope = divergentScope()
    dom.disableHydrationWarnings()
    try {
      dom.hydrateRoot(el, h(build(src, scope, 'h()') as never, null))
    } finally {
      dom.enableHydrationWarnings()
    }
    expect(shape(el)).toBe('<div><i>1</i><li>1</li><li>2</li><span>after</span></div>')
    expect(sameNodes([...el.querySelectorAll('li')], lis)).toBe(true)
    expect(el.querySelector('span')).toBe(span)
    scope.rows.set([2, 3])
    expect(shape(el)).toBe('<div><i>1</i><li>2</li><li>3</li><span>after</span></div>')
  })

  it('a divergent static text before an accessor', async () => {
    // The client renders text where the server has an element: the text
    // recovery refuses the element the same way.
    const src =
      'const App = () => <div>{v}{() => (on() ? <em>e</em> : null)}<span>after</span></div>'
    const el = host()
    el.innerHTML = await renderToString(
      h(build(src, { on: signal(true), v: h('b', null, 'b') }, 'h()') as never, null) as never,
    )
    const em = el.querySelector('em')
    const span = el.querySelector('span')
    const on = signal(true)
    dom.disableHydrationWarnings()
    try {
      dom.hydrateRoot(el, h(build(src, { on, v: 'text' }, 'h()') as never, null))
    } finally {
      dom.enableHydrationWarnings()
    }
    expect(shape(el)).toBe('<div>text<em>e</em><span>after</span></div>')
    expect(el.querySelector('em')).toBe(em)
    expect(el.querySelector('span')).toBe(span)
    on.set(false)
    expect(shape(el)).toBe('<div>text<span>after</span></div>')
    on.set(true)
    expect(shape(el)).toBe('<div>text<em>e</em><span>after</span></div>')
  })

  it('a static element after a divergent static array adopts its server element (typed input survives)', async () => {
    const src = cases.INPUT_AFTER_SRC
    const el = host()
    el.innerHTML = await renderToString(
      h(build(src, { v: [h('b', null, '1'), h('b', null, '2')] }, 'h()') as never, null) as never,
    )
    const input = el.querySelector('input') as HTMLInputElement
    const span = el.querySelector('span')
    input.value = 'typed'
    const mismatches: string[] = []
    const off = dom.onHydrationMismatch((ctx) => {
      mismatches.push(ctx.type)
    })
    dom.disableHydrationWarnings()
    try {
      dom.hydrateRoot(el, h(build(src, { v: [h('i', null, '1')] }, 'h()') as never, null))
    } finally {
      dom.enableHydrationWarnings()
      off()
    }
    expect(shape(el)).toBe('<div><i>1</i><input class="in"><span>after</span></div>')
    expect(el.querySelector('input')).toBe(input)
    expect(input.value).toBe('typed')
    expect(el.querySelector('span')).toBe(span)
    expect(mismatches).toEqual(['tag'])
  })

  it('the skip never passes a comment: a tag found only inside a later range is not taken', async () => {
    // The client's static `<span>a</span>` has no server node; the only
    // `<span>` is inside the accessor's range. The skip stops at `<!--$-->`, the
    // span mounts fresh, and the accessor still adopts its own `<span>r</span>`.
    const server = 'const App = () => <div>{v}{() => <span>r</span>}</div>'
    const client = 'const App = () => <div>{v}<span>a</span>{() => <span>r</span>}</div>'
    const el = host()
    el.innerHTML = await renderToString(
      h(build(server, { v: [h('b', null, '1')] }, 'h()') as never, null) as never,
    )
    const r = el.querySelector('span')
    dom.disableHydrationWarnings()
    try {
      dom.hydrateRoot(el, h(build(client, { v: [h('i', null, '1')] }, 'h()') as never, null))
    } finally {
      dom.enableHydrationWarnings()
    }
    expect(shape(el)).toBe('<div><i>1</i><span>a</span><span>r</span></div>')
    expect(el.querySelectorAll('span')[1]).toBe(r)
  })
})

describe('#4764 (3): a compiled literal slot sweeps the server nodes its value did not claim', () => {
  for (const client of ['compiled', 'compiled, tcc'] as const) {
    it(client, async () => {
      const r = await run(FOR_IN_RANGE, serverFor(client), client, serverScope, divergentScope)
      expect(r.errors).toEqual([])
      expect(shape(r.hydrated)).toBe('<div><i>1</i><li>1</li><li>2</li><span>after</span></div>')
      expect(shape(r.hydrated)).toBe(shape(r.fresh))
      // The divergence is reported, not silently rewritten.
      expect(r.mismatches.length).toBeGreaterThan(0)
      flip(r, 'rows', [1, 2, 3])
      flip(r, 'show', false)
      flip(r, 'show', true)
    })
  }

  it('a value that claims nothing (a throwing component) keeps the server markup', async () => {
    // `sweepUnclaimed`'s rule, inside a range: nothing adopted and nothing
    // mounted means hydration did not happen there; keep the inert markup.
    const src = 'const App = () => <div><s/>{v}<span>after</span></div>'
    const el = host()
    el.innerHTML = await renderToString(
      h(build(src, { v: h(() => h('b', null, 'srv'), null) }, 'server') as never, null) as never,
    )
    const origError = console.error
    console.error = () => {}
    dom.disableHydrationWarnings()
    try {
      const Boom = () => {
        throw new Error('boom')
      }
      dom.hydrateRoot(el, h(build(src, { v: h(Boom, null) }, 'compiled') as never, null))
    } finally {
      dom.enableHydrationWarnings()
      console.error = origError
    }
    expect(shape(el)).toBe('<div><s></s><b>srv</b><span>after</span></div>')
  })
})

const REFS = {
  clear: 'el.textContent = ""',
  prepend: 'el.prepend(document.createElement("u"))',
  append: 'el.append(document.createElement("u"))',
  // Reads what h() shows a ref: its computed class and its mounted children.
  reads: 'el.setAttribute("data-seen", el.className + el.children.length)',
}

// How the ref reaches the element: a literal `ref`, or inside a static or a
// dynamic spread (`_applyProps` / `_bindSpread`).
const FORMS = {
  literal: (ref: string) => `ref={(el) => { if (el) ${ref} }}`,
  spread: () => '{...sp}',
  'dynamic spread': () => '{...mk()}',
}

// Every child shape a template can lower to: a static `_setChild`, a sole and
// a mid `_mountSlot`, `_setChildAt`, the #4385 text slot (sole and mid), a
// mount hole (component children under `templatizeComponentChildren`).
const BODIES = [
  '{v}',
  '{() => v}',
  '{vn}',
  '{() => vn}',
  '{vArr}',
  '{() => vArr}',
  '<s/>{v}',
  '<s/>{vn}',
  '<s/>{vArr}',
  '<s/>{() => vArr}',
  '{vArr}<s/>',
  '{vn}<s/>',
  '{() => vn}<s/>',
  '{x()}',
  '<s/>{x()}',
  'a{v}b',
  '<Comp/>',
  '<s/><Comp/>',
]

const refFn = (ref: string) => new Function('el', `if (el) ${ref}`) as (el: Element | null) => void

const refScope = (ref: string) => () => ({
  sp: { ref: refFn(ref) },
  mk: () => ({ ref: refFn(ref) }),
  cls: () => 'c',
  v: 'str',
  vn: h('b', null, 'n'),
  vArr: [h('b', null, '1'), h('i', null, '2')],
  x: () => 'xx',
  Comp: () => h('em', null, 'c'),
})

const refSrc = (form: keyof typeof FORMS, ref: string, body: string) =>
  `const App = () => <p><span class={\`k \${cls()}\`} ${FORMS[form](ref)}>${body}</span></p>`

const FORM_NAMES = Object.keys(FORMS) as (keyof typeof FORMS)[]

describe("#4764 (4): a ref that changes its element runs after the element's children, on every path", () => {
  for (const form of FORM_NAMES)
    for (const [name, ref] of Object.entries(REFS)) {
      for (const body of BODIES) {
        it(`${form}: ${name} ${body}`, () => {
          const out: string[] = []
          for (const client of CLIENTS) {
            const el = host()
            const errors: string[] = []
            const origError = console.error
            console.error = (...a: unknown[]) => {
              errors.push(a.map(String).join(' '))
            }
            try {
              dom.mount(
                h(build(refSrc(form, ref, body), refScope(ref)(), client) as never, null),
                el,
              )
            } finally {
              console.error = origError
            }
            expect(errors, client).toEqual([])
            out.push(shape(el))
          }
          // compiled, compiled + tcc and h() agree.
          expect(out[0]).toBe(out[2])
          expect(out[1]).toBe(out[2])
        })
      }
    }
})

describe('#4764 (5): a ref over adopted content sees what a fresh render gives it', () => {
  for (const client of CLIENTS)
    for (const form of FORM_NAMES) {
      for (const [name, ref] of Object.entries(REFS)) {
        for (const body of BODIES) {
          // A static VNode or array as an element's SOLE child (`_setChild` into
          // a template-empty element) is refused by the verifier and swapped to
          // a clone on main; the swap report then sees the ref's change. That
          // shape is #4599 / PR #4790, not this issue.
          if (client !== 'h()' && (body === '{vn}' || body === '{vArr}')) continue
          it(`${client}, ${form}: ${name} ${body}`, async () => {
            const src = refSrc(form, ref, body)
            const r = await run(src, serverFor(client), client, refScope(ref)(), refScope(ref))
            expect(r.errors).toEqual([])
            expect(r.mismatches).toEqual([])
            expect(shape(r.hydrated)).toBe(shape(r.fresh))
          })
        }
      }
    }

  const onScope = () => ({ on: signal(true) })

  for (const client of CLIENTS) {
    it(`${client}: stays live, a reactive range under an appending ref`, async () => {
      const r = await run(cases.APPEND_REF_SRC, serverFor(client), client, onScope(), onScope)
      expect(r.mismatches).toEqual([])
      expect(shape(r.hydrated)).toBe('<p><span><s></s><b>on</b><u></u></span></p>')
      flip(r, 'on', false)
      flip(r, 'on', true)
    })
  }
})

describe("#4764: the Chromium twin's strings are the real pipeline's output", () => {
  const emit = (src: string) => lower(transformJSX(src, 'c.tsx', {}).code)

  it('client emit', () => {
    expect(emit(cases.FOR_IN_RANGE_SRC)).toBe(cases.FOR_IN_RANGE_COMPILED)
    expect(emit(cases.CLEAR_REF_SRC)).toBe(cases.CLEAR_REF_COMPILED)
    expect(emit(cases.APPEND_REF_SRC)).toBe(cases.APPEND_REF_COMPILED)
  })

  it('server HTML', async () => {
    const html = async (src: string, side: Side, scope: Record<string, unknown>) =>
      renderToString(h(build(src, scope, side) as never, null) as never)
    expect(await html(cases.FOR_IN_RANGE_SRC, 'server', serverScope)).toBe(
      cases.FOR_IN_RANGE_COMPILED_SERVER,
    )
    expect(await html(cases.FOR_IN_RANGE_SRC, 'h()', serverScope)).toBe(cases.FOR_IN_RANGE_H_SERVER)
    expect(await html(cases.APPEND_REF_SRC, 'server', { on: signal(true) })).toBe(
      cases.APPEND_REF_SERVER,
    )
    expect(await html(cases.INPUT_AFTER_SRC, 'h()', serverScope)).toBe(cases.INPUT_AFTER_H_SERVER)
  })
})
