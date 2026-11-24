/**
 * #4599: a compiled element whose content is set by `_setChild` is EMPTY in
 * its template (`<span></span>`), and the server renders the value there with
 * no range markers. When that value is structure (a VNode, an array, a
 * fragment, a component, an accessor returning one, a fused static mix
 * `a{vNode}b`), the adopt verifier used to read the server's elements as
 * extras and refuse the template: identical content, no report, the element
 * and everything under it re-created.
 *
 * The verifier now records such an element by identity (a `_setChild`
 * REGION); `_setChild` claims it and adopts the server's nodes through the
 * slot hydrator, which reports a real divergence. A bind that never claims it
 * (the client renders the element empty) has the server content swept and
 * reported. A ref or spread in the bind sees the element empty, as on a fresh
 * render; if it put nodes there, the value mounts fresh after them.
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

async function roundTrip(serverApp: () => unknown, clientApp: () => unknown, opts: { throws?: boolean } = {}) {
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
  // A throwing client bind is the one case expected to log (`opts.throws`).
  if (opts.throws === true) expect(errors.length).toBeGreaterThan(0)
  else expect(errors.join("\n").slice(0, 600)).toBe("")
  // Every record and placeholder a build made was claimed, swept or released.
  expect(parked._parkedPending).toBe(0)
  const fresh = document.createElement('div')
  if (opts.throws !== true) dom.mount(h(clientApp as never, null), fresh)
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
    // Text plus the value's own range markers, no element: `t<!--$-->L<!--/$-->`.
    vTL: ['t', () => live()],
    vFragTL: h(Fragment, null, 't', () => live()),
    vEmptyArr: [],
    vStr: 'str',
    fnNode: () => h('b', null, 'f'),
    fnArr: () => ['t', h('b', null, 'f')],
    obj: { cell: h('u', null, 'o') },
    // Structural values the server renders as TEXT only.
    vFragText: h(Fragment, null, 'a', 'b'),
    vCompText: h(() => 'ct', null),
    fnText: () => 'ft',
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
  ['fragment of strings (server text only)', 'const App = () => <div><span>{vFragText}</span></div>'],
  ['component returning text (server text only)', 'const App = () => <div><span>{vCompText}</span></div>'],
  ['function returning text (server text only)', 'const App = () => <div><span>{fnText}</span></div>'],
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
  ['dropped null sibling', 'const App = () => <div><span>{null}{vNode}</span></div>', '_setChildAt('],
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

  it('a ref on an element the client leaves empty sees it empty; the server content is reported', async () => {
    // User code runs on the element as a fresh render's clone has it (empty):
    // the server content is hidden from it, nothing claims it, so it is
    // dropped and reported against what the client renders there.
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
    expect(r.reports).toEqual(['text: r vs n'])
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

  it('a divergent value after a prepending ref is mounted fresh, not kept beside it', async () => {
    // The ref put a node in the element, so the region falls back to a fresh
    // mount: the hidden server nodes are dropped (they were recorded), and the
    // fallback is not compared, the same as without the divergence.
    const s = { ...scope(), prepend, vI: h('i', { class: 'c' }, 'n') }
    const r = await roundTrip(
      compile('const App = () => <div><span ref={prepend}>{vNode}</span></div>', s, 'h').App,
      compile('const App = () => <div><span ref={prepend}>{vI}</span></div>', s, 'client').App,
    )
    expect(r.html).toBe(r.freshHtml)
    expect(r.replaced).toEqual(['b'])
  })

  it('a ref that only reads sees what a fresh render shows it, and the content is adopted', async () => {
    const s = { ...scope(), read }
    const src = 'const App = () => <div><span ref={read}>{vNested}</span></div>'
    seen = null
    const r = await roundTrip(compile(src, s, 'h').App, compile(src, s, 'client').App)
    // A compiled ref fires before the content lines, on an empty element.
    expect(seen).toBe('')
    expect(r.replaced).toEqual([])
  })

  it('a root spread with dangerouslySetInnerHTML and a cell renders as a fresh render does', async () => {
    // SSR renders `__html` and drops the children; a client render applies
    // `innerHTML` and then appends the cell. The spread is user code: it sees
    // the element empty, fills it, and the cell mounts fresh after it.
    const s = { ...scope(), hp }
    const src = 'const App = () => <div {...hp}>{vNode}</div>'
    for (const side of ['h', 'ssr'] as const) {
      const r = await roundTrip(compile(src, s, side).App, compile(src, s, 'client').App)
      expect(r.html).toBe(r.freshHtml)
      expect(r.html).toBe('<div><i>h</i><b>n</b></div>')
    }
  })

  it('a prepending ref: the value mounts fresh after its node, and stays live', async () => {
    const s = { ...scope(), prepend }
    const src = 'const App = () => <div><span ref={prepend}>{vArrLive}</span></div>'
    const r = await roundTrip(compile(src, s, 'h').App, compile(src, s, 'client').App)
    // The fallback: the server's `<i>x</i>` is re-created; the span is kept.
    expect(r.replaced).toEqual(['i'])
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
 * The replay plan carries the paths of the template's empty elements. A row
 * whose server content there is more than text takes the full verify, which
 * records the region; a text row replays as before.
 */
describe('#4599: <For> rows with a structural cell', () => {
  async function countRows(rowsS: { id: number; cell: unknown }[], cls: string) {
    const counts = new Map<string, number>()
    const sink = globalThis as { __pyreon_count__?: ((n: string, k?: number) => void) | undefined }
    const prev = sink.__pyreon_count__
    const s = { ...scope(), rowsS }
    // A distinct class per test: the replay plan is cached per template.
    const src = `const App = () => <ul><For each={rowsS} by={(r) => r.id}>{(r) => <li class="${cls}">{r.cell}</li>}</For></ul>`
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
    expect(r.html).toBe(r.freshHtml)

    return { replays: counts.get('runtime.tpl.adoptPlanReplay') ?? 0, adopts: counts.get('runtime.tpl.adopt') ?? 0 }
  }

  it('structural rows are adopted, each through the full verify', async () => {
    const { replays, adopts } = await countRows([1, 2, 3, 4].map((id) => ({ id, cell: h('b', null, `c${id}`) })), 'fs')
    expect(replays).toBe(0)
    // 4 rows adopted, plus the container template.
    expect(adopts).toBe(5)
  })

  it('text rows still replay the plan', async () => {
    const { replays, adopts } = await countRows([1, 2, 3, 4].map((id) => ({ id, cell: `c${id}` })), 'ft')
    expect(replays).toBe(3)
    expect(adopts).toBe(5)
  })
})

/**
 * A bind that throws: `hydrateComponent` logs and keeps the component's server
 * markup ("degrade, don't destroy"). Regions a ref hid are put back and
 * nothing is swept, so no element in it is emptied and nothing is reported.
 */
describe('a throwing bind keeps the server content', () => {
  const boom = (el: Element | null) => {
    if (el !== null) throw new Error('boom')
  }
  const CASES: [string, string, Record<string, unknown>, Record<string, unknown>][] = [
    [
      'a throwing getter feeding `_setChild` (#4599)',
      'const App = () => <div><span>{bad.cell}</span><em>{vNode}</em></div>',
      { bad: { cell: h('b', null, 'n') } },
      {
        bad: {
          get cell(): never {
            throw new Error('boom')
          },
        },
      },
    ],
    ['a throwing ref before `_setChild` (#4599)', 'const App = () => <div><span ref={boom}>{vNode}</span></div>', { boom: () => {} }, { boom }],
    [
      // The claimed region's cleanup runs when the component's scope stops:
      // it must dispose effects only, never remove the adopted server nodes.
      'a throwing getter AFTER a claimed region (#4599)',
      'const App = () => <div><span>{vNode}</span><em>{bad.cell}</em></div>',
      { bad: { cell: h('i', null, 'c') } },
      {
        bad: {
          get cell(): never {
            throw new Error('boom')
          },
        },
      },
    ],
    ['a throwing ref AFTER a claimed region (#4599)', 'const App = () => <div><span>{vNode}</span><em ref={boom} /></div>', { boom: () => {} }, { boom }],
    [
      'a throwing ref after another region was hidden (#4599)',
      'const App = () => <div><span ref={boom}>{vNode}</span><em>{vArr}</em></div>',
      { boom: () => {} },
      { boom },
    ],
  ]
  for (const [name, src, serverScope, clientScope] of CASES) {
    it(name, async () => {
      const base = { ...scope(), parts: () => ['a ', h('code', null, 'x')] }
      const r = await roundTrip(compile(src, { ...base, ...serverScope }, 'h').App, compile(src, { ...base, ...clientScope }, 'client').App, {
        throws: true,
      })
      expect(r.html).toBe(r.serverHtml.replace(/<!--[^>]*-->/g, ''))
      expect(r.reports).toEqual([])
      expect(r.replaced).toEqual([])
    })
  }

  it('a throwing ref after a region mounted fresh behind an appending ref gets the server nodes back', async () => {
    const append = (el: Element | null) => el?.append(document.createElement('i'))
    const src = 'const App = () => <div><span ref={append}>{vNode}</span><em ref={boom} /></div>'
    const s = { ...scope(), append }
    const r = await roundTrip(compile(src, { ...s, boom: () => {} }, 'h').App, compile(src, { ...s, boom }, 'client').App, { throws: true })
    // The server's `<b>` is back, first; the node the ref added stays after it.
    expect(r.replaced).toEqual([])
    expect(r.html).toBe('<div><span><b>n</b><i></i></span><em></em></div>')
  })
})

/**
 * A text write into a region consumes its mark in neither build (dev used to,
 * production did not, so a later throw left different DOM). A HIDDEN region
 * gets its server nodes back on the throw, ahead of the client's text; a
 * region whose nodes the write itself replaced has nothing left to restore.
 */
describe('a text write over a region, then a throw: dev and production agree', () => {
  const okC = { cell: h('i', null, 'c') }
  const bad = {
    get cell(): never {
      throw new Error('boom')
    },
  }
  const R = () => {}
  const CASES: [string, string, unknown, string][] = [
    ['hidden region, text value', 'const App = () => <div ref={R}><span>{c.v}</span><em>{bad.cell}</em></div>', 'str', '<div><span><b>n</b>str</span><em><i>c</i></em></div>'],
    ['unhidden region, text value', 'const App = () => <div><span>{c.v}</span><em>{bad.cell}</em></div>', 'str', '<div><span>str</span><em><i>c</i></em></div>'],
    ['hidden region, null value', 'const App = () => <div ref={R}><span>{c.v}</span><em>{bad.cell}</em></div>', null, '<div><span><b>n</b></span><em><i>c</i></em></div>'],
  ]
  for (const [name, src, v, want] of CASES) {
    for (const mode of ['development', 'production']) {
      it(`${name} | ${mode}`, async () => {
        const prev = process.env.NODE_ENV
        process.env.NODE_ENV = mode
        try {
          const base = { ...scope(), R }
          const r = await roundTrip(
            compile(src, { ...base, c: { v: h('b', null, 'n') }, bad: okC }, 'h').App,
            compile(src, { ...base, c: { v }, bad }, 'client').App,
            { throws: true },
          )
          expect(r.html).toBe(want)
        } finally {
          if (prev === undefined) delete process.env.NODE_ENV
          else process.env.NODE_ENV = prev
        }
      })
    }
  }
})

/**
 * A claimed region's teardown disposes effects and removes nothing: its element
 * leaves with its template. The first version removed every adopted node and
 * put it back, so a custom element in a removed hydrated row was disconnected,
 * connected and disconnected again (an iframe would reload).
 */
describe('unmounting a claimed region detaches each node once', () => {
  const log: string[] = []
  class XRegion extends HTMLElement {
    connectedCallback() {
      log.push('c')
    }
    disconnectedCallback() {
      log.push('d')
    }
  }
  if (customElements.get('x-region') === undefined) customElements.define('x-region', XRegion)

  async function teardown(src: string, s: Record<string, unknown>, act: (dispose: () => void) => void, mode: 'hydrate' | 'mount' = 'hydrate') {
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    let dispose: () => void
    if (mode === 'hydrate') {
      host.innerHTML = await renderToString(h(compile(src, s, 'h').App as never, null) as never)
      const before = [...host.querySelectorAll('x-region')]
      dispose = hydrateRoot(host, h(compile(src, s, 'client').App as never, null))
      // Adopted, not re-created.
      expect([...host.querySelectorAll('x-region')]).toEqual(before)
    } else {
      dispose = dom.mount(h(compile(src, s, 'client').App as never, null), host)
    }
    log.length = 0
    let records = 0
    const mo = new MutationObserver((r) => {
      records += r.filter((m) => m.addedNodes.length > 0).length
    })
    mo.observe(host, { childList: true, subtree: true })
    act(dispose)
    await new Promise((r) => setTimeout(r, 0))
    records += mo.takeRecords().filter((m) => m.addedNodes.length > 0).length
    mo.disconnect()

    return { log: log.join(''), inserted: records, host }
  }

  it('a <For> row removed', async () => {
    const rows = signal([1, 2].map((id) => ({ id, cell: h('x-region', null, h('i', null, 'k')) })))
    const src = 'const App = () => <ul><For each={() => rows()} by={(r) => r.id}>{(r) => <li class="tdr">{r.cell}</li>}</For></ul>'
    const r = await teardown(src, { ...scope(), rows }, () => rows.set(rows().slice(1)))
    expect(r).toMatchObject({ log: 'd', inserted: 0 })
    expect(r.host.querySelectorAll('x-region').length).toBe(1)
  })

  it('a <For> cleared', async () => {
    const rows = signal([1, 2].map((id) => ({ id, cell: h('x-region', null, 'k') })))
    const src = 'const App = () => <ul><For each={() => rows()} by={(r) => r.id}>{(r) => <li class="tdc">{r.cell}</li>}</For></ul>'
    const r = await teardown(src, { ...scope(), rows }, () => rows.set([]))
    // The list's own fast clear re-inserts its boundary: compare with a client mount.
    const rows2 = signal([1, 2].map((id) => ({ id, cell: h('x-region', null, 'k') })))
    const m = await teardown(src, { ...scope(), rows: rows2 }, () => rows2.set([]), 'mount')
    expect(r).toMatchObject({ log: 'dd', inserted: m.inserted })
  })

  it('the hydrated root disposed', async () => {
    const s = { ...scope(), cell: h('x-region', null, 'k') }
    const r = await teardown('const App = () => <div><p>{cell}</p></div>', s, (dispose) => dispose())
    expect(r).toMatchObject({ log: 'd', inserted: 0 })
  })

  it('a <Show> branch switched off (the reactive-boundary path an HMR remount takes)', async () => {
    const on = signal(true)
    const s = { ...scope(), on, cell: h('x-region', null, 'k') }
    const r = await teardown('const App = () => <section><Show when={() => on()}><div>{cell}</div></Show></section>', s, () => on.set(false))
    expect(r).toMatchObject({ log: 'd', inserted: 0 })
  })
})

describe('user code sees only the regions inside its own element', () => {
  it('a ref on an unrelated sibling hides nothing: the region is never detached', async () => {
    let seen: string | null = null
    const R = (el: Element | null) => {
      // The first call is the hydrating one; the fresh comparison mount follows.
      if (el !== null && seen === null) seen = (el.nextElementSibling as Element).innerHTML
    }
    const s = { ...scope(), R }
    const src = 'const App = () => <div><em ref={R} /><span>{vNode}</span></div>'
    const counts = new Map<string, number>()
    const sink = globalThis as { __pyreon_count__?: ((n: string, k?: number) => void) | undefined }
    const prev = sink.__pyreon_count__
    sink.__pyreon_count__ = (n, k = 1) => counts.set(n, (counts.get(n) ?? 0) + k)
    let r: Awaited<ReturnType<typeof roundTrip>>
    try {
      r = await roundTrip(compile(src, s, 'h').App, compile(src, s, 'client').App)
    } finally {
      sink.__pyreon_count__ = prev
    }
    expect(counts.get('runtime.tpl.hide') ?? 0).toBe(0)
    expect(seen).toBe('<b>n</b>')
    expect(r.replaced).toEqual([])
    expect(r.html).toBe(r.freshHtml)
  })
})

/**
 * THE INVARIANT, as a matrix: hydration never removes a node it did not record
 * as server content at verify time, and never adopts or positions by an
 * assumption about where client-inserted nodes are. Every shape of the class
 * gets a ref on its target element that clears it, prepends, appends, inserts
 * in the middle or only sets an attribute, and a ref that throws; each runs on
 * the full verify (both SSR emits), on `<For>` plan replay (including a plan
 * recorded by a DIFFERENT list with the same row template), and on the `h()`
 * path. A same-source round trip must equal a fresh client render with no
 * report and no logged error; a throwing ref must keep the server markup; a
 * ref that leaves the element's children alone must not cost the adoption.
 *
 * Out of this matrix: refs on the SIBLING shapes (`_mountSlot`, `_setChildAt`,
 * the #4385 text slot, mount holes). They are not this class and keep their
 * base behaviour.
 */
const REFS: Record<string, (el: Element | null) => void> = {
  clear: (el) => {
    if (el !== null) el.textContent = ''
  },
  prepend: (el) => {
    if (el !== null) el.prepend(document.createElement('i'))
  },
  append: (el) => {
    if (el !== null) el.append(document.createElement('i'))
  },
  middle: (el) => {
    if (el !== null) el.insertBefore(document.createElement('i'), el.childNodes[Math.ceil(el.childNodes.length / 2)] ?? null)
  },
  attr: (el) => {
    if (el !== null) el.setAttribute('data-r', '1')
  },
}

const boom = (el: Element | null) => {
  if (el !== null) throw new Error('boom')
}

/** Put `ref={R}` on the shape's target: its first `<span` or `<li`. */
const withRef = (src: string) => src.replace(/<(span|li)(?=[ >])/, '<$1 ref={R}')

/** The `h()` path: the client is lowered by esbuild alone (no `_tpl`). */
function compileH(src: string, s: Record<string, unknown>): () => unknown {
  const deps = { ...DEPS, ...s }
  return new Function(...Object.keys(deps), `${lower(src)}\nreturn App`)(...Object.values(deps)) as () => unknown
}

/**
 * Text-only server content is not a region (recording it would cost every
 * plain `{row.x}` cell). When a ref CLEARS such an element, the text write that
 * follows reports the server text as empty (`text: str vs `, or `TextNode vs
 * null` from the walk): a dev-only report, identical on the base commit, with
 * the DOM equal to a fresh render. Those two forms are dropped for `clear`.
 */
const textCellNoise = (refName: string, report: string) =>
  refName === 'clear' && report.startsWith('text: ') && (report.endsWith(' vs ') || report.endsWith(' vs null'))

/**
 * A structural value the server renders as TEXT only (`vFragText`, `vCompText`,
 * `fnText`) is not a region either, so a ref that puts nodes into its element
 * keeps the base behaviour (the walk meets the ref's node): NOT fixed here, and
 * not asserted. Its rows run the refs that leave no node behind.
 */
const TEXT_ONLY_REFS = ['clear', 'attr']
const isTextOnly = (name: string) => /server text only|vFragText|vCompText|fnText/.test(name)

async function refRow(src: string, s: Record<string, unknown>, client: 'compiled' | 'h', textOnly = false) {
  const got: string[] = []
  const want: string[] = []
  for (const [refName, R] of Object.entries(REFS)) {
    if (textOnly && !TEXT_ONLY_REFS.includes(refName)) continue
    const sc = { ...s, R }
    const clientApp = client === 'h' ? compileH(src, sc) : compile(src, sc, 'client').App
    for (const side of ['h', 'ssr'] as const) {
      const r = await roundTrip(compile(src, sc, side).App, clientApp)
      const reports = r.reports.filter((m) => !textCellNoise(refName, m))
      // A ref that leaves the children alone keeps every server node.
      const kept = refName === 'attr' ? r.replaced.join(',') : ''
      got.push(`${refName} | ${side} | ${r.html} | ${reports.join('; ')} | ${kept}`)
      want.push(`${refName} | ${side} | ${r.freshHtml} |  | `)
    }
  }
  expect(got).toEqual(want)
  const sc = { ...s, R: boom }
  const r = await roundTrip(compile(src, { ...s, R: () => {} }, 'h').App, client === 'h' ? compileH(src, sc) : compile(src, sc, 'client').App, {
    throws: true,
  })
  expect(`throws | ${r.html} | ${r.reports.join('; ')}`).toBe(`throws | ${r.serverHtml.replace(/<!--[^>]*-->/g, '')} | `)
}

describe('the invariant: bind-time refs on every shape, every path', () => {
  for (const [name, src] of SHAPES) {
    it(`full verify | ${name}`, async () => refRow(withRef(src), scope(), 'compiled', isTextOnly(name)))
  }
  for (const [name, src] of SHAPES.slice(0, 4)) {
    it(`h() path | ${name}`, async () => refRow(withRef(src), scope(), 'h'))
  }
  const VALUES = ['vNode', 'vArr', 'vFrag', 'vComp', 'vNested', 'vLive', 'vArrLive', 'vTL', 'vFragTL', 'fnNode', 'fnArr', 'vFragText', 'vCompText', 'fnText']
  for (const v of VALUES) {
    // The replay check and the verify's region branch use ONE predicate (any
    // non-text child), so a row whose content is text plus range markers is
    // marked, never replayed unmarked.
    it(`plan replay | every row holding ${v}`, async () => {
      const s = scope()
      const rowsR = [1, 2, 3].map((id) => ({ id, cell: s[v] }))
      const src = 'const App = () => <ul><For each={rowsR} by={(r) => r.id}>{(r) => <li ref={R} class="er">{r.cell}</li>}</For></ul>'
      await refRow(src, { ...s, rowsR }, 'compiled', isTextOnly(v))
    })
    it(`plan replay | a row cell holding ${v} after a string row`, async () => {
      const s = scope()
      const rowsR = [{ id: 1, cell: 'str' }, { id: 2, cell: s[v] }, { id: 3, cell: s[v] }]
      const src = 'const App = () => <ul><For each={rowsR} by={(r) => r.id}>{(r) => <li ref={R} class="rr">{r.cell}</li>}</For></ul>'
      await refRow(src, { ...s, rowsR }, 'compiled', isTextOnly(v))
    })
    it(`plan replay | a plan recorded by a different list, then ${v}`, async () => {
      const s = scope()
      const plain = [{ id: 1, cell: 'p' }, { id: 2, cell: 'q' }]
      const rowsR = [{ id: 3, cell: s[v] }, { id: 4, cell: s[v] }]
      const row = '{(r) => <li ref={R} class="xl">{r.cell}</li>}'
      const src = `const App = () => <div><ul><For each={plain} by={(r) => r.id}>${row}</For></ul><ul><For each={rowsR} by={(r) => r.id}>${row}</For></ul></div>`
      await refRow(src, { ...s, plain, rowsR }, 'compiled', isTextOnly(v))
    })
  }
})

/**
 * The lean path: with no ref, hydrating rows marks nothing for a text cell,
 * marks a structural cell's element and hides nothing (no fragment); a ref
 * hides each region of its build once.
 */
describe('user code is the only trigger for hiding server content', () => {
  /** Hydrate once; count only what `hydrateRoot` itself does. */
  async function measure(src: string, s: Record<string, unknown>) {
    const counts = new Map<string, number>()
    const sink = globalThis as { __pyreon_count__?: ((n: string, k?: number) => void) | undefined }
    const prev = sink.__pyreon_count__
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    host.innerHTML = await renderToString(h(compile(src, s, 'h').App as never, null) as never)
    const before = [...host.querySelectorAll('*')]
    const client = compile(src, s, 'client').App
    // Warm the template cache: parsing a new `<template>` makes a fragment.
    dom.mount(h(client as never, null), document.createElement('div'))
    const frag = vi.spyOn(document, 'createDocumentFragment')
    sink.__pyreon_count__ = (n, k = 1) => counts.set(n, (counts.get(n) ?? 0) + k)
    try {
      hydrateRoot(host, h(client as never, null))
    } finally {
      sink.__pyreon_count__ = prev
    }
    const out = {
      hides: counts.get('runtime.tpl.hide') ?? 0,
      adopts: counts.get('runtime.tpl.adopt') ?? 0,
      fragments: frag.mock.calls.length,
      // Elements that were ever parked keep the (cleared) mark as an own key.
      records: [...host.querySelectorAll('*')].filter((el) => Object.getOwnPropertySymbols(el).some((k) => k.description === 'pyreon.parked')).length,
      replaced: before.filter((n) => !host.contains(n)).map((n) => n.tagName.toLowerCase()),
    }
    frag.mockRestore()

    return out
  }
  const rows = (n: number, cell: (i: number) => unknown) => Array.from({ length: n }, (_, i) => ({ id: i, cell: cell(i) }))

  const textRows = () => measure('const App = () => <ul><For each={tRows} by={(r) => r.id}>{(r) => <li class="t">{r.cell}</li>}</For></ul>', {
    ...scope(),
    tRows: rows(20, (i) => `t${i}`),
  })

  it('N rows of text cells, no ref: nothing marked, nothing hidden', async () => {
    const m = await textRows()
    expect(m.adopts).toBe(21)
    expect(m).toMatchObject({ hides: 0, fragments: 0, records: 0, replaced: [] })
  })

  it('N rows of structural cells, no ref: one mark each, no hide, no extra fragment', async () => {
    const s = { ...scope(), sRows: rows(20, (i) => h('b', null, `s${i}`)) }
    const src = 'const App = () => <ul><For each={sRows} by={(r) => r.id}>{(r) => <li class="s">{r.cell}</li>}</For></ul>'
    const m = await measure(src, s)
    expect(m.adopts).toBe(21)
    expect(m).toMatchObject({ hides: 0, fragments: 0, records: 20, replaced: [] })
  })

  it('one ref in a row template: exactly one hide per row build, adoption kept', async () => {
    const mark = (el: Element | null) => {
      if (el !== null) el.setAttribute('data-r', '1')
    }
    const s = { ...scope(), mark, sRows: rows(5, (i) => h('b', null, `s${i}`)) }
    const src = 'const App = () => <ul><For each={sRows} by={(r) => r.id}>{(r) => <li ref={mark}>{r.cell}</li>}</For></ul>'
    const m = await measure(src, s)
    expect(m).toMatchObject({ hides: 5, fragments: 5, records: 5, replaced: [] })
  })
})

/**
 * A1: nothing is left in the module or on DOM nodes after a build: the region
 * array is empty, no slot brand is left; after a plain hydration with a ref,
 * and after a throwing bind.
 */
describe('no leftover records', () => {
  const RECORD_SYMBOLS = new Set(['pyreon.parkedRange', 'pyreon.parked'])
  function leftovers(host: Element): string[] {
    const out: string[] = []
    const walk = (n: Node) => {
      for (const sym of Object.getOwnPropertySymbols(n)) {
        if (RECORD_SYMBOLS.has(sym.description ?? '') && (n as unknown as Record<symbol, unknown>)[sym] !== undefined) {
          out.push(`${n.nodeName}:${sym.description}`)
        }
      }
      for (let c = n.firstChild; c !== null; c = c.nextSibling) walk(c)
    }
    walk(host)

    return out
  }
  const CASES: [string, string, Record<string, unknown>, Record<string, unknown>, boolean][] = [
    ['a plain hydration with a ref', 'const App = () => <div><span ref={R}>{vNode}</span><em>{vArr}</em></div>', {}, {}, false],
    ['a throwing bind', 'const App = () => <div><span ref={R}>{vNode}</span></div>', { R: () => {} }, { R: () => { throw new Error('boom') } }, true],
  ]
  for (const [name, src, serverScope, clientScope, throws] of CASES) {
    it(name, async () => {
      const base = { ...scope(), R: (el: Element | null) => el?.prepend(document.createElement('i')) }
      const r = await roundTrip(compile(src, { ...base, ...serverScope }, 'h').App, compile(src, { ...base, ...clientScope }, 'client').App, { throws })
      expect(leftovers(r.host)).toEqual([])
      expect(parked._parkedPending).toBe(0)
    })
  }
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
        parts: () => ['a ', h('code', null, 'x')],
        append: () => {},
        rowsMix: [
          { id: 1, cell: 's' },
          { id: 2, cell: h('b', null, 'two') },
          { id: 3, cell: h('b', null, 'three') },
        ],
      }
      const ssr = compile(c.source, recordedScope, 'h').App
      expect(await renderToString(h(ssr as never, null) as never)).toBe(c.server)
    })
  }
})
