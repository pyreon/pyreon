/**
 * #4385: a compiled TEXT slot whose server content is elements (an array mixing
 * strings and VNodes, a VNode) re-created its element (A, B: the adoption
 * verifier refused the sole `' '` placeholder) or its range (C: `_textSlot`
 * cleared it) instead of adopting it. Identical content, no report, so it only
 * showed as DOM churn: every `<For>` row of pyreon.dev's comparison table.
 *
 * Every compiled shape goes through the REAL `transformJSX` (client and SSR).
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { For, Fragment, h } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as dom from '../index'
import { hydrateRoot, onHydrationMismatch } from '../index'
import { bindPolymorphicText } from '../mount'

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

const lower = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

function compile(src: string, scope: Record<string, unknown>, ssr: boolean, knownSignals?: string[]): () => unknown {
  const { code } = transformJSX(src, 'case.tsx', { ...(ssr ? { ssr: true } : {}), ...(knownSignals ? { knownSignals } : {}) })
  const deps = { ...DEPS, ...scope }
  return new Function(...Object.keys(deps), `${lower(code)}\nreturn App`)(...Object.values(deps)) as () => unknown
}

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

/** SSR `server`, hydrate `client` over it; report what survived and what was said. */
async function roundTrip(server: () => unknown, client: () => unknown) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  host.innerHTML = await renderToString(h(server as never, null) as never)
  const before = [...host.querySelectorAll('*')]
  const reports: string[] = []
  const off = onHydrationMismatch((m) => reports.push(`${m.type}: ${String(m.expected)} vs ${String(m.actual)}`))
  try {
    hydrateRoot(host, h(client as never, null))
  } finally {
    off()
  }
  const fresh = document.createElement('div')
  dom.mount(h(client as never, null), fresh)
  const strip = (s: string) => s.replace(/<!--[^>]*-->/g, '')

  return {
    replaced: before.filter((n) => !host.contains(n)).map((n) => n.tagName.toLowerCase()),
    reports,
    html: strip(host.innerHTML),
    freshHtml: strip(fresh.innerHTML),
    host,
  }
}

const Code = (p: { children?: unknown }) => h('code', null, p.children as never)
const Dot = () => h('span', { 'aria-hidden': 'true' })
const parts = (r: { t: string }) => [`${r.t} `, h(Code, null, 'x'), ' b']

const rows = [
  { id: 1, t: 'a' },
  { id: 2, t: 'c' },
]

describe('#4385: a compiled text slot holding element content adopts it', () => {
  const cases: [string, string][] = [
    ['A: sole child of the template root', 'const App = () => <span>{parts(rows[0])}</span>'],
    [
      'B: inside a <For> row after a component sibling',
      'const App = () => <ul><For each={rows} by={(r) => r.id}>{(r) => <li><Dot /><span>{parts(r)}</span></li>}</For></ul>',
    ],
    [
      'B2: inside a <For> row, whole row one template',
      'const App = () => <ul><For each={rows} by={(r) => r.id}>{(r) => <li><b /><span>{parts(r)}</span></li>}</For></ul>',
    ],
    ['C: trailing slot after a static sibling', 'const App = () => <span><b />{parts(rows[0])}</span>'],
    ['mid slot before a static sibling', 'const App = () => <span><b />{parts(rows[0])}<i /></span>'],
    ['direct-tier signal holding elements', 'const App = () => <span>{content()}</span>'],
  ]
  for (const [name, src] of cases) {
    it(name, async () => {
      const scope = { parts, rows, Dot, Code, content: signal<unknown>(parts(rows[0]!)) }
      const r = await roundTrip(compile(src, scope, true), compile(src, scope, false))
      expect(r.html).toBe(r.freshHtml)
      expect(r.replaced).toEqual([])
      expect(r.reports).toEqual([])
    })
  }
})

describe('#4385: the adopted slot stays live and divergences are reported', () => {
  it('flips text ↔ elements after adoption, touching only its own nodes', async () => {
    const on = signal(true)
    const src = 'const App = () => <p><span>{on() ? parts(rows[0]) : "none"}</span><i>after</i></p>'
    const scope = { parts, rows, Code, on }
    const r = await roundTrip(compile(src, scope, true), compile(src, scope, false))
    expect(r.replaced).toEqual([])
    on.set(false)
    expect(r.html.length).toBeGreaterThan(0)
    expect(r.host.querySelector('span')!.textContent).toBe('none')
    expect(r.host.querySelector('i')!.textContent).toBe('after')
    on.set(true)
    expect(r.host.querySelector('span')!.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe('a <code>x</code> b')
    expect(r.host.querySelectorAll('code').length).toBe(1)
  })

  it('a divergence inside the adopted content is reported', async () => {
    const scope = { parts, rows, Code }
    const r = await roundTrip(
      compile('const App = () => <span>{parts(rows[0])}</span>', scope, true),
      compile('const App = () => <span>{parts(rows[1])}</span>', scope, false),
    )
    expect(r.html).toBe(r.freshHtml)
    expect(r.reports).toEqual(['text: c  vs a '])
  })
})

describe('#4385: a parked placeholder no binding adopts is swept', () => {
  it('a raw .data binding (signal-method call) over server elements: server content cleared, reported', async () => {
    const n = signal(1.5)
    const scope = { parts, rows, Code, n }
    const client = compile('const App = () => <span>{n().toFixed(1)}</span>', scope, false, ['n'])
    const server = compile('const App = () => <span>{parts(rows[0])}</span>', scope, true)
    const { code } = transformJSX('const App = () => <span>{n().toFixed(1)}</span>', 'c.tsx', { knownSignals: ['n'] })
    expect(code).toContain('_bindDirect(n')
    const r = await roundTrip(server, client)
    expect(r.html).toBe(r.freshHtml)
    expect(r.html).toBe('<span>1.5</span>')
    expect(r.reports).toEqual(['text: 1.5 vs a x b'])
    n.set(2)
    expect(r.html.length).toBeGreaterThan(0)
    expect(r.host.textContent).toBe('2.0')
  })
})

describe('#4385: an ordinary text binding beside a parked slot is left alone', () => {
  // The slot in the second element is parked by the verifier BEFORE the bind
  // runs, so the first element's binding is set up while a placeholder is
  // pending. It must take its normal path: the server's own text node is
  // adopted (same node), stays reactive, and nothing is reported.
  const tiers: [string, string, string][] = [
    ['_bindText (bare signal read)', '_bindText(label', 'const App = () => <p><i>{label()}</i><span>{content()}</span></p>'],
    [
      'bindPolymorphicText (expression)',
      'bindPolymorphicText(() => (label()',
      'const App = () => <p><i>{label() + ""}</i><span>{parts(rows[0])}</span></p>',
    ],
    [
      '_bindProp (component prop read)',
      '_bindProp(props, "label"',
      'const Row = (props) => <p><i>{props.label}</i><span>{props.body}</span></p>\nconst App = () => <Row label={label()} body={parts(rows[0])} />',
    ],
  ]
  for (const [name, emit, src] of tiers) {
    it(name, async () => {
      const label = signal('hi')
      const scope = { parts, rows, Code, label, content: signal<unknown>(parts(rows[0]!)) }
      expect(transformJSX(src, 'c.tsx').code).toContain(emit)
      const host = document.createElement('div')
      document.body.appendChild(host)
      hosts.push(host)
      host.innerHTML = await renderToString(h(compile(src, scope, true) as never, null) as never)
      const serverText = host.querySelector('i')!.firstChild
      const serverCode = host.querySelector('code')
      expect(serverText!.nodeValue).toBe('hi')
      const reports: string[] = []
      const off = onHydrationMismatch((m) => reports.push(`${m.type}: ${String(m.expected)} vs ${String(m.actual)}`))
      hydrateRoot(host, h(compile(src, scope, false) as never, null))
      off()
      expect(reports).toEqual([])
      expect(host.querySelector('i')!.firstChild).toBe(serverText)
      expect(host.querySelector('code')).toBe(serverCode)
      label.set('yo')
      expect(serverText!.nodeValue).toBe('yo')
      expect(host.querySelector('i')!.childNodes.length).toBe(1)
    })
  }
})

describe('#4385: the sweep covers every slot position', () => {
  const strip = (s: string) => s.replace(/<!--[^>]*-->/g, '')
  // A `.data` writer (`_bindDirect`) over server content that is not one text
  // node, per slot position: [name, client source, server source, swept text].
  const shapes: [string, string, string, string][] = [
    [
      'trailing slot: the marked range is cleared',
      'const App = () => <span><b />{n().toFixed(1)}</span>',
      'const App = () => <span><b />{parts(rows[0])}</span>',
      'a x b',
    ],
    [
      'mid slot: the parked range is discarded, the static sibling survives',
      'const App = () => <span><b />{n().toFixed(1)}<i /></span>',
      'const App = () => <span><b />{parts(rows[0])}<i /></span>',
      'a x b',
    ],
    [
      'trailing slot holding a NESTED range: cleared to its own close marker',
      'const App = () => <span><b />{n().toFixed(1)}</span>',
      'const App = () => <span><b />{nested()}</span>',
      'in x',
    ],
  ]
  for (const [name, clientSrc, serverSrc, swept] of shapes) {
    it(name, async () => {
      const n = signal(1.5)
      const nested = () => [() => 'in ', h(Code, null, 'x')]
      const scope = { parts, rows, Code, n, nested }
      expect(transformJSX(clientSrc, 'c.tsx', { knownSignals: ['n'] }).code).toContain('_bindDirect(n')
      const r = await roundTrip(compile(serverSrc, scope, true), compile(clientSrc, scope, false, ['n']))
      expect(r.html).toBe(r.freshHtml)
      expect(r.host.querySelector('code')).toBeNull()
      expect(r.host.querySelector('span')!.textContent).toBe('1.5')
      // Nothing of the range is left behind: no stray marker either.
      expect(r.host.querySelector('span')!.innerHTML).toBe(strip(r.host.querySelector('span')!.innerHTML))
      expect(r.reports).toEqual([`text: 1.5 vs ${swept}`])
      // The static skeleton was adopted, not rebuilt.
      expect(r.replaced.filter((t) => t !== 'code')).toEqual([])
      n.set(2)
      expect(r.host.querySelector('span')!.textContent).toBe('2.0')
    })
  }

  describe('in production', () => {
    let prev: string | undefined
    beforeEach(() => {
      prev = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
    })
    afterEach(() => {
      if (prev === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = prev
    })

    // The report is dev-only; the sweep itself is not. Without it a production
    // page would show the server's nodes beside the text the binding writes.
    const prodShapes: [string, string, string][] = [
      ['sole slot', 'const App = () => <span>{n().toFixed(1)}</span>', 'const App = () => <span>{parts(rows[0])}</span>'],
      ['trailing slot', 'const App = () => <span><b />{n().toFixed(1)}</span>', 'const App = () => <span><b />{parts(rows[0])}</span>'],
      [
        'mid slot',
        'const App = () => <span><b />{n().toFixed(1)}<i /></span>',
        'const App = () => <span><b />{parts(rows[0])}<i /></span>',
      ],
    ]
    for (const [name, clientSrc, serverSrc] of prodShapes) {
      it(`${name}: server content is still cleared, silently`, async () => {
        const n = signal(1.5)
        const scope = { parts, rows, Code, n }
        const r = await roundTrip(compile(serverSrc, scope, true), compile(clientSrc, scope, false, ['n']))
        expect(r.html).toBe(r.freshHtml)
        expect(r.host.querySelector('code')).toBeNull()
        expect(r.host.querySelector('span')!.textContent).toBe('1.5')
        expect(r.host.querySelector('span')!.innerHTML).not.toContain('<!--')
        expect(r.reports).toEqual([])
        n.set(2)
        expect(r.host.querySelector('span')!.textContent).toBe('2.0')
      })
    }

    it('adoption itself is unchanged: the server elements survive', async () => {
      const scope = { parts, rows, Code }
      const src = 'const App = () => <span><b />{parts(rows[0])}<i /></span>'
      const r = await roundTrip(compile(src, scope, true), compile(src, scope, false))
      expect(r.html).toBe(r.freshHtml)
      expect(r.replaced).toEqual([])
    })
  })
})
