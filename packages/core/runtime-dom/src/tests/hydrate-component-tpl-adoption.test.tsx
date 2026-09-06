/**
 * Regression lock — COMPONENT-ROOT compiled-template hydration adoption.
 *
 * A component whose body is a static DOM subtree compiles to a single
 * `_tpl()` call and returns a NativeItem. Before this feature, hydration
 * CLONED that template and `replaceChild`-ed the server DOM away — so every
 * templatized subtree in every compiled SSR app was rebuilt rather than
 * adopted. That is not merely slower: the swap destroys user-visible state
 * that lives on the server nodes (text typed into an uncontrolled input
 * before JS boots, focus, scroll position, listeners attached by non-Pyreon
 * code). `<For>` rows already adopted via the one-shot `_tpl` target; the
 * component root did not.
 *
 * `hydrateComponent` now arms that same one-shot target with the component's
 * SSR cursor, so a root `_tpl` binds against the existing nodes.
 *
 * SAFETY — the slot is consumed by whichever `_tpl` runs FIRST inside the
 * armed window, which for an h()-rooted component is an INNER template, not
 * the root. The verifier therefore gates adoption on the template's STATIC
 * SKELETON being byte-equal to the target's (tags + static attributes +
 * static text; dynamic props/text are absent from the template and are
 * skipped). Under that gate a "wrong" consumer can only ever adopt a node
 * byte-identical to the one it would have cloned — so mis-consumption costs
 * an adoption, never correctness. The `steals` specs below lock exactly that.
 *
 * Every spec compiles REAL JSX through `transformJSX` (the actual client
 * emit) and hydrates over REAL `renderToString` output.
 *
 * Bisect: reverting the `hydrateComponent` arming fails the adoption +
 * state-preservation specs (retention drops to 0/N, typed input is wiped).
 * Reverting the static-skeleton gate in `hydration-plan.ts` fails the
 * `does NOT steal` spec (the local template adopts the root's SSR node and
 * comes back carrying the wrong class).
 */
import { query } from '@pyreon/test-utils'
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, h } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindText,
  _mountSlot,
  _textSlot,
  _setAttr,
  _setClass,
  _setStyle,
  _tpl,
  hydrateRoot,
} from '../index'
import { bindPolymorphicText } from '../mount'

// ─── Counter sink ────────────────────────────────────────────────────────────
const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }
let counts: Record<string, number>
let prevSink: typeof g.__pyreon_count__
beforeEach(() => {
  counts = {}
  prevSink = g.__pyreon_count__
  g.__pyreon_count__ = (name, n = 1) => {
    counts[name] = (counts[name] ?? 0) + n
  }
})
afterEach(() => {
  g.__pyreon_count__ = prevSink
  document.body.innerHTML = ''
})
const tplAdopted = () => counts['runtime.tpl.adopt'] ?? 0

// ─── Real-transform harness ──────────────────────────────────────────────────
const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _mountSlot,
  _textSlot,
  bindPolymorphicText,
  h,
  Fragment,
  For,
  signal,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

/** The Pyreon transform leaves COMPONENT JSX for the app's downstream jsx
 * pass — lower it to h() so `new Function` can evaluate. */
const lowerResidualJsx = (code: string) =>
  transformSync(code, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

function compileApp(source: string, globals: Record<string, unknown> = {}): () => unknown {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  return fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
}

async function ssrInto(vnode: unknown): Promise<HTMLElement> {
  const html = await renderToString(vnode as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

/** Every element + text node under `host`, document order. */
function snapshot(host: HTMLElement): Node[] {
  const out: Node[] = []
  const walk = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n)
  return out
}

/** How many of the pre-hydration nodes are still in the tree afterwards. */
function retained(before: Node[], host: HTMLElement): number {
  const after = new Set(snapshot(host))
  return before.filter((n) => after.has(n)).length
}

describe('component-root compiled-template hydration adoption', () => {
  it('ADOPTS a leaf template — node identity preserved, tpl.adopt fires', async () => {
    const host = await ssrInto(h('div', { class: 'leaf' }, 'hello'))
    const before = snapshot(host)
    expect(before).toHaveLength(2) // <div> + text

    const App = compileApp(`const App = () => <div class="leaf">hello</div>`)
    const dispose = hydrateRoot(host, h(App as never, null))

    expect(retained(before, host)).toBe(2)
    expect(tplAdopted()).toBe(1)
    expect(host.innerHTML).toBe('<div class="leaf">hello</div>')
    dispose()
  })

  it('ADOPTS a nested template — every level kept, not just the root', async () => {
    const host = await ssrInto(
      h('div', { class: 'a' }, h('section', { class: 'b' }, h('p', null, 'deep'))),
    )
    const before = snapshot(host)
    expect(before).toHaveLength(4) // div + section + p + text

    const App = compileApp(
      `const App = () => <div class="a"><section class="b"><p>deep</p></section></div>`,
    )
    const dispose = hydrateRoot(host, h(App as never, null))

    expect(retained(before, host)).toBe(4)
    expect(host.innerHTML).toBe('<div class="a"><section class="b"><p>deep</p></section></div>')
    dispose()
  })

  it('PRESERVES user state living on the server nodes (typed value + focus)', async () => {
    const host = await ssrInto(h('form', { class: 'f' }, h('input', { name: 'q', type: 'text' })))
    const input = query<HTMLInputElement>(host, 'input')
    // The user starts typing before the bundle has booted.
    input.value = 'typed before hydration'
    input.focus()
    expect(document.activeElement).toBe(input)

    const App = compileApp(`const App = () => <form class="f"><input name="q" type="text" /></form>`)
    const dispose = hydrateRoot(host, h(App as never, null))

    const after = query<HTMLInputElement>(host, 'input')
    expect(after).toBe(input) // adopted, not swapped
    expect(after.value).toBe('typed before hydration')
    expect(document.activeElement).toBe(after)
    dispose()
  })

  it('an adopted template stays REACTIVE — signal flip patches the SSR text in place', async () => {
    const label = signal('before')
    const host = await ssrInto(h('div', { class: 'r' }, h('span', null, () => label())))
    const spanBefore = query<HTMLElement>(host, 'span')

    const App = compileApp(`const App = () => <div class="r"><span>{() => label()}</span></div>`, {
      label,
    })
    const dispose = hydrateRoot(host, h(App as never, null))
    expect(host.querySelector('span')).toBe(spanBefore)

    label.set('after')
    expect(spanBefore.textContent).toBe('after')
    dispose()
  })

  it('a NON-templatized (h()-rooted) component still hydrates its element normally', async () => {
    // Element with a component child → the emitter bails to h(), so this goes
    // through hydrateElement. It must keep adopting exactly as before.
    const Inner = () => h('span', { class: 'i' }, 'x')
    const host = await ssrInto(h('div', { class: 'outer' }, h(Inner, null)))
    const before = snapshot(host)

    const App = compileApp(`const App = () => <div class="outer"><Inner /></div>`, { Inner })
    const dispose = hydrateRoot(host, h(App as never, null))

    // The outer div + its subtree are adopted by the element path.
    expect(retained(before, host)).toBe(before.length)
    dispose()
  })

  // ─── Safety: the one-shot slot is consumed by the FIRST `_tpl` in the window ──

  it('does NOT steal the SSR node for a local template whose skeleton differs', async () => {
    // `other` is evaluated BEFORE the root `_tpl`, so it reaches the armed
    // slot first. Its static skeleton (class="other") differs from the SSR
    // root's (class="root"), so the verifier must BAIL — leaving `other` a
    // correct fresh clone rather than a recycled, mis-classed server node.
    const captured: { el?: Element } = {}
    const host = await ssrInto(h('div', { class: 'root' }, () => 'ROOTVAL'))

    const App = compileApp(
      `const App = () => { const other = <div class="other">{a()}</div>; capture(other); return <div class="root">{b()}</div> }`,
      {
        a: () => 'OTHERVAL',
        b: () => 'ROOTVAL',
        capture: (n: { el: Element }) => {
          captured.el = n.el
        },
      },
    )
    const dispose = hydrateRoot(host, h(App as never, null))

    expect(captured.el?.getAttribute('class')).toBe('other')
    expect(captured.el?.textContent).toBe('OTHERVAL')
    // and it must not be the server's root node
    expect(captured.el).not.toBe(host.firstElementChild)
    expect(host.innerHTML).toBe('<div class="root">ROOTVAL</div>')
    dispose()
  })

  it('does NOT steal via a CACHED PLAN — the fast path must not skip the gate', async () => {
    // The verifier keeps a per-template AdoptPlan and can spot-replay it
    // instead of re-walking the skeleton. That is sound only for `<For>` rows
    // (one renderItem ⇒ rows 2..N are structurally identical). The plan is
    // keyed by the TEMPLATE and `_tplCache` is keyed by the HTML string and is
    // process-global, so two unrelated components sharing a template shared a
    // plan — and for a STATIC template `replayAdoptPlan` has no triplet or
    // removal spots to check, so it returned true for ANY same-tag target.
    //
    // Effect before the fix, at DEFAULT settings with no option involved: the
    // local `other` template adopted the server's `<div class="root">` and came
    // back carrying `class="root"` and the server's text. The page still looked
    // right (the root cloned afterwards), so the damage was confined to the
    // detached node the app holds a reference to — silent by construction.
    //
    // Plan replay is now opt-in and only the `<For>` row loop opts in.
    const warm = await ssrInto(h('div', { class: 'other' }, 'X'))
    hydrateRoot(warm, h(compileApp(`const App = () => <div class="other">X</div>`) as never, null))()
    expect(tplAdopted()).toBe(1) // a plan is now cached for that template

    const captured: { el?: Element } = {}
    const host = await ssrInto(h('div', { class: 'root' }, 'ROOTVAL'))
    const App = compileApp(
      `const App = () => { const other = <div class="other">X</div>; capture(other); return <div class="root">ROOTVAL</div> }`,
      {
        capture: (n: { el: Element }) => {
          captured.el = n.el
        },
      },
    )
    const dispose = hydrateRoot(host, h(App as never, null))

    expect(captured.el?.getAttribute('class')).toBe('other')
    expect(captured.el?.textContent).toBe('X')
    expect(captured.el).not.toBe(host.firstElementChild)
    expect(host.innerHTML).toBe('<div class="root">ROOTVAL</div>')
    dispose()
  })

  it('<For> rows DO use the plan fast path — the opt-in is still wired', async () => {
    // The counterpart to the theft spec above. Making plan replay opt-in risks
    // the opposite silent failure: drop the `true` at the `<For>` arming site
    // and every row falls back to a full skeleton walk. The list still hydrates
    // correctly, so no behavioural test would notice — only this counter does.
    // Row 1 BUILDS the plan, rows 2..N replay it, hence 2 fires for 3 rows.
    const items = [
      { id: 1, n: 'a' },
      { id: 2, n: 'b' },
      { id: 3, n: 'c' },
    ]
    const host = await ssrInto(
      h(
        'ul',
        { class: 'l' },
        h(For as never, {
          each: () => items,
          by: (i: { id: number }) => i.id,
          children: (it: { n: string }) => h('li', { class: 'r' }, () => it.n),
        } as never),
      ),
    )
    const before = [...host.querySelectorAll('li')]
    expect(before).toHaveLength(3)

    const App = compileApp(
      `const App = () => <ul class="l"><For each={() => items} by={(i) => i.id}>{(it) => <li class="r">{() => it.n}</li>}</For></ul>`,
      { items },
    )
    const dispose = hydrateRoot(host, h(App as never, null))

    const after = new Set(host.querySelectorAll('li'))
    expect(before.filter((n) => after.has(n))).toHaveLength(3) // rows adopted
    expect(counts['runtime.tpl.adoptPlanReplay'] ?? 0).toBe(2)
    dispose()
  })

  it('component-root adoption does NOT use the plan fast path', async () => {
    // The scoping half: an arbitrary component root must always run the full
    // static-skeleton verify, which is what makes a wrong consumer harmless.
    const host = await ssrInto(h('div', { class: 'leaf' }, 'hello'))
    const App = compileApp(`const App = () => <div class="leaf">hello</div>`)
    const dispose = hydrateRoot(host, h(App as never, null))

    expect(tplAdopted()).toBe(1) // it DID adopt…
    expect(counts['runtime.tpl.adoptPlanReplay'] ?? 0).toBe(0) // …via full verify
    dispose()
  })

  it('does NOT adopt when a static ATTRIBUTE diverges from the server node', async () => {
    // Server says class="v1"; the client template says class="v2". Adopting
    // would silently keep the server's stale attribute, so this must clone.
    const host = await ssrInto(h('div', { class: 'v1' }, 'same'))
    const before = host.firstElementChild

    const App = compileApp(`const App = () => <div class="v2">same</div>`)
    const dispose = hydrateRoot(host, h(App as never, null))

    expect(tplAdopted()).toBe(0)
    expect(host.firstElementChild).not.toBe(before)
    expect(host.firstElementChild?.getAttribute('class')).toBe('v2')
    dispose()
  })

  it('does NOT adopt when static TEXT diverges from the server node', async () => {
    const host = await ssrInto(h('p', { class: 't' }, 'server text'))
    const before = host.firstElementChild

    const App = compileApp(`const App = () => <p class="t">client text</p>`)
    const dispose = hydrateRoot(host, h(App as never, null))

    expect(tplAdopted()).toBe(0)
    expect(host.firstElementChild).not.toBe(before)
    expect(host.textContent).toBe('client text')
    dispose()
  })
})
