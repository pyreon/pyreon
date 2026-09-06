/**
 * Shared grammar for the SSR ↔ hydration parity fuzzers — ONE source of truth
 * rendered two ways.
 *
 * `hydration-parity-fuzz.test.tsx` builds every seeded spec with `h()`
 * (`toVNode`) and covers the RUNTIME hydration path. Its record names the gap
 * that left three shipped duplication bugs invisible: it never reaches the
 * COMPILED path, where `_tpl` adoption, mid-slot collapse and parking live.
 * `hydration-parity-fuzz-compiled.test.tsx` renders the SAME spec as JSX
 * SOURCE (`toSource`), compiles it through the real `transformJSX`, and
 * hydrates that over the h()-form SSR — faithful, because the compile-to-string
 * SSR emit is fuzz-locked byte-identical to `h()`.
 *
 * Keeping both renderers in this file beside the grammar is deliberate: a
 * shape added to `genSpec` that one renderer does not handle fails to compile
 * here, instead of silently narrowing one gate.
 *
 * Not a test file (underscore-prefixed, no `describe`): importing a test module
 * would re-register its suites in the importer.
 */
import { For, Fragment, h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)]!

export type Spec =
  | { k: 'el'; tag: string; attrs: AttrSpec[]; children: Spec[] }
  | { k: 'void'; tag: string; attrs: AttrSpec[] }
  | { k: 'text'; s: string }
  | { k: 'num'; n: number }
  | { k: 'rtext'; sig: number }
  | { k: 'rattr-el'; tag: string; sig: number; children: Spec[] }
  | { k: 'show'; sig: number; child: Spec; fallback: Spec | null }
  | { k: 'ternary'; sig: number; a: Spec; b: Spec }
  | { k: 'for'; sig: number; itemTag: string }
  | { k: 'frag'; children: Spec[] }
  | { k: 'comp'; child: Spec; rsig: number }
  | { k: 'nullchild' }
  | { k: 'formctl'; ctl: 'input' | 'textarea' | 'select'; value: string; checked: boolean; opts: string[]; variant: boolean }

export interface AttrSpec {
  name: string
  v: string | boolean
}

// Valid-HTML tag sets (the parser restructures invalid nesting, which no
// framework can hydrate — React warns validateDOMNesting for the same).
const FLOW_TAGS = ['div', 'section']
const PHRASING_TAGS = ['span', 'b', 'i']
const PHRASING_ONLY_PARENTS = ['p', 'h2', 'span', 'b', 'i']
const VOIDS_FLOW = ['br', 'hr', 'img', 'input']
const VOIDS_PHRASING = ['br', 'img', 'input']

export interface SigSpec {
  kind: 'string' | 'bool' | 'arr'
  initial: unknown
}

export function genSpec(r: () => number, depth: number, sigs: SigSpec[], phrasing = false): Spec {
  const newSig = (kind: SigSpec['kind'], initial: unknown): number => {
    sigs.push({ kind, initial })
    return sigs.length - 1
  }
  const roll = r()
  if (depth > 3 || roll < 0.14) {
    return r() < 0.7
      ? { k: 'text', s: pick(r, ['hello', 'x', 'a b', 'témû', '<&>"', '0', '']) }
      : { k: 'num', n: Math.floor(r() * 100) }
  }
  if (roll < 0.24) return { k: 'rtext', sig: newSig('string', pick(r, ['alpha', 'beta', ''])) }
  if (roll < 0.3) {
    return {
      k: 'show',
      sig: newSig('bool', r() < 0.5),
      child: genSpec(r, depth + 1, sigs, phrasing),
      fallback: r() < 0.5 ? genSpec(r, depth + 1, sigs, phrasing) : null,
    }
  }
  if (roll < 0.36) {
    return {
      k: 'ternary',
      sig: newSig('bool', r() < 0.5),
      a: genSpec(r, depth + 1, sigs, phrasing),
      b: genSpec(r, depth + 1, sigs, phrasing),
    }
  }
  if (roll < 0.44) {
    const n = 2 + Math.floor(r() * 3)
    return {
      k: 'for',
      sig: newSig('arr', Array.from({ length: n }, (_, i) => i)),
      itemTag: phrasing ? 'span' : pick(r, ['span', 'div']),
    }
  }
  if (roll < 0.5) {
    return {
      k: 'frag',
      children: Array.from({ length: 1 + Math.floor(r() * 3) }, () => genSpec(r, depth + 1, sigs, phrasing)),
    }
  }
  if (roll < 0.56 && !phrasing) {
    return { k: 'comp', child: genSpec(r, depth + 1, sigs, false), rsig: newSig('string', 'prop') }
  }
  if (roll < 0.62) {
    const tag = phrasing ? pick(r, PHRASING_TAGS) : pick(r, [...FLOW_TAGS, ...PHRASING_TAGS, 'p', 'h2'])
    const childPhrasing = PHRASING_ONLY_PARENTS.includes(tag)
    return {
      k: 'rattr-el',
      tag,
      sig: newSig('string', pick(r, ['on', 'off'])),
      children: [genSpec(r, depth + 1, sigs, childPhrasing)],
    }
  }
  if (roll < 0.68) {
    const attrs: AttrSpec[] = []
    if (r() < 0.5) attrs.push({ name: 'hidden', v: r() < 0.5 })
    if (r() < 0.5) attrs.push({ name: 'aria-selected', v: r() < 0.5 ? 'true' : 'false' })
    return { k: 'void', tag: phrasing ? pick(r, VOIDS_PHRASING) : pick(r, VOIDS_FLOW), attrs }
  }
  if (roll < 0.72) return { k: 'nullchild' }
  if (roll < 0.8) {
    // Value-bearing form controls. The generator emitted none of these before,
    // which is exactly why the attribute/property parity class below was
    // invisible to this gate. All three are PHRASING content, so they are valid
    // in every parent this grammar produces.
    const ctl = pick(r, ['input', 'textarea', 'select'] as const)
    const VALUES = ['', 'a b', '<&>"', '0', 'témû', 'v1']
    const opts = ['v1', 'v2', 'v3']
    return {
      k: 'formctl',
      ctl,
      // A select's value sometimes matches an option and sometimes does not —
      // the non-matching case is the one that leaves NOTHING marked selected.
      value: ctl === 'select' ? pick(r, [...opts, 'nomatch']) : pick(r, VALUES),
      checked: r() < 0.5,
      opts,
      // `variant` picks the ARMED shape (a control WITHOUT a masked value prop)
      // so those stay compared byte-for-byte — see KNOWN_ATTR_PARITY_DIVERGENCES.
      variant: r() < 0.35,
    }
  }
  const attrs: AttrSpec[] = []
  if (r() < 0.4) attrs.push({ name: 'class', v: 'c' + Math.floor(r() * 5) })
  const tag = phrasing ? pick(r, PHRASING_TAGS) : pick(r, [...FLOW_TAGS, ...PHRASING_TAGS, 'p', 'h2'])
  const childPhrasing = PHRASING_ONLY_PARENTS.includes(tag)
  return {
    k: 'el',
    tag,
    attrs,
    children: Array.from({ length: 1 + Math.floor(r() * 3) }, () => genSpec(r, depth + 1, sigs, childPhrasing)),
  }
}

export type SigInst = ((...a: unknown[]) => unknown) & { set(v: unknown): void }
export const makeSignals = (specs: SigSpec[]): SigInst[] =>
  specs.map((sp) => signal(sp.initial as never) as unknown as SigInst)

export function toVNode(spec: Spec, S: SigInst[]): unknown {
  switch (spec.k) {
    case 'text':
      return spec.s
    case 'num':
      return spec.n
    case 'nullchild':
      return null
    case 'rtext':
      return () => S[spec.sig]!()
    case 'el': {
      const props: Record<string, unknown> = {}
      for (const a of spec.attrs) props[a.name] = a.v
      return h(spec.tag, props, ...(spec.children.map((c) => toVNode(c, S)) as never[]))
    }
    case 'void': {
      const props: Record<string, unknown> = {}
      for (const a of spec.attrs) props[a.name] = a.v
      return h(spec.tag, props)
    }
    case 'rattr-el':
      return h(spec.tag, { class: () => String(S[spec.sig]!()) }, ...(spec.children.map((c) => toVNode(c, S)) as never[]))
    case 'show':
      return Show({
        when: () => Boolean(S[spec.sig]!()),
        children: toVNode(spec.child, S) as never,
        ...(spec.fallback ? { fallback: toVNode(spec.fallback, S) as never } : {}),
      })
    case 'ternary':
      return () => (S[spec.sig]!() ? toVNode(spec.a, S) : toVNode(spec.b, S))
    case 'for':
      return For({
        each: () => S[spec.sig]!() as number[],
        by: (x: number) => x,
        children: (x: number) => h(spec.itemTag, { 'data-id': String(x) }, `item${x}`),
      })
    case 'frag':
      return h(Fragment, null, ...(spec.children.map((c) => toVNode(c, S)) as never[]))
    case 'comp': {
      const Comp = (props: { label: () => string; children?: unknown }) =>
        h('div', { class: 'comp' }, () => props.label(), props.children as never)
      return h(Comp, { label: () => String(S[spec.rsig]!()) }, toVNode(spec.child, S) as never)
    }
    case 'formctl': {
      // `variant` = the ARMED shape: a control carrying NO value prop, so it is
      // never masked and any future attr/prop parity break on these tags is a
      // hard failure. `checked` / `selected` are armed in BOTH shapes (they
      // agree on this h() path — see the reach caveat on the mask).
      if (spec.variant) {
        if (spec.ctl === 'input') return h('input', { checked: spec.checked })
        if (spec.ctl === 'textarea') return h('textarea', null)
        return h(
          'select',
          null,
          ...spec.opts.map((o, i) => h('option', { value: o, selected: i === 1 && spec.checked }, o) as never),
        )
      }
      // The MASKED shape: `data-pv` marks exactly the element whose value prop
      // is a known divergence, so the mask cannot reach any other element.
      if (spec.ctl === 'input') {
        return h('input', { 'data-pv': '', value: spec.value, checked: spec.checked })
      }
      if (spec.ctl === 'textarea') return h('textarea', { 'data-pv': '', value: spec.value })
      return h(
        'select',
        { 'data-pv': '', value: spec.value },
        ...spec.opts.map((o) => h('option', { value: o }, o) as never),
      )
    }
  }
}

export function flip(specs: SigSpec[], S: SigInst[]): void {
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i]!
    const sig = S[i]!
    if (sp.kind === 'string') sig.set('flip' + i)
    else if (sp.kind === 'bool') sig.set(!(sp.initial as boolean))
    else {
      const arr = [...(sp.initial as number[])].reverse()
      arr.push(90 + i)
      sig.set(arr)
    }
  }
}

export const stripComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')

/**
 * Attribute/property parity divergences this gate deliberately does NOT assert.
 *
 * Each entry is a `tag.prop` whose IDL property does NOT REFLECT to a content
 * attribute (measured in Chromium, not assumed): SSR can only serialize an
 * ATTRIBUTE, while the client mount sets the PROPERTY, so the two paths produce
 * the same observable control state from different markup and a DOM-TEXT oracle
 * reports a divergence. Whether the client should ALSO write the content
 * attribute is a separate open design question — this set exists so that
 * question stays open WITHOUT leaving the whole class ungenerated (which is why
 * it was invisible here until now).
 *
 * Deleting an entry re-arms that exact shape. Everything NOT listed stays
 * armed — including `input.checked` and `option.selected`, which agree on this
 * generator's path (see the reach caveat below).
 *
 * REACH CAVEAT — this generator builds trees with `h()` (`toVNode`), never
 * through `transformJSX`, so it covers the RUNTIME path ONLY. `checked` /
 * `selected` / `indeterminate` diverge only on the COMPILED path, where the
 * compiler's `DOM_PROPS` routes them to a property assignment while
 * `applyStaticProp`'s boolean branch (props.ts) sets the ATTRIBUTE — and that
 * boolean branch fires BEFORE the `key in el` property routing. They are
 * generated and left UNMASKED here, armed against a runtime-path regression,
 * but a companion COMPILED-path gate is still owed; `compiler-integration.test.tsx`
 * is the precedent for that shape.
 */
export const KNOWN_ATTR_PARITY_DIVERGENCES: ReadonlySet<string> = new Set([
  // `input.value` and `textarea.value` were REMOVED here by this PR: the client
  // now establishes `defaultValue` on first application, so hydrated and
  // client-mounted DOM agree on the attribute and those shapes are re-armed.
  // `select.value` stays — it manifests as `<option selected>` and diverges in
  // React, Preact and Solid identically, so it is industry-normal rather than
  // ours to fix.
  'select.value',
])

/**
 * Neutralize exactly the divergences named above, and nothing else.
 *
 * Scoped by the `data-pv` marker the generator puts on precisely the elements it
 * gave a listed value prop, so an element that merely happens to carry `value`
 * or `selected` for another reason is still compared byte-for-byte.
 */
const ATTRS_AFTER_PV_INPUT = /<input data-pv=""((?: [a-zA-Z-]+="[^"]*")*)>/g
const VALUE_ATTR = / value="[^"]*"/

export function maskKnownDivergences(html: string): string {
  let out = html
  if (KNOWN_ATTR_PARITY_DIVERGENCES.has('input.value')) {
    // SSR serializes `value="x"`; the client sets the non-reflecting property.
    // The attribute scan must be QUOTE-aware, not `[^>]*` — a serialized value
    // can legitimately contain `>` (`<&>"` -> `value="<&amp;>&quot;"`), which
    // truncates a naive tag match and silently stops masking.
    out = out.replace(ATTRS_AFTER_PV_INPUT, (_m, attrs: string) => `<input data-pv=""${attrs.replace(VALUE_ATTR, '')}>`)
  }
  if (KNOWN_ATTR_PARITY_DIVERGENCES.has('textarea.value')) {
    // SSR serializes the value as TEXT CONTENT; the client sets the property.
    out = out.replace(/<textarea data-pv=""([^>]*)>[\s\S]*?<\/textarea>/g, '<textarea data-pv=""$1></textarea>')
  }
  if (KNOWN_ATTR_PARITY_DIVERGENCES.has('select.value')) {
    // SSR marks the matching `<option selected>`; the client sets the property
    // post-children (applySelectValueProp). Scoped to the marked select's block.
    out = out.replace(/<select data-pv=""[\s\S]*?<\/select>/g, (block) => block.replace(/ selected=""/g, ''))
  }
  return out
}

/** The single comparison surface for O2 / O3 / O5. */
export const cmp = (html: string) => maskKnownDivergences(stripComments(html))



// ─── toSource — the SAME spec as JSX source, mirroring toVNode branch for branch ───
const attrsSrc = (attrs: AttrSpec[]): string =>
  attrs.map((a) => (typeof a.v === 'boolean' ? ` ${a.name}={${a.v}}` : ` ${a.name}=${JSON.stringify(a.v)}`)).join('')

/** JSX EXPRESSION position (attribute value, ternary arm). */
function expr(spec: Spec): string {
  switch (spec.k) {
    case 'text': return JSON.stringify(spec.s)
    case 'num': return String(spec.n)
    case 'nullchild': return 'null'
    case 'rtext': return `(() => S[${spec.sig}]())`
    case 'ternary': return `(() => (S[${spec.sig}]() ? ${expr(spec.a)} : ${expr(spec.b)}))`
    default: return element(spec)
  }
}
/** JSX CHILD position. */
function child(spec: Spec): string {
  switch (spec.k) {
    case 'text': return `{${JSON.stringify(spec.s)}}`
    case 'num': return `{${spec.n}}`
    case 'nullchild': return '{null}'
    case 'rtext': return `{() => S[${spec.sig}]()}`
    case 'ternary': return `{() => (S[${spec.sig}]() ? ${expr(spec.a)} : ${expr(spec.b)})}`
    default: return element(spec)
  }
}
/** An element-like spec as a JSX element (valid in both positions). */
function element(spec: Spec): string {
  switch (spec.k) {
    case 'el': return `<${spec.tag}${attrsSrc(spec.attrs)}>${spec.children.map(child).join('')}</${spec.tag}>`
    case 'void': return `<${spec.tag}${attrsSrc(spec.attrs)} />`
    case 'rattr-el': return `<${spec.tag} class={() => String(S[${spec.sig}]())}>${spec.children.map(child).join('')}</${spec.tag}>`
    case 'show':
      return `<Show when={() => Boolean(S[${spec.sig}]())}${spec.fallback ? ` fallback={${expr(spec.fallback)}}` : ''}>${child(spec.child)}</Show>`
    case 'for':
      return `<For each={() => S[${spec.sig}]()} by={(x) => x}>{(x) => <${spec.itemTag} data-id={String(x)}>{'item' + x}</${spec.itemTag}>}</For>`
    case 'frag': return `<>${spec.children.map(child).join('')}</>`
    case 'comp': return `<Comp label={() => String(S[${spec.rsig}]())}>${child(spec.child)}</Comp>`
    case 'formctl': {
      if (spec.variant) {
        if (spec.ctl === 'input') return `<input checked={${spec.checked}} />`
        if (spec.ctl === 'textarea') return `<textarea />`
        return `<select>${spec.opts.map((o, i) => `<option value=${JSON.stringify(o)} selected={${i === 1 && spec.checked}}>{${JSON.stringify(o)}}</option>`).join('')}</select>`
      }
      if (spec.ctl === 'input') return `<input data-pv="" value={${JSON.stringify(spec.value)}} checked={${spec.checked}} />`
      if (spec.ctl === 'textarea') return `<textarea data-pv="" value={${JSON.stringify(spec.value)}} />`
      return `<select data-pv="" value={${JSON.stringify(spec.value)}}>${spec.opts.map((o) => `<option value=${JSON.stringify(o)}>{${JSON.stringify(o)}}</option>`).join('')}</select>`
    }
    default: {
      // text / num / nullchild / rtext / ternary are not elements
      const _never: never = spec as never
      throw new Error('element(): non-element spec ' + JSON.stringify(_never))
    }
  }
}
/**
 * A complete module: `Comp` mirrors toVNode's inline component; `App` renders
 * the spec under `<main>`. `S` (the signal instances) is supplied as a GLOBAL by
 * the compiling harness, so one compiled module serves instances A, B and C.
 */
export function toSource(spec: Spec): string {
  return [
    `const Comp = (props) => <div class="comp">{() => props.label()}{props.children}</div>`,
    `const App = () => ${element(spec)}`,
  ].join('\n')
}
