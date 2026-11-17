/**
 * #4385 case D: every child the client template lowers to a `<!>` placeholder
 * must be a `<!--$-->…<!--/$-->` range in the server HTML, or its element's
 * sole child (markers elided on both sides). A FIXED child
 * (`{flag ? <b/> : null}`, `{row.name}`, `{children}`) got no range: the
 * server rendered it as a plain child, the adopt verifier could not tell where
 * its content ended and swapped in a clone. Identical content, no report, the
 * element and everything under it re-created.
 *
 * Three locks, all through the REAL compiler on both sides:
 *   1. the matrix: child kind × sibling position × SSR path × container, each
 *      cell hydrated and checked for node identity, a report-free walk and the
 *      fresh-mount result, for both compiler backends;
 *   2. the pairing oracle: for random trees, every client template's `<!>`
 *      placeholders line up one to one with the server's ranges. It reads the
 *      client emit and the server HTML only, so it relies neither on the two
 *      backends agreeing with each other nor on the hydration runtime;
 *   3. the recorded cases the Chromium twin replays are current.
 */
import { transformJSX, transformJSX_JS } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { For, Fragment, h, Show } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import * as server from '@pyreon/runtime-server'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as dom from '../index'
import { hydrateRoot, onHydrationMismatch } from '../index'
import { bindPolymorphicText } from '../mount'
import { PLACEHOLDER_RANGE_CASES } from './_placeholder-range-cases'

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
  // `transformJSX` takes the native binary when it is installed.
  ['default', transformJSX],
  ['js', transformJSX_JS as Transform],
]

function compile(
  src: string,
  scope: Record<string, unknown>,
  side: Side,
  backend: Transform = transformJSX,
  tcc = true,
): () => unknown {
  const { code } = backend(src, 'case.tsx', {
    templatizeComponentChildren: tcc,
    ...(side === 'client' ? {} : { ssr: true }),
    ...(side === 'ssr' ? { ssrTemplate: true } : {}),
  })
  const deps = { ...(side === 'client' ? DEPS : SSR_DEPS), ...scope }

  return new Function(...Object.keys(deps), `${lower(code)}\nreturn App`)(...Object.values(deps)) as () => unknown
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
  try {
    hydrateRoot(host, h(clientApp as never, null))
  } finally {
    off()
  }
  const fresh = document.createElement('div')
  dom.mount(h(clientApp as never, null), fresh)
  const strip = (s: string) => s.replace(/<!--[^>]*-->/g, '')

  return {
    replaced: before.filter((n) => !host.contains(n)).map((n) => n.tagName.toLowerCase()),
    reports,
    html: strip(host.innerHTML),
    freshHtml: strip(fresh.innerHTML),
    serverHtml,
  }
}

const Comp = () => h('em', null, 'c')

const rows = [
  { id: 1, name: 'one' },
  { id: 2, name: 'two' },
]

function scope(): Record<string, unknown> {
  return {
    flag: 'Before',
    vNode: h('b', null, 'n'),
    vArr: ['t', h('b', null, 'n')],
    vStr: 'str',
    vNull: null,
    list: ['p', 'q'],
    rows,
    Comp,
  }
}

const PRELUDE = 'function cell(x) { return <b>{x}</b> }\n'

// ─── 1. The matrix ──────────────────────────────────────────────────────────

/** Child kinds; each is substituted into the positions below. */
const KINDS: [string, string][] = [
  ['static conditional', '{flag ? <b>{flag}</b> : null}'],
  ['static &&', '{flag && <b>x</b>}'],
  ['value: VNode', '{vNode}'],
  ['value: array', '{vArr}'],
  ['value: string', '{vStr}'],
  ['value: null', '{vNull}'],
  ['in-file JSX helper call', '{cell(flag)}'],
  ['.map result', '{list.map((s) => <u>{s}</u>)}'],
  ['fragment-wrapped value', '<>{vNode}</>'],
  ['component child', '<Comp />'],
]

const POSITIONS: [string, (x: string) => string][] = [
  ['only', (x) => x],
  ['first', (x) => `${x}<i />`],
  ['middle', (x) => `<s />${x}<i />`],
  ['last', (x) => `<s />${x}`],
  ['adjacent to text', (x) => `a${x}b`],
  ['two in a row', (x) => `${x}${x}<i />`],
]

const CONTAINERS: [string, (e: string) => string][] = [
  ['element', (e) => `<div>${e}</div>`],
  ['fragment root', (e) => `<>${e}<p /></>`],
  ['component root', (e) => e],
  [
    '<For> row',
    (e) =>
      `<ul><For each={rows} by={(r) => r.id}>{(r) => ${e.replace(/^<span>/, '<li>').replace(/<\/span>$/, '</li>')}}</For></ul>`,
  ],
  ['<Show> branch', (e) => `<section><Show when={() => true}>${e}</Show></section>`],
]

/**
 * NOT placeholders: a VNode or array value as an element's sole child, or in a
 * static text mix the client fuses, is `_setChild` into an EMPTY template
 * element, and the verifier refuses server elements under one. A separate
 * class from the placeholder pairing locked here (tracked as a follow-up).
 */
const isSetChildClass = (kind: string, position: string) =>
  (kind === 'value: VNode' || kind === 'value: array') &&
  (position === 'only' || position === 'adjacent to text')

describe('#4385 D: a fixed child on a client placeholder hydrates by adoption', () => {
  for (const [backendName, backend] of BACKENDS) {
    for (const [cName, container] of CONTAINERS) {
      for (const [pName, position] of POSITIONS) {
        for (const [kName, kind] of KINDS) {
          if (isSetChildClass(kName, pName)) continue
          const src = `${PRELUDE}const App = () => ${container(`<span>${position(kind)}</span>`)}`
          it(`${backendName} | ${cName} | ${pName} | ${kName}`, async () => {
            const s = scope()
            const client = compile(src, s, 'client', backend)
            const viaH = await roundTrip(compile(src, s, 'h', backend), client)
            const viaSsr = await roundTrip(compile(src, s, 'ssr', backend), client)
            // The two SSR emits are byte-identical, ranges included. (`<For>`'s
            // key markers differ when its rows are `_ssr` strings rather than
            // vnodes: per-row `<!--k:-->` instead of keys on the close. That is
            // the accepted, pre-existing form; both hydrate.)
            const forKeys = (html: string) => html.replace(/<!--(k:[^>]*|\/pyreon-for[^>]*)-->/g, '')
            expect(forKeys(viaSsr.serverHtml)).toBe(forKeys(viaH.serverHtml))
            for (const r of [viaH, viaSsr]) {
              expect(r.html).toBe(r.freshHtml)
              expect(r.reports).toEqual([])
              expect(r.replaced).toEqual([])
            }
          })
        }
      }
    }
  }
})

describe('the adopted fixed child', () => {
  it('the issue shape: one range on the server, every server node kept', async () => {
    const src = 'const App = () => <span>{flag ? <b>{flag}</b> : null}<i /></span>'
    const s = scope()
    const r = await roundTrip(compile(src, s, 'h'), compile(src, s, 'client'))
    expect(r.serverHtml).toBe('<span><!--$--><b>Before</b><!--/$--><i></i></span>')
    expect(r.replaced).toEqual([])
    expect(r.html).toBe('<span><b>Before</b><i></i></span>')
  })

  it('a server/client divergence inside the range is reported and repaired', async () => {
    const s = scope()
    const r = await roundTrip(
      compile('const App = () => <span><s />{flag ? <b>{flag}</b> : null}<i /></span>', s, 'h'),
      compile('const App = () => <span><s />{flag ? <b>{"After"}</b> : null}<i /></span>', s, 'client'),
    )
    expect(r.html).toBe(r.freshHtml)
    expect(r.reports).toEqual(['text: After vs Before'])
  })

  it('a value that already is a function keeps ONE range (`_slot` passes it through)', async () => {
    const s = { ...scope(), fn: () => 'f' }
    const src = 'const App = () => <span><s />{fn}<i /></span>'
    const viaH = await roundTrip(compile(src, s, 'h'), compile(src, s, 'client'))
    const viaSsr = await roundTrip(compile(src, s, 'ssr'), compile(src, s, 'client'))
    expect(viaH.serverHtml).toBe('<span><s></s><!--$-->f<!--/$--><i></i></span>')
    expect(viaSsr.serverHtml).toBe(viaH.serverHtml)
    expect(viaH.replaced).toEqual([])
    expect(viaH.html).toBe(viaH.freshHtml)
  })

  it('`_setChildAt` renders `false` as nothing, on a fresh mount and over a range', async () => {
    const s = { ...scope(), off: false }
    const src = 'const App = () => <span><s />{off}<i /></span>'
    const r = await roundTrip(compile(src, s, 'h'), compile(src, s, 'client'))
    expect(r.freshHtml).toBe('<span><s></s><i></i></span>')
    expect(r.html).toBe(r.freshHtml)
  })
})

// ─── 2. The pairing oracle ──────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Tags the HTML parser nests as written (`<p>` closes before a block, and a
// formatting tag around a block is re-parented), so the parsed template and the
// parsed server HTML are the trees the compiler saw.
const TAGS = ['div', 'span', 'section', 'article']

const LEAVES = [
  'txt',
  '{flag ? <b>{flag}</b> : null}',
  '{flag && <u>u</u>}',
  '{vNode}',
  '{vArr}',
  '{vStr}',
  '{vNull}',
  '{(<u>u</u>) as never}',
  '<>{vNode}</>',
  '{"lit"}',
  '{sig()}',
  '{() => sig()}',
  '{props.label}',
  '{cell(flag)}',
  '{list.map((s) => <u>{s}</u>)}',
]

/** A random component; every element carries a unique `id` the oracle keys on. */
function genTree(seed: number): string {
  const r = mulberry32(seed)
  let n = 0
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!
  const el = (depth: number): string => {
    const tag = pick(TAGS)
    const id = `e${n++}`
    const kids: string[] = []
    const k = depth > 3 ? Math.floor(r() * 3) : 1 + Math.floor(r() * 4)
    for (let i = 0; i < k; i++) {
      const roll = r()
      if (roll < 0.3 && depth < 4) kids.push(el(depth + 1))
      else if (roll < 0.36 && depth < 3) {
        kids.push(`<For each={rows} by={(row) => row.id}>{(row) => <li id="e${n++}"><s />{row.name}<i /></li>}</For>`)
      } else {
        const leaf = pick(LEAVES)
        kids.push(leaf === 'txt' ? `t${Math.floor(r() * 9)}` : leaf)
      }
    }
    // A trailing component run (absorbed under `templatizeComponentChildren`).
    if (r() < 0.15) kids.push('<Comp />')

    return `<${tag} id="${id}">${kids.join('')}</${tag}>`
  }

  return `${PRELUDE}const App = (props) => ${el(0)}`
}

/** The literal of every `_tpl("…")` / `_tpl('…')` in a client emit. */
function templateHtmls(code: string): string[] {
  const out: string[] = []
  const re = /_tpl\(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g
  for (let m = re.exec(code); m !== null; m = re.exec(code)) {
    out.push(new Function(`return ${m[1]}`)() as string)
  }

  return out
}

/**
 * One token per child: `E#id` for an element, `T` for a text run, `P` for a
 * placeholder (template) or a whole `<!--$-->…<!--/$-->` range (server).
 */
function tokens(el: Element, server: boolean): string[] {
  const out: string[] = []
  for (let c: ChildNode | null = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 1) out.push(`E#${(c as Element).id}`)
    else if (c.nodeType === 3) {
      if (out[out.length - 1] !== 'T') out.push('T')
    } else if (c.nodeType === 8 && (!server || (c as Comment).data === '$')) {
      out.push('P')
      if (!server) continue
      let depth = 0
      for (c = c.nextSibling; c; c = c.nextSibling) {
        if (c.nodeType !== 8) continue
        const d = (c as Comment).data
        if (d === '$') depth++
        else if (d === '/$') {
          if (depth === 0) break
          depth--
        }
      }
      if (c === null) break
    }
  }

  return out
}

const ORACLE_SIGNAL = signal('S')

describe('pairing oracle: client placeholders and server ranges line up', () => {
  const SEEDS = Math.max(1, Number(process.env.PYREON_FUZZ_SEEDS) || 120)
  for (const [backendName, backend] of BACKENDS) {
    for (const tcc of [true, false]) {
      for (const side of ['h', 'ssr'] as const) {
        it(`${backendName} | ${side} | templatizeComponentChildren=${tcc}: ${SEEDS} seeds`, async () => {
          let compared = 0
          let placeholders = 0
          const failures: string[] = []
          for (let seed = 1; seed <= SEEDS; seed++) {
            const src = genTree(seed)
            const clientCode = backend(src, 'case.tsx', { templatizeComponentChildren: tcc }).code
            const App = compile(src, { ...scope(), sig: ORACLE_SIGNAL }, side, backend, tcc)
            const host = document.createElement('div')
            host.innerHTML = await renderToString(h(App as never, { label: 'L' }) as never)
            for (const html of templateHtmls(clientCode)) {
              const tpl = document.createElement('template')
              tpl.innerHTML = html
              for (const tEl of tpl.content.querySelectorAll('[id]')) {
                // A mount hole ends in component output the template has no
                // counterpart for; a sole text or placeholder has no markers.
                if (tEl.hasAttribute('data-pyreon-hole')) continue
                const want = tokens(tEl, false)
                if (want.length === 0 || (want.length === 1 && !want[0]!.startsWith('E#'))) continue
                for (const sEl of host.querySelectorAll(`#${tEl.id}`)) {
                  compared++
                  placeholders += want.filter((t) => t === 'P').length
                  const got = tokens(sEl, true)
                  if (got.join(' ') !== want.join(' ')) {
                    failures.push(`seed=${seed} #${tEl.id}: template [${want.join(' ')}] vs server [${got.join(' ')}]\n${src}`)
                  }
                }
              }
            }
          }
          expect(failures.slice(0, 3)).toEqual([])
          // Non-vacuity: the sweep must actually compare placeholders.
          expect(compared).toBeGreaterThan(SEEDS)
          expect(placeholders).toBeGreaterThan(SEEDS)
        })
      }
    }
  }
})

// ─── 3. The recorded cases the Chromium twin replays ────────────────────────

describe('recorded Chromium cases match the real toolchain', () => {
  for (const c of PLACEHOLDER_RANGE_CASES) {
    it(c.name, async () => {
      expect(lower(transformJSX(c.source, 'case.tsx', { templatizeComponentChildren: true }).code)).toBe(c.compiled)
      const ssr = compile(c.source, scope(), 'h')
      expect(await renderToString(h(ssr as never, null) as never)).toBe(c.server)
    })
  }
})
