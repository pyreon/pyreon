/**
 * #4599: a compiled element whose content is set by `_setChild` is EMPTY in
 * its template (`<span></span>`), and the server renders the value there with
 * no range markers. When that value is structure (a VNode, an array, a
 * fragment, a component, an accessor returning one, a fused static mix
 * `a{vNode}b`), the adopt verifier used to read the server's elements as
 * extras and refuse the template: identical content, no report, the element
 * and everything under it re-created.
 *
 * The verifier now parks a placeholder in such an element; `_setChild` claims
 * it and adopts the server's nodes through the slot hydrator, which reports a
 * real divergence. A bind that never claims it (the client renders the element
 * empty) has the server content swept and reported.
 *
 * Everything goes through the REAL compiler (`transformJSX` and the JS
 * backend, client and both SSR emits), `renderToString` and `hydrateRoot`.
 */
import { transformJSX, transformJSX_JS } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { For, Fragment, h, Show } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import * as server from '@pyreon/runtime-server'
import { renderToString } from '@pyreon/runtime-server'
import { query } from '@pyreon/test-utils'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as dom from '../index'
import { hydrateRoot, onHydrationMismatch } from '../index'
import { bindPolymorphicText } from '../mount'
import * as parked from '../parked-text'
import { SETCHILD_EMPTY_CASES } from './_setchild-empty-cases'

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
  Show,
}

const SSR_DEPS: Record<string, unknown> = {
  ...DEPS,
  ...Object.fromEntries(Object.entries(server).filter(([k]) => k.startsWith('_'))),
}

const lower = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

type Side = 'client' | 'h' | 'ssr'
type Transform = typeof transformJSX

const BACKENDS: [string, Transform][] = [
  ['default', transformJSX],
  ['js', transformJSX_JS as Transform],
]

function compile(src: string, scope: Record<string, unknown>, side: Side, backend: Transform = transformJSX) {
  const { code } = backend(src, 'case.tsx', {
    templatizeComponentChildren: true,
    ...(side === 'client' ? {} : { ssr: true }),
    ...(side === 'ssr' ? { ssrTemplate: true } : {}),
  })
  const deps = { ...(side === 'client' ? DEPS : SSR_DEPS), ...scope }

  return {
    code,
    App: new Function(...Object.keys(deps), `${lower(code)}\nreturn App`)(...Object.values(deps)) as () => unknown,
  }
}

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

async function roundTrip(serverApp: () => unknown, clientApp: () => unknown) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  const serverHtml = await renderToString(h(serverApp as never, null) as never)
  host.innerHTML = serverHtml
  const before = [...host.querySelectorAll('*')]
  const reports: string[] = []
  const off = onHydrationMismatch((m) => reports.push(`${m.type}: ${String(m.expected)} vs ${String(m.actual)}`))
  // `hydrateComponent` catches a throw, logs it and leaves the component's
  // server markup un-hydrated, which can look like a pass: every row asserts
  // that hydration logged no error.
  const errors: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '))
  })
  try {
    hydrateRoot(host, h(clientApp as never, null))
  } finally {
    off()
    spy.mockRestore()
  }
  expect(errors).toEqual([])
  // Every record and placeholder a build made was claimed or swept.
  expect(parked._parkedPending).toBe(0)
  const fresh = document.createElement('div')
  dom.mount(h(clientApp as never, null), fresh)
  const strip = (s: string) => s.replace(/<!--[^>]*-->/g, '')

  return {
    host,
    replaced: before.filter((n) => !host.contains(n)).map((n) => n.tagName.toLowerCase()),
    reports,
    html: strip(host.innerHTML),
    freshHtml: strip(fresh.innerHTML),
    serverHtml,
  }
}

const Comp = () => h('em', null, 'c')
const live = signal('L')

function scope(): Record<string, unknown> {
  return {
    vNode: h('b', null, 'n'),
    vArr: ['t', h('b', null, 'n')],
    vFrag: h(Fragment, null, h('b', null, 'a'), h('i', null, 'b')),
    vComp: h(Comp, null),
    vNested: h('span', null, h('span', { class: 'chip' }, 'tie'), ' three-way tie'),
    vLive: h('b', null, () => live()),
    vArrLive: ['t', () => live(), h('i', null, 'x')],
    vEmptyArr: [],
    vStr: 'str',
    fnNode: () => h('b', null, 'f'),
    fnArr: () => ['t', h('b', null, 'f')],
    obj: { cell: h('u', null, 'o') },
    rows: [
      { id: 1, cell: h('b', null, 'one') },
      { id: 2, cell: ['t', h('i', null, 'two')] },
    ],
    Comp,
  }
}

/** The class: every shape that `_setChild`s structure into an empty element. */
const SHAPES: [string, string][] = [
  ['sole VNode', 'const App = () => <div><span>{vNode}</span></div>'],
  ['sole array', 'const App = () => <div><span>{vArr}</span></div>'],
  ['sole fragment VNode', 'const App = () => <div><span>{vFrag}</span></div>'],
  ['sole component VNode', 'const App = () => <div><span>{vComp}</span></div>'],
  ['sole nested VNode', 'const App = () => <div><span>{vNested}</span></div>'],
  ['VNode with a live child', 'const App = () => <div><span>{vLive}</span></div>'],
  ['array with an accessor (server ranges inside)', 'const App = () => <div><span>{vArrLive}</span></div>'],
  ['function value returning a VNode', 'const App = () => <div><span>{fnNode}</span></div>'],
  ['function value returning an array', 'const App = () => <div><span>{fnArr}</span></div>'],
  ['conditional over values (VNode)', 'const App = () => <div><span>{vStr ? vNode : null}</span></div>'],
  ['conditional over values (array)', 'const App = () => <div><span>{vStr ? vArr : vNode}</span></div>'],
  ['member expression', 'const App = () => <div><span>{obj.cell}</span></div>'],
  ['fused static mix', 'const App = () => <div><span>a{vNode}b</span></div>'],
  ['fused mix with an array', 'const App = () => <div><span>a{vArr}b</span></div>'],
  ['template root is the target', 'const App = () => <span>{vNode}</span>'],
  ['deep target beside static siblings', 'const App = () => <div><p><s /><span>{vNode}</span></p><i /></div>'],
  ['two targets', 'const App = () => <div><span>{vNode}</span><em>{vArr}</em></div>'],
  ['empty array (nothing on either side)', 'const App = () => <div><span>{vEmptyArr}</span></div>'],
  ['string (text path, unchanged)', 'const App = () => <div><span>{vStr}</span></div>'],
  ['<For> row cell', 'const App = () => <ul><For each={rows} by={(r) => r.id}>{(r) => <li class="sc">{r.cell}</li>}</For></ul>'],
  ['<Show> branch', 'const App = () => <section><Show when={() => true}><span>{vNode}</span></Show></section>'],
]

/**
 * Siblings that are NOT this class: the client emits something other than a
 * `_setChild` into an empty element, and they already adopt. Locked here so
 * the census of the class stays honest.
 */
const SIBLINGS: [string, string, string][] = [
  ['component-local JSX const', 'const App = () => { const v = <b>n</b>; return <div><span>{v}</span></div> }', '_mountSlot('],
  ['sole accessor', 'const App = () => <div><span>{() => vNode}</span></div>', 'bindPolymorphicText('],
  ['sole component', 'const App = () => <div><span><Comp /></span></div>', '_mountChild('],
  ['sole <Show>', 'const App = () => <div><span><Show when={() => true}>{vNode}</Show></span></div>', '_mountChild('],
  ['sole fragment-wrapped value', 'const App = () => <div><span><>{vNode}</></span></div>', '_setChildAt('],
]

describe('#4599: an empty `_setChild` element adopts the server structure', () => {
  for (const [backendName, backend] of BACKENDS) {
    for (const [name, src] of SHAPES) {
      it(`${backendName} | ${name}`, async () => {
        const s = scope()
        const client = compile(src, s, 'client', backend)
        // The shape is the class: an empty template element set by `_setChild`.
        expect(client.code).toContain('_setChild(')
        for (const side of ['h', 'ssr'] as const) {
          const r = await roundTrip(compile(src, s, side, backend).App, client.App)
          expect(r.html).toBe(r.freshHtml)
          expect(r.reports).toEqual([])
          expect(r.replaced).toEqual([])
        }
      })
    }
  }

  for (const [backendName, backend] of BACKENDS) {
    for (const [name, src, helper] of SIBLINGS) {
      it(`${backendName} | sibling, not this class: ${name}`, async () => {
        const s = scope()
        const client = compile(src, s, 'client', backend)
        expect(client.code).not.toContain('_setChild(')
        expect(client.code).toContain(helper)
        for (const side of ['h', 'ssr'] as const) {
          const r = await roundTrip(compile(src, s, side, backend).App, client.App)
          expect(r.html).toBe(r.freshHtml)
          expect(r.reports).toEqual([])
          expect(r.replaced).toEqual([])
        }
      })
    }
  }

  it('the server nodes ARE the hydrated nodes, and stay live', async () => {
    const s = scope()
    const src = 'const App = () => <div><span>a{vArrLive}b</span></div>'
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    host.innerHTML = await renderToString(h(compile(src, s, 'h').App as never, null) as never)
    const span = host.querySelector('span') as Element
    const serverKids = [...span.childNodes]
    hydrateRoot(host, h(compile(src, s, 'client').App as never, null))
    expect(host.querySelector('span')).toBe(span)
    expect(host.querySelector('i')).toBe(serverKids.find((n) => n.nodeName === 'I'))
    // No placeholder is left behind once `_setChild` claimed it.
    expect([...span.childNodes].every((n) => n.nodeType !== 3 || (n as Text).data !== '')).toBe(true)
    live.set('M')
    expect(span.textContent).toBe('atMxb')
    live.set('L')
  })
})

describe('#4599: a real divergence in this shape is still reported and repaired', () => {
  async function diverge(serverSrc: string, clientSrc: string, s = scope()) {
    return roundTrip(compile(serverSrc, s, 'h').App, compile(clientSrc, s, 'client').App)
  }

  it('a different element in the value is reported by the walk', async () => {
    const r = await diverge(
      'const App = () => <div><span>{<b>n</b>}</span></div>',
      'const App = () => <div><span>{vI}</span></div>',
      { ...scope(), vI: h('i', null, 'n') },
    )
    expect(r.html).toBe(r.freshHtml)
    expect(r.reports.length).toBeGreaterThan(0)
    expect(r.reports[0]).toMatch(/^tag: i vs b/)
  })

  it('a <For> row admitted by plan replay keeps no stale server copy (#4370 path)', async () => {
    const row = (cell: unknown) => [
      { id: 1, cell: 'str' },
      { id: 2, cell },
    ]
    const src = (rows: string) =>
      `const App = () => <ul><For each={${rows}} by={(r) => r.id}>{(r) => <li class="rp">{r.cell}</li>}</For></ul>`
    const r = await diverge(src('rowsS'), src('rowsC'), {
      ...scope(),
      rowsS: row(h('b', null, 'x')),
      rowsC: row(h('i', null, 'x')),
    })
    expect(r.html).toBe(r.freshHtml)
    expect(r.reports[0]).toMatch(/^tag: i vs b/)
  })

  it('a text value over server elements is reported even when the text agrees', async () => {
    const r = await diverge(
      'const App = () => <div><span>{vNode}</span></div>',
      'const App = () => <div><span>{vN}</span></div>',
      { ...scope(), vN: 'n' },
    )
    expect(r.html).toBe('<div><span>n</span></div>')
    expect(r.reports).toEqual(['tag: #text vs b'])
  })

  it('a text value over server elements with other text is reported as text', async () => {
    const r = await diverge(
      'const App = () => <div><span>{vNode}</span></div>',
      'const App = () => <div><span>{vN}</span></div>',
      { ...scope(), vN: 'other' },
    )
    expect(r.html).toBe('<div><span>other</span></div>')
    expect(r.reports).toEqual(['text: other vs n'])
  })

  it('an element the client leaves empty has its server content swept and reported', async () => {
    const r = await diverge(
      'const App = () => <div><span>{vNode}</span></div>',
      'const App = () => <div><span></span></div>',
    )
    expect(r.html).toBe(r.freshHtml)
    expect(r.html).toBe('<div><span></span></div>')
    // The skeleton is adopted; only the unclaimed server content goes.
    expect(r.replaced).toEqual(['b'])
    expect(r.reports).toEqual(['text:  vs n'])
  })

  it('the swept server text leaves its range markers out', async () => {
    const r = await diverge(
      'const App = () => <div><span>{vArrLive}</span></div>',
      'const App = () => <div><span></span></div>',
    )
    expect(r.html).toBe('<div><span></span></div>')
    expect(r.reports).toEqual(['text:  vs tLx'])
  })

  it('a component that renders nothing keeps the server content, as on the h() path', async () => {
    // "Degrade, don't destroy" (`sweepUnclaimed`): the walk claimed nothing,
    // which a throwing or null-rendering component cannot tell apart.
    const s = { ...scope(), vNul: h(() => null, null) }
    const r = await diverge(
      'const App = () => <div><span>{vNode}</span></div>',
      'const App = () => <div><span>{vNul}</span></div>',
      s,
    )
    expect(r.html).toBe('<div><span><b>n</b></span></div>')
    expect(r.reports).toEqual([])
  })

  it('unclaimed server structure with no text is still reported (as a tag)', async () => {
    const r = await diverge(
      'const App = () => <div><span><img /></span></div>',
      'const App = () => <div><span></span></div>',
    )
    expect(r.html).toBe('<div><span></span></div>')
    expect(r.reports).toEqual(['tag:  vs img'])
  })

  it('a ref that fills an element the server filled replaces the server content', async () => {
    // The ref runs before the sweep: it replaced the server's children itself,
    // so nothing recorded is left to remove and nothing is reported.
    const fill = (el: Element | null) => {
      if (el !== null) el.textContent = 'r'
    }
    const r = await diverge(
      'const App = () => <div><span>{vNode}</span></div>',
      'const App = () => <div><span ref={fill} /></div>',
      { ...scope(), fill },
    )
    expect(r.html).toBe('<div><span>r</span></div>')
    expect(r.html).toBe(r.freshHtml)
    expect(r.reports).toEqual([])
  })

})

/**
 * Every bind line that runs before `_setChild` can change an empty element's
 * children: a `ref`, a spread (`_applyProps`). The compiler emits them first.
 * Same source on both sides; the hydrated DOM must equal a fresh client render,
 * and the server nodes that render keeps must be adopted, not re-created.
 */
describe('#4599: bind-time writers to an empty `_setChild` element', () => {
  const clear = (el: Element | null) => {
    if (el !== null) el.textContent = ''
  }
  const prepend = (el: Element | null) => {
    if (el !== null) el.prepend(document.createElement('i'))
  }
  const append = (el: Element | null) => {
    if (el !== null) el.append(document.createElement('i'))
  }
  let seen: string | null = null
  const read = (el: Element | null) => {
    // The first call is the hydrating one; the fresh comparison mount follows.
    if (el !== null && seen === null) seen = el.innerHTML
  }
  const hp = { dangerouslySetInnerHTML: { __html: '<i>h</i>' } }
  const CASES: [string, string][] = [
    ['a ref that clears', 'const App = () => <div><span ref={clear}>{vNode}</span></div>'],
    ['a ref that prepends', 'const App = () => <div><span ref={prepend}>{vNode}</span></div>'],
    ['a ref that appends', 'const App = () => <div><span ref={append}>{vNode}</span></div>'],
    ['a ref that only reads', 'const App = () => <div><span ref={read}>{vNode}</span></div>'],
    ['a ref that clears, beside sibling cells', 'const App = () => <div><span ref={clear}>{vNode}</span><em>{vArr}</em><p>{vNested}</p></div>'],
    ['a ref that prepends, with an accessor value', 'const App = () => <div><span ref={prepend}>{fnNode}</span></div>'],
    ['a root spread with dangerouslySetInnerHTML and a cell', 'const App = () => <div {...hp}>{vNode}</div>'],
    ['a root spread with dangerouslySetInnerHTML alone', 'const App = () => <div {...hp} />'],
  ]
  for (const [name, src] of CASES) {
    it(name, async () => {
      const s = { ...scope(), clear, prepend, append, read, hp }
      for (const side of ['h', 'ssr'] as const) {
        const r = await roundTrip(compile(src, s, side).App, compile(src, s, 'client').App)
        expect(r.html).toBe(r.freshHtml)
        expect(r.reports).toEqual([])
      }
    })
  }

  it('a divergent value after a prepending ref is replaced, not kept beside it', async () => {
    const s = { ...scope(), prepend, vI: h('i', { class: 'c' }, 'n') }
    const r = await roundTrip(
      compile('const App = () => <div><span ref={prepend}>{vNode}</span></div>', s, 'h').App,
      compile('const App = () => <div><span ref={prepend}>{vI}</span></div>', s, 'client').App,
    )
    expect(r.html).toBe(r.freshHtml)
    expect(r.reports[0]).toMatch(/^tag: i vs b/)
  })

  it('a ref that clears a sole text slot holding server elements (#4385 park)', async () => {
    const s = { ...scope(), clear, parts: () => ['a ', h('code', null, 'x')] }
    const src = 'const App = () => <div><span ref={clear}>{parts()}</span></div>'
    const client = compile(src, s, 'client')
    expect(client.code).toContain('<span> </span>')
    const r = await roundTrip(compile(src, s, 'h').App, client.App)
    expect(r.html).toBe(r.freshHtml)
  })

  it('a parked placeholder a bind line detached is skipped by the sweep, not dereferenced', async () => {
    // A hand-written bind standing for a non-consuming text binding (it
    // writes `.data` itself) after a ref that cleared the element.
    const App = () =>
      dom._tpl('<p class="dt"> </p>', (root) => {
        const t = root.firstChild as Text
        root.textContent = ''
        t.data = 'v'

        return null
      })
    const r = await roundTrip(() => h('p', { class: 'dt' }, h('b', null, 'x')), App)
    expect(r.html).toBe(r.freshHtml)
  })

  it('a ref that only reads sees the server content, which is adopted', async () => {
    const s = { ...scope(), read }
    const src = 'const App = () => <div><span ref={read}>{vNested}</span></div>'
    seen = null
    const r = await roundTrip(compile(src, s, 'h').App, compile(src, s, 'client').App)
    expect(seen).toBe('<span><span class="chip">tie</span> three-way tie</span>')
    expect(r.replaced).toEqual([])
  })

  it('a prepending ref keeps its node and the server value is adopted after it', async () => {
    const s = { ...scope(), prepend }
    const src = 'const App = () => <div><span ref={prepend}>{vArrLive}</span></div>'
    const r = await roundTrip(compile(src, s, 'h').App, compile(src, s, 'client').App)
    expect(r.replaced).toEqual([])
    expect(r.html).toBe('<div><span><i></i>tL<i>x</i></span></div>')
    live.set('P')
    expect(r.host.querySelector('span')?.textContent).toBe('tPx')
    live.set('L')
  })
})

describe('#4599: adopted content stays live', () => {
  it('a handler on an adopted VNode fires', async () => {
    let clicks = 0
    const s = { ...scope(), btn: h('button', { onClick: () => clicks++ }, 'go') }
    const src = 'const App = () => <div><span>{btn}</span></div>'
    const r = await roundTrip(compile(src, s, 'h').App, compile(src, s, 'client').App)
    expect(r.replaced).toEqual([])
    query(r.host, 'button').click()
    expect(clicks).toBe(1)
  })

  it('a live child in a <For> row cell updates', async () => {
    const s = { ...scope(), rowsL: [{ id: 1, cell: h('b', null, () => live()) }] }
    const src = 'const App = () => <ul><For each={rowsL} by={(r) => r.id}>{(r) => <li class="lv">{r.cell}</li>}</For></ul>'
    const r = await roundTrip(compile(src, s, 'h').App, compile(src, s, 'client').App)
    expect(r.replaced).toEqual([])
    live.set('Q')
    expect(r.host.querySelector('li')?.textContent).toBe('Q')
    live.set('L')
  })

  it('a live child in a fused mix updates', async () => {
    const s = scope()
    const src = 'const App = () => <div><span>a{vLive}b</span></div>'
    const r = await roundTrip(compile(src, s, 'h').App, compile(src, s, 'client').App)
    expect(r.replaced).toEqual([])
    live.set('R')
    expect(r.host.querySelector('span')?.textContent).toBe('aRb')
    live.set('L')
  })
})

/**
 * A row matched through this relaxation records no replay plan, so `<For>`
 * rows whose cells all hold structure take the full verify each. Before #4599
 * those rows were not adopted at all (clone, bind, swap); the full verify
 * walks only the row's own skeleton.
 */
describe('#4599: <For> rows with a structural cell', () => {
  it('every row adopts through the full verify (no plan replay)', async () => {
    const counts = new Map<string, number>()
    const sink = globalThis as { __pyreon_count__?: ((n: string, k?: number) => void) | undefined }
    const prev = sink.__pyreon_count__
    const rowsS = [1, 2, 3, 4].map((id) => ({ id, cell: h('b', null, `c${id}`) }))
    const s = { ...scope(), rowsS }
    const src = 'const App = () => <ul><For each={rowsS} by={(r) => r.id}>{(r) => <li class="fs">{r.cell}</li>}</For></ul>'
    const server = compile(src, s, 'h').App
    const client = compile(src, s, 'client').App
    sink.__pyreon_count__ = (n, k = 1) => counts.set(n, (counts.get(n) ?? 0) + k)
    let r: Awaited<ReturnType<typeof roundTrip>>
    try {
      r = await roundTrip(server, client)
    } finally {
      sink.__pyreon_count__ = prev
    }
    expect(r.replaced).toEqual([])
    expect(counts.get('runtime.tpl.adoptPlanReplay') ?? 0).toBe(0)
    // 4 rows adopted (plus the container template); the fresh mount adopts none.
    expect(counts.get('runtime.tpl.adopt')).toBe(5)
  })
})

describe('recorded Chromium cases match the real toolchain', () => {
  for (const c of SETCHILD_EMPTY_CASES) {
    it(c.name, async () => {
      expect(lower(transformJSX(c.source, 'case.tsx', { templatizeComponentChildren: true }).code)).toBe(c.compiled)
      const recordedScope = {
        ...scope(),
        clear: () => {},
        prepend: () => {},
        hp: { dangerouslySetInnerHTML: { __html: '<i>h</i>' } },
      }
      const ssr = compile(c.source, recordedScope, 'h').App
      expect(await renderToString(h(ssr as never, null) as never)).toBe(c.server)
    })
  }
})
