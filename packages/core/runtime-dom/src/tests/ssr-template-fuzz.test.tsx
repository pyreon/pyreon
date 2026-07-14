/**
 * Compile-to-string SSR fast path — RENDER-FUZZ byte-identity gate.
 *
 * A seeded generator builds a small ELIGIBLE element tree TWICE from one spec:
 * as JSX source (compiled with `ssrTemplate: true` → `_ssr(...)`, then eval'd)
 * and as the hand-built h() oracle (the current proven SSR shape, applying the
 * SAME wrap rules the compiler does — dynamic children at recursed positions
 * wrap → `<!--$-->` markers; `.map` items are plain value children). Every seed
 * asserts `renderToString(fast) === renderToString(oracle)`.
 *
 * This gives combinatoric coverage (attr ordering, nesting, text/hole/element
 * interleaving, escaping in every position) that the hand-written differential
 * cases can't. The generator produces ONLY eligible shapes, so `_ssr` is always
 * taken — a seed whose compiled output lacks `_ssr(` fails loudly.
 */
import { transformJSX_JS } from '@pyreon/compiler'
import type { VNode, VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { signal } from '@pyreon/reactivity'
import { _esc, _ssr, _ssrAttr, _ssrAttrGen, _ssrAttrUrl, _ssrChildren, _ssrItem, renderToString } from '@pyreon/runtime-server'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)]!

// Runtime context shared by BOTH representations. The signal reads / bare refs
// / map arrays resolve to these at render time.
interface FuzzCtx {
  data: Record<string, string>
  sigs: Record<string, Signal<string>>
  arrs: Record<string, Record<string, string>[]>
}

// Value pool with tricky characters — exercises escaping in every position.
// Used for TEXT children (emitted as JS string-literal expr children, so the
// value reaches the renderer verbatim — no JSX entity decoding).
const STRINGS = ['plain', 'a<b>', 'x & y', `q"'z`, 'space here', '&amp;', '', '<script>']
// Attribute values are put VERBATIM into `attr="…"` JSX. To keep fast (oxc-
// parsed) and oracle (spec value) reading the SAME value, exclude `"` (closes
// the quote) and `&` (JSX entity-decoding ambiguity). `<`/`>`/`'`/space still
// exercise bake-time escaping (escapeHtmlSsr) on both sides.
const ATTR_STRINGS = ['plain', 'a<b>', 'x y z', `it's ok`, '', 'space here', '<script>']
const TAGS = ['div', 'span', 'section', 'p', 'ul', 'li', 'main', 'b', 'em', 'article']
const ATTR_NAMES = ['class', 'id', 'title', 'data-x', 'role', 'aria-label', 'lang']
// camelCase / renamed names exercise `_ssrAttr`'s toAttrName mapping (dynamic
// attrs only — the compiler can't bake a renamed name).
const DYN_ATTR_NAMES = ['class', 'id', 'title', 'data-x', 'tabIndex', 'className', 'aria-label']

type AttrSpec = { name: string; value: string; dyn: boolean; ref?: string }
type Node =
  | { k: 'text'; s: string }
  | { k: 'bare'; ref: string }
  | { k: 'sig'; ref: string }
  | { k: 'map'; ref: string; item: ElNode }
  | ElNode
interface ElNode {
  k: 'el'
  tag: string
  attrs: AttrSpec[]
  children: Node[]
}

// mode 'recursed' | 'mapitem' — mapitem children are plain value children.
function genEl(r: () => number, depth: number, mode: 'recursed' | 'mapitem'): ElNode {
  const tag = pick(r, TAGS)
  const attrs: AttrSpec[] = []
  const nAttrs = Math.floor(r() * 3)
  const used = new Set<string>()
  for (let i = 0; i < nAttrs; i++) {
    // ~40% dynamic (a dep member access → `_ssrAttr`); else a static literal.
    const dyn = r() < 0.4
    const name = pick(r, dyn ? DYN_ATTR_NAMES : ATTR_NAMES)
    if (used.has(name)) continue
    used.add(name)
    if (dyn) attrs.push({ name, value: '', dyn: true, ref: pick(r, ['f0', 'f1', 'f2']) })
    else attrs.push({ name, value: pick(r, ATTR_STRINGS), dyn: false })
  }
  const children: Node[] = []
  const nKids = depth >= 3 ? Math.floor(r() * 2) : 1 + Math.floor(r() * 2)
  for (let i = 0; i < nKids; i++) children.push(genChild(r, depth, mode))
  return { k: 'el', tag, attrs, children }
}

function genChild(r: () => number, depth: number, mode: 'recursed' | 'mapitem'): Node {
  const roll = r()
  if (depth >= 3 || roll < 0.35) return { k: 'text', s: pick(r, STRINGS) }
  if (roll < 0.5) return { k: 'bare', ref: pick(r, ['f0', 'f1', 'f2']) }
  // Signals only in recursed positions (mapitem signal reads are a rarer shape
  // the oracle would need extra care for; conservative here).
  if (roll < 0.62 && mode === 'recursed') return { k: 'sig', ref: pick(r, ['s0', 's1']) }
  if (roll < 0.75 && mode === 'recursed')
    return { k: 'map', ref: pick(r, ['a0', 'a1']), item: genEl(r, depth + 1, 'mapitem') }
  return genEl(r, depth + 1, mode)
}

// ── spec → JSX source ────────────────────────────────────────────────────────
// ATTR_STRINGS carries no `"`/`&`, so the value is verbatim-safe in `attr="…"`.
function attrSrc(a: AttrSpec): string {
  return a.dyn ? `${a.name}={data.${a.ref}}` : `${a.name}="${a.value}"`
}
function elSrc(el: ElNode): string {
  const attrs = el.attrs.map((a) => ` ${attrSrc(a)}`).join('')
  const kids = el.children.map(childSrc).join('')
  return `<${el.tag}${attrs}>${kids}</${el.tag}>`
}
function childSrc(n: Node): string {
  switch (n.k) {
    case 'text':
      // JSX text can't contain raw `{`/`}`/`<`; use a string-literal expr child
      // for tricky characters so the JSX parser accepts it. renderNode escapes.
      return `{${JSON.stringify(n.s)}}`
    case 'bare':
      return `{data.${n.ref}}`
    case 'sig':
      return `{${n.ref}()}`
    case 'map':
      return `{${n.ref}.map((it) => ${elSrc(n.item)})}`
    case 'el':
      return elSrc(n)
  }
}

// ── spec → h() oracle (applies the h()-path wrap rules) ──────────────────────
function elOracle(el: ElNode, ctx: FuzzCtx, mode: 'recursed' | 'mapitem', it?: Record<string, string>): VNode {
  const props: Record<string, unknown> = {}
  // A dynamic attr is a dep member access (`data.fN`) — NOT wrapped (deps
  // aren't signals), so the h() oracle passes the bare value; renderProp does
  // the escaping/name-map/cx in both paths.
  for (const a of el.attrs) props[a.name] = a.dyn ? ctx.data[a.ref!] : a.value
  const kids = el.children.map((n) => childOracle(n, ctx, mode, it))
  return h(el.tag, Object.keys(props).length ? props : null, ...kids)
}
function childOracle(
  n: Node,
  ctx: FuzzCtx,
  mode: 'recursed' | 'mapitem',
  it?: Record<string, string>,
): VNodeChild {
  switch (n.k) {
    case 'text':
      return n.s
    case 'bare':
      // In mapitem mode a `data.fN` ref still resolves to ctx.data; in the map
      // the item element's own children use the `it` param, not data — but our
      // generator only puts `bare`(data) refs, `text`, and nested els in items,
      // so `it` is unused for values. (The map RECEIVER uses `it`.)
      return ctx.data[n.ref]
    case 'sig': {
      const s = ctx.sigs[n.ref]!
      return () => s() // recursed: wrapped → markers
    }
    case 'map': {
      const arr = ctx.arrs[n.ref]!
      // recursed .map is wrapped (markers); items are plain value children.
      return () => arr.map((item) => elOracle(n.item, ctx, 'mapitem', item))
    }
    case 'el':
      return elOracle(n, ctx, mode, it)
  }
}

// Build a fresh ctx so fast + oracle read identical values.
function makeCtx(): FuzzCtx {
  return {
    data: { f0: 'D<0>', f1: 'd & 1', f2: `d"'2` },
    sigs: { s0: signal('S<0>'), s1: signal('s & 1') },
    arrs: {
      a0: [{ id: 'x' }, { id: 'y' }],
      a1: [{ id: '1' }, { id: '2' }, { id: '3' }],
    },
  }
}

function evalFast(src: string, ctx: FuzzCtx): VNode {
  const code = transformJSX_JS(`const Node = ${src}`, 'fuzz.tsx', {
    ssr: true,
    ssrTemplate: true,
  }).code
  if (!code.includes('_ssr(')) throw new Error(`generator produced non-eligible tree:\n${src}`)
  const body = code.replace(/^import\s+.*$/gm, '').trim()
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    '_ssr',
    '_ssrChildren',
    '_ssrItem',
    '_esc',
    '_ssrAttr',
    '_ssrAttrGen',
    '_ssrAttrUrl',
    'data',
    's0',
    's1',
    'a0',
    'a1',
    `${body}\nreturn Node`,
  )
  return fn(_ssr, _ssrChildren, _ssrItem, _esc, _ssrAttr, _ssrAttrGen, _ssrAttrUrl, ctx.data, ctx.sigs.s0, ctx.sigs.s1, ctx.arrs.a0, ctx.arrs.a1)
}

const SEEDS = 250

describe('SSR fast path — render-fuzz byte-identity', () => {
  test(`${SEEDS} seeded eligible trees render byte-identically to h()`, async () => {
    const failures: string[] = []
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = mulberry32(seed * 2654435761)
      const spec = genEl(r, 0, 'recursed')
      const src = elSrc(spec)
      const fastCtx = makeCtx()
      const slowCtx = makeCtx()
      let fast: string
      let slow: string
      try {
        fast = await renderToString(evalFast(src, fastCtx))
        slow = await renderToString(elOracle(spec, slowCtx, 'recursed'))
      } catch (err) {
        failures.push(`seed=${seed} threw: ${(err as Error).message}\n  src=${src}`)
        continue
      }
      if (fast !== slow) {
        failures.push(`seed=${seed}\n  src=${src}\n  fast=${JSON.stringify(fast)}\n  slow=${JSON.stringify(slow)}`)
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length}/${SEEDS} seeds diverged:\n\n${failures.slice(0, 5).join('\n\n')}`)
    }
  })
})
