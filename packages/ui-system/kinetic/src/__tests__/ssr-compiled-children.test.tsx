/**
 * #4382: an initially-hidden kinetic item renders its hidden state on the
 * server when its children are COMPILED literal markup.
 *
 * With `ssrTemplate` (on by default when `@pyreon/runtime-server` resolves), the
 * compiler lowers a literal element that is a component child to `_ssr([...])`,
 * which returns raw HTML — not a VNode — so kinetic's `cloneVNode` could not add
 * the hidden class/style to it and the item was prerendered VISIBLE (a flash on
 * hydration for scroll-reveal content). The client equivalent, a `_tpl` item, is
 * decorated at mount; the server one now has its root tag decorated
 * (`withRootAttrs` on runtime-server's raw HTML results).
 *
 * The second half of the issue: `_ssr` dropped `key`, so a group saw unkeyed
 * children on the server while the client compile kept the keyed element on the
 * `h()` path. A keyed element is now never templated on either side.
 *
 * The oracle is the SAME source compiled WITHOUT `ssrTemplate` (the `h()` path,
 * which always decorated correctly): both renderers must produce elements with
 * the same class tokens and the same style declarations.
 */
import { transformJSX } from '@pyreon/compiler'
import { _lc, Fragment, h } from '@pyreon/core'
import * as server from '@pyreon/runtime-server'
import { renderToStream, renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { _tpl, hydrateRoot, onHydrationMismatch } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import kinetic from '../kinetic'

const SERVER_HELPERS = Object.fromEntries(
  Object.entries(server).filter(([k]) => k.startsWith('_')),
) as Record<string, unknown>

const lower = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

function compileServer(src: string, scope: Record<string, unknown>, ssrTemplate: boolean): () => unknown {
  const { code } = transformJSX(src, 'case.tsx', { ssr: true, ssrTemplate })
  const deps = { h, Fragment, _lc, ...SERVER_HELPERS, ...scope }
  const fn = new Function(...Object.keys(deps), `${lower(code)}\nreturn App`)

  return fn(...Object.values(deps)) as () => unknown
}

async function streamToString(vnode: unknown): Promise<string> {
  const reader = renderToStream(vnode as never).getReader()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out += value
  }
}

/** Class tokens and style declarations of every element matching `selector`. */
function shape(html: string, selector: string): { cls: string[]; style: Record<string, string> }[] {
  const host = document.createElement('div')
  host.innerHTML = html
  return [...host.querySelectorAll<HTMLElement>(selector)].map((el) => {
    const style: Record<string, string> = {}
    for (let i = 0; i < el.style.length; i++) {
      const name = el.style.item(i)
      style[name] = el.style.getPropertyValue(name)
    }

    return { cls: [...el.classList].sort(), style }
  })
}

const Comp = () => h('b', null, 'c')

/** `hidden: false` — a group has no initially-hidden state (it animates items
 * as they enter and leave); its case is about keys, and the oracle still pins
 * the bytes' class/style. */
const CASES: {
  name: string
  src: string
  scope: () => Record<string, unknown>
  selector: string
  hidden?: false
}[] = [
  {
    name: 'stagger, literal children',
    src: `const App = () => <List show={() => false}><li class="own">a</li><li style="color: red">b</li></List>`,
    scope: () => ({ List: kinetic('ul').enter({ opacity: 0 }).enterClass({ from: 'pre' }).stagger() }),
    selector: 'li',
  },
  {
    name: 'stagger, literal child holding a component (_ssrDeferred)',
    src: `const App = () => <List show={() => false}><li class="own"><Comp /></li></List>`,
    scope: () => ({ List: kinetic('ul').enter({ opacity: 0 }).stagger(), Comp }),
    selector: 'li',
  },
  {
    name: 'stagger, literal child with a dynamic attribute',
    src: `const v = 'x'\nconst App = () => <List show={() => false}><li data-v={v}>a</li></List>`,
    scope: () => ({ List: kinetic('ul').enter({ opacity: 0 }).stagger() }),
    selector: 'li',
  },
  {
    name: 'stagger, void literal child',
    src: `const App = () => <List show={() => false}><img alt="a" /></List>`,
    scope: () => ({ List: kinetic('div').enter({ opacity: 0 }).stagger() }),
    selector: 'img',
  },
  {
    name: 'group, keyed literal children',
    src: `const App = () => <List show={() => false}><li key="a">a</li><li key="b">b</li></List>`,
    scope: () => ({ List: kinetic('ul').enter({ opacity: 0 }).group() }),
    selector: 'li',
    hidden: false,
  },
]

describe('compiled literal children of kinetic items keep their hidden state on the server (#4382)', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const templated = compileServer(c.src, c.scope(), true)
      const viaH = compileServer(c.src, c.scope(), false)
      const want = shape(await renderToString(h(viaH as never, null) as never), c.selector)
      expect(want.length).toBeGreaterThan(0)
      if (c.hidden !== false) for (const item of want) expect(item.style.opacity).toBe('0')

      const html = await renderToString(h(templated as never, null) as never)
      expect(shape(html, c.selector)).toEqual(want)
      const streamed = await streamToString(h(templated as never, null))
      expect(shape(streamed, c.selector)).toEqual(want)
    })
  }

  it("keeps a child's own string style and renders custom properties without a unit", async () => {
    const List = kinetic('ul').enter({ opacity: 0 }).stagger()
    const src = `const App = () => <List show={() => false}><li style="color: red">a</li><li>b</li></List>`
    for (const ssrTemplate of [true, false]) {
      const App = compileServer(src, { List }, ssrTemplate)
      const [a, b] = shape(await renderToString(h(App as never, null) as never), 'li')
      expect(a!.style.color).toBe('red')
      expect(a!.style['--stagger-index']).toBe('0')
      expect(b!.style['--stagger-index']).toBe('1')
    }
  })

  it('the compiled client adopts the decorated server items and keeps them hidden', async () => {
    const List = kinetic('ul').enter({ opacity: 0 }).enterClass({ from: 'pre' }).stagger()
    const src = `const App = () => <List show={() => false}><li class="own">a</li><li>b</li></List>`
    const html = await renderToString(h(compileServer(src, { List }, true) as never, null) as never)
    const { code } = transformJSX(src, 'case.tsx')
    const deps = { h, Fragment, _lc, _tpl, List }
    const App = new Function(...Object.keys(deps), `${lower(code)}\nreturn App`)(...Object.values(deps))
    const host = document.createElement('div')
    document.body.appendChild(host)
    host.innerHTML = html
    const before = [...host.querySelectorAll('li')]
    const reports: string[] = []
    const errors: unknown[] = []
    const off = onHydrationMismatch((m) => reports.push(`${m.type}: ${m.expected} vs ${m.actual}`))
    // Liveness: a component that throws during the walk leaves the server DOM in
    // place, which would pass the identity check below without hydrating.
    const origError = console.error
    console.error = (...args: unknown[]) => errors.push(args)
    try {
      hydrateRoot(host, h(App as never, null))
    } finally {
      off()
      console.error = origError
    }
    expect(errors).toEqual([])
    const after = [...host.querySelectorAll('li')]
    expect(after.length).toBe(before.length)
    after.forEach((li, i) => expect(li).toBe(before[i]))
    for (const li of after) {
      expect(li.classList.contains('pre')).toBe(true)
      expect(li.style.opacity).toBe('0')
    }
    expect(after[0]!.classList.contains('own')).toBe(true)
    expect(reports).toEqual([])
    host.remove()
  })

  it('a keyed literal child of a component stays on the h() path in the SSR emit, as on the client', () => {
    const src = `const App = () => <K><li key="a">a</li><li>b</li></K>`
    const ssr = transformJSX(src, 'k.tsx', { ssr: true, ssrTemplate: true }).code
    expect(ssr).toContain('<li key="a">a</li>')
    expect(ssr).toContain('_ssr(["<li>b</li>"])')
  })
})
