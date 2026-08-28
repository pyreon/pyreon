import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

/**
 * The fires-invariant: **every registered rule must be able to produce a
 * diagnostic.**
 *
 * This exists because a rule can ship completely inert and every other test
 * still passes. The anti-pattern catalog records the class directly — three
 * rules were silently broken at once by relying on `parent` in an oxc visitor
 * callback, which is always `undefined`, so the guard evaluated to a constant
 * and the rule never fired. Nothing failed. The rules were registered, listed
 * by `--list`, counted in the docs, and caught nothing.
 *
 * The registry invariants next door check identity (unique ids, one group per
 * rule, no duplicate reports). They cannot check FUNCTION: a rule that reports
 * nothing trivially satisfies every one of them.
 *
 * Two properties are asserted per rule, and the second is the load-bearing one:
 *
 *   1. the fixture DOES produce the rule's own diagnostic, and
 *   2. a deliberately-clean counterpart does NOT.
 *
 * Without (2) a fixture could pass by reporting unconditionally — which is
 * indistinguishable from working, and is the other half of "inert".
 *
 * The two cases share a file PATH and a project manifest, so path gating and
 * dependency gating resolve identically for both. The only variable is the
 * source, which is what makes a passing pair evidence that the rule
 * discriminates on the defect rather than on its surroundings.
 *
 * `FIXTURES` is asserted TOTAL over the registry, so a new rule fails here
 * until it proves it fires. That is deliberate: the repo's own catalog calls a
 * hand-maintained list checked in only one direction "a silent-hole generator".
 */

interface Fixture {
  /** Path RELATIVE to the temp project root — some rules gate on it. */
  readonly file: string
  /** Source that MUST produce this rule's diagnostic. */
  readonly bad: string
  /**
   * Source that must produce NO diagnostic from this rule. Proves the fixture
   * discriminates rather than the rule reporting unconditionally.
   */
  readonly good: string
  /** Rule options, for rules that stay silent until configured. */
  readonly options?: Record<string, unknown>
}

const SIG = `import { signal, computed, effect, batch, untrack } from '@pyreon/reactivity'\n`
const CORE = `import { onMount, useContext, cloneVNode } from '@pyreon/core'\n`

const FIXTURES: Record<string, Fixture> = {
  // ── reactivity ───────────────────────────────────────────────────────────
  'pyreon/no-async-effect': {
    file: 'src/a.tsx',
    bad: `${SIG}effect(async () => { await fetch('/x') })`,
    good: `${SIG}effect(() => { const v = 1; return v })`,
  },
  'pyreon/no-bare-signal-in-jsx': {
    file: 'src/a.tsx',
    bad: `${SIG}const count = signal(0)\nexport const A = () => <div>{count()}</div>`,
    good: `${SIG}const count = signal(0)\nexport const A = () => <div>{() => count()}</div>`,
  },
  'pyreon/no-context-destructure': {
    file: 'src/a.tsx',
    bad: `${CORE}const Ctx = {} as any\nexport function C() { const { mode } = useContext(Ctx); return <i>{mode}</i> }`,
    good: `${CORE}const Ctx = {} as any\nexport function C() { const ctx = useContext(Ctx); return <i>{ctx.mode}</i> }`,
  },
  'pyreon/no-signal-in-loop': {
    file: 'src/a.ts',
    bad: `${SIG}for (const x of [1, 2]) { const s = signal(x) }`,
    good: `${SIG}const s = signal(0)\nfor (const x of [1, 2]) { s.set(x) }`,
  },
  'pyreon/no-signal-in-props': {
    file: 'src/a.tsx',
    bad: `${SIG}const sig = signal(0)\nexport const A = () => <Comp value={sig()} />`,
    good: `${SIG}const sig = signal(0)\nexport const A = () => <Comp value={() => sig()} />`,
  },
  'pyreon/no-nested-effect': {
    file: 'src/a.ts',
    bad: `${SIG}effect(() => { effect(() => { console.log(1) }) })`,
    good: `${SIG}effect(() => { console.log(1) })\neffect(() => { console.log(2) })`,
  },
  'pyreon/no-peek-in-tracked': {
    file: 'src/a.ts',
    bad: `${SIG}const s = signal(0)\neffect(() => { console.log(s.peek()) })`,
    good: `${SIG}const s = signal(0)\neffect(() => { console.log(s()) })`,
  },
  'pyreon/no-unbatched-updates': {
    file: 'src/a.ts',
    bad: `${SIG}const a = signal(0), b = signal(0), c = signal(0)\nfunction go() { a.set(1); b.set(2); c.set(3) }`,
    good: `${SIG}const a = signal(0), b = signal(0), c = signal(0)\nfunction go() { batch(() => { a.set(1); b.set(2); c.set(3) }) }`,
  },
  'pyreon/prefer-computed': {
    file: 'src/a.ts',
    bad: `${SIG}const a = signal(1), total = signal(0)\neffect(() => { total.set(a() * 2) })`,
    good: `${SIG}const a = signal(1)\nconst total = computed(() => a() * 2)`,
  },
  'pyreon/no-effect-assignment': {
    file: 'src/a.ts',
    bad: `${SIG}const total = signal(0)\neffect(() => { total.update((n) => n + 1) })`,
    good: `${SIG}const total = signal(0)\nfunction bump() { total.update((n) => n + 1) }`,
  },
  'pyreon/no-signal-leak': {
    file: 'src/a.ts',
    bad: `${SIG}export function C() { const unused = signal(0); return 1 }`,
    good: `${SIG}export function C() { const used = signal(0); return used() }`,
  },
  'pyreon/no-signal-call-write': {
    file: 'src/a.ts',
    bad: `${SIG}const c = signal(0)\nc(5)`,
    good: `${SIG}const c = signal(0)\nc.set(5)`,
  },
  'pyreon/storage-signal-v-forwarding': {
    file: 'src/a.ts',
    bad: `${SIG}function make() {\n  const base = signal(0)\n  const w = (() => base()) as any\n  w.direct = base.direct\n  w.set = base.set\n  return w\n}`,
    good: `${SIG}function make() {\n  const base = signal(0)\n  const w = (() => base()) as any\n  w.direct = base.direct\n  w.set = base.set\n  Object.defineProperty(w, '_v', { get: () => (base as any)._v, configurable: true })\n  return w\n}`,
  },
  'pyreon/no-iterate-children-without-resolve': {
    file: 'src/a.tsx',
    bad: `${CORE}export function W(props: any) { return cloneVNode(props.children, {}) }`,
    good: `${CORE}export function W(props: any) {\n  const c = typeof props.children === 'function' ? props.children() : props.children\n  return cloneVNode(c, {})\n}`,
  },
  'pyreon/no-guard-only-signal-reads-in-effect': {
    file: 'src/a.ts',
    bad: `${SIG}const s = signal(0)\nlet ready = false\neffect(() => { if (!ready) return; console.log(s()) })`,
    good: `${SIG}const s = signal(0)\nlet ready = false\neffect(() => { const v = s(); if (!ready) return; console.log(v) })`,
  },

  // ── jsx ──────────────────────────────────────────────────────────────────
  'pyreon/no-map-in-jsx': {
    file: 'src/a.tsx',
    bad: `export const A = () => <ul>{items.map((i) => <li>{i}</li>)}</ul>`,
    good: `export const A = () => <ul><For each={items} by={(i) => i.id}>{(i) => <li />}</For></ul>`,
  },
  'pyreon/use-by-not-key': {
    file: 'src/a.tsx',
    bad: `export const A = () => <For each={items} key={(i) => i.id}>{(i) => <li />}</For>`,
    good: `export const A = () => <For each={items} by={(i) => i.id}>{(i) => <li />}</For>`,
  },
  'pyreon/no-classname': {
    file: 'src/a.tsx',
    bad: `export const A = () => <div className="x" />`,
    good: `export const A = () => <div class="x" />`,
  },
  'pyreon/no-htmlfor': {
    file: 'src/a.tsx',
    bad: `export const A = () => <label htmlFor="x" />`,
    good: `export const A = () => <label for="x" />`,
  },
  'pyreon/no-onchange': {
    file: 'src/a.tsx',
    bad: `export const A = () => <input onChange={(e) => go(e)} />`,
    good: `export const A = () => <input onInput={(e) => go(e)} />`,
  },
  'pyreon/no-ternary-conditional': {
    file: 'src/a.tsx',
    bad: `export const A = () => <div>{cond ? <b /> : <i />}</div>`,
    good: `export const A = () => <div><Show when={cond} fallback={<i />}><b /></Show></div>`,
  },
  'pyreon/no-and-conditional': {
    file: 'src/a.tsx',
    bad: `export const A = () => <div>{cond && <b />}</div>`,
    good: `export const A = () => <div><Show when={cond}><b /></Show></div>`,
  },
  'pyreon/no-line-comment-in-jsx': {
    file: 'src/a.tsx',
    bad: `export const A = () => (\n  <div>\n    // a note\n    <b />\n  </div>\n)`,
    good: `export const A = () => (\n  <div>\n    {/* a note */}\n    <b />\n  </div>\n)`,
  },
  'pyreon/no-index-as-by': {
    file: 'src/a.tsx',
    bad: `export const A = () => <For each={items} by={(_, i) => i}>{(r) => <li />}</For>`,
    good: `export const A = () => <For each={items} by={(r) => r.id}>{(r) => <li />}</For>`,
  },
  'pyreon/no-missing-for-by': {
    file: 'src/a.tsx',
    bad: `export const A = () => <For each={items}>{(r) => <li />}</For>`,
    good: `export const A = () => <For each={items} by={(r) => r.id}>{(r) => <li />}</For>`,
  },
  'pyreon/no-props-destructure': {
    file: 'src/a.tsx',
    bad: `export function C({ title }) { return <span>{title}</span> }`,
    good: `export function C(props) { return <span>{props.title}</span> }`,
  },
  'pyreon/no-children-access': {
    file: 'src/a.tsx',
    bad: `import { renderToString } from '@pyreon/runtime-server'\nexport function C(props: any) { const kids = props.children; return kids }`,
    good: `import { renderToString } from '@pyreon/runtime-server'\nexport function C(props: any) { return props.title }`,
  },

  // ── lifecycle ────────────────────────────────────────────────────────────
  'pyreon/no-missing-cleanup': {
    file: 'src/a.ts',
    bad: `${CORE}onMount(() => { setInterval(() => tick(), 100) })`,
    good: `${CORE}onMount(() => { const id = setInterval(() => tick(), 100); return () => clearInterval(id) })`,
  },
  'pyreon/no-mount-in-effect': {
    file: 'src/a.ts',
    bad: `${SIG}${CORE}effect(() => { onMount(() => {}) })`,
    good: `${SIG}${CORE}onMount(() => {})\neffect(() => { console.log(1) })`,
  },
  'pyreon/no-effect-in-mount': {
    file: 'src/a.ts',
    bad: `${SIG}${CORE}onMount(() => { effect(() => { console.log(1) }) })`,
    good: `${SIG}${CORE}effect(() => { console.log(1) })\nonMount(() => {})`,
  },
  'pyreon/no-dom-in-setup': {
    file: 'src/a.tsx',
    bad: `export function C() { const el = document.querySelector('#x'); return <div /> }`,
    good: `${CORE}export function C() { onMount(() => { document.querySelector('#x') }); return <div /> }`,
  },
  'pyreon/no-imperative-effect-on-create': {
    file: 'src/a.tsx',
    bad: `${SIG}export function C() { effect(() => { document.title = 'x' }); return <div /> }`,
    good: `${SIG}${CORE}export function C() { onMount(() => { document.title = 'x' }); return <div /> }`,
  },
  'pyreon/init-fn-needs-idempotency': {
    file: 'src/a.ts',
    bad: `${CORE}export function initThing() { onMount(() => { listen() }) }\nexport function C() { initThing(); return null }`,
    good: `${CORE}let started = false\nexport function initThing() { if (started) return; started = true; onMount(() => { listen() }) }\nexport function C() { initThing(); return null }`,
  },

  // ── performance ──────────────────────────────────────────────────────────
  'pyreon/no-effect-in-for': {
    file: 'src/a.tsx',
    bad: `${SIG}export const A = () => <For each={items} by={(r) => r.id}>{(r) => { effect(() => log(r)); return <li /> }}</For>`,
    good: `${SIG}export const A = () => <For each={items} by={(r) => r.id}>{(r) => <li />}</For>`,
  },
  'pyreon/no-eager-import': {
    file: 'src/a.tsx',
    bad: `import { Chart } from '@pyreon/charts'\nexport const A = () => <Chart />`,
    good: `export const A = () => <div />`,
  },
  'pyreon/no-heavy-import-only-in-handler': {
    file: 'src/a.tsx',
    bad: `import { renderChart } from '@pyreon/charts'\nexport const A = () => <button onClick={() => renderChart(el)} />`,
    good: `export const A = () => <button onClick={async () => { const { renderChart } = await import('@pyreon/charts'); renderChart(el) }} />`,
  },
  'pyreon/prefer-show-over-display': {
    file: 'src/a.tsx',
    bad: `export const A = () => <div style={{ display: open ? 'block' : 'none' }} />`,
    good: `export const A = () => <Show when={open}><div /></Show>`,
  },
  'pyreon/promise-race-needs-cleartimeout': {
    file: 'src/a.ts',
    bad: `async function go(work: Promise<unknown>) {\n  try {\n    return await Promise.race([work, new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 100))])\n  } catch (e) { throw e }\n}`,
    good: `async function go(work: Promise<unknown>) {\n  let t: any\n  try {\n    return await Promise.race([work, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('t')), 100) })])\n  } finally { clearTimeout(t) }\n}`,
  },

  // ── ssr ──────────────────────────────────────────────────────────────────
  'pyreon/no-window-in-ssr': {
    file: 'src/a.tsx',
    bad: `export function C() { const w = window.innerWidth; return <div>{w}</div> }`,
    good: `${CORE}export function C() { onMount(() => { console.log(window.innerWidth) }); return <div /> }`,
  },
  'pyreon/no-mismatch-risk': {
    file: 'src/a.tsx',
    bad: `export const A = () => <div>{Date.now()}</div>`,
    good: `export const A = () => <div>{stableId}</div>`,
  },
  'pyreon/prefer-request-context': {
    file: 'src/server/a.ts',
    bad: `${SIG}export const state = signal(0)`,
    good: `${SIG}export function make() { return signal(0) }`,
  },
  'pyreon/prefer-isserver': {
    file: 'src/a.ts',
    bad: `const browser = typeof window !== 'undefined'\nexport { browser }`,
    good: `import { isClient } from '@pyreon/reactivity'\nexport { isClient }`,
  },
  'pyreon/no-private-env-in-client': {
    file: 'src/a.ts',
    bad: `export const token = process.env.SECRET_TOKEN`,
    good: `import { publicEnv } from '@pyreon/zero'\nexport const token = publicEnv().PUBLIC_TOKEN`,
  },

  // ── architecture ─────────────────────────────────────────────────────────
  'pyreon/no-circular-import': {
    file: 'packages/core/reactivity/src/a.ts',
    bad: `import { h } from '@pyreon/core'\nexport const x = h`,
    good: `export const x = 1`,
  },
  'pyreon/no-deep-import': {
    file: 'src/a.ts',
    bad: `import { x } from '@pyreon/core/src/internal'\nexport { x }`,
    good: `import { h } from '@pyreon/core'\nexport { h }`,
  },
  'pyreon/island-import-from-client': {
    file: 'src/a.ts',
    bad: `import { island } from '@pyreon/server'\nexport const I = island(() => import('./x'), { name: 'i' })`,
    good: `import { island } from '@pyreon/server/client'\nexport const I = island(() => import('./x'), { name: 'i' })`,
  },
  'pyreon/no-cross-layer-import': {
    file: 'packages/core/runtime-dom/src/a.ts',
    bad: `import { styled } from '@pyreon/styler'\nexport { styled }`,
    good: `export const x = 1`,
  },
  'pyreon/dev-guard-warnings': {
    file: 'src/a.ts',
    bad: `export function warnIt() { console.warn('[Pyreon] something') }`,
    good: `export function warnIt() { if (process.env.NODE_ENV !== 'production') console.warn('[Pyreon] something') }`,
  },
  'pyreon/no-error-without-prefix': {
    file: 'src/err.ts',
    bad: `export function boom() { throw new Error('it broke') }`,
    good: `export function boom() { throw new Error('[Pyreon] it broke') }`,
  },
  'pyreon/no-module-signal-in-server-package': {
    file: 'packages/core/runtime-server/src/a.ts',
    bad: `${SIG}export const state = signal(0)`,
    good: `${SIG}export function make() { return signal(0) }`,
  },
  'pyreon/no-process-dev-gate': {
    file: 'src/a.ts',
    bad: `export const DEV = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`,
    good: `export const DEV = process.env.NODE_ENV !== 'production'`,
  },
  'pyreon/no-query-selector-cast-in-test': {
    file: 'src/x.test.ts',
    bad: `const a = root.querySelector('a') as HTMLAnchorElement\nexport { a }`,
    good: `import { query } from '@pyreon/test-utils'\nconst a = query(root, 'a')\nexport { a }`,
  },
  'pyreon/require-browser-smoke-test': {
    file: 'packages/core/runtime-dom/src/index.ts',
    bad: `export const mount = () => {}`,
    good: `export const mount = () => {}`, // asserted separately — see below
  },
  'pyreon/vitest-config-uses-shared': {
    file: 'pkg/vitest.config.ts',
    bad: `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { environment: 'happy-dom' } })`,
    good: `import { defineNodeConfig } from '@pyreon/vitest-config'\nexport default defineNodeConfig({ category: 'core', environment: 'happy-dom' })`,
  },

  // ── store ────────────────────────────────────────────────────────────────
  'pyreon/no-store-outside-provider': {
    file: 'src/server/a.ts',
    bad: `import { useStore } from '@pyreon/store'\nexport function C() { return useStore() }`,
    good: `import { useStore } from '@pyreon/store'\nimport { runWithRequestContext } from '@pyreon/server'\nexport function C() { return runWithRequestContext(() => useStore()) }`,
  },
  'pyreon/no-mutate-store-state': {
    file: 'src/a.ts',
    bad: `import { useCartStore } from '@pyreon/store'\nexport function C() { const cartStore = useCartStore(); cartStore.count.set(1); return cartStore }`,
    good: `import { useCartStore } from '@pyreon/store'\nexport function C() { const cartStore = useCartStore(); cartStore.increment(); return cartStore }`,
  },
  'pyreon/no-duplicate-store-id': {
    file: 'src/a.ts',
    bad: `import { defineStore } from '@pyreon/store'\nconst a = defineStore('cart', () => ({}))\nconst b = defineStore('cart', () => ({}))`,
    good: `import { defineStore } from '@pyreon/store'\nconst a = defineStore('cart', () => ({}))\nconst b = defineStore('user', () => ({}))`,
  },

  // ── form ─────────────────────────────────────────────────────────────────
  'pyreon/no-unregistered-field': {
    file: 'src/a.tsx',
    bad: `import { useField } from '@pyreon/form'\nexport function C() { const f = useField('name'); return <input /> }`,
    good: `import { useField } from '@pyreon/form'\nexport function C() { const f = useField('name'); return <input {...f.register()} /> }`,
  },
  'pyreon/no-submit-without-validation': {
    file: 'src/a.tsx',
    bad: `import { useForm } from '@pyreon/form'\nexport function C() { const f = useForm({ onSubmit: (v) => send(v) }); return <form /> }`,
    good: `import { useForm } from '@pyreon/form'\nexport function C() { const f = useForm({ schema, onSubmit: (v) => send(v) }); return <form /> }`,
  },
  'pyreon/prefer-field-array': {
    file: 'src/a.ts',
    bad: `import { useForm } from '@pyreon/form'\nimport { signal } from '@pyreon/reactivity'\nexport const rows = signal([])`,
    good: `import { useForm, useFieldArray } from '@pyreon/form'\nexport const rows = useFieldArray('rows')`,
  },
  'pyreon/no-signal-in-form-initial-values': {
    file: 'src/a.ts',
    bad: `import { useForm } from '@pyreon/form'\nimport { signal } from '@pyreon/reactivity'\nconst user = signal('a')\nexport const f = useForm({ initialValues: { name: user() } })`,
    good: `import { useForm } from '@pyreon/form'\nexport const f = useForm({ initialValues: { name: '' } })`,
  },

  // ── styling ──────────────────────────────────────────────────────────────
  'pyreon/no-inline-style-object': {
    file: 'src/a.tsx',
    bad: `export const A = () => <div style={{ color: 'red', padding: 4 }} />`,
    good: `export const A = () => <div class="boxed" />`,
  },
  'pyreon/no-dynamic-styled': {
    file: 'src/a.tsx',
    bad: `import { styled } from '@pyreon/styler'\nexport function C() { const S = styled('div')\`color: red\`; return <S /> }`,
    good: `import { styled } from '@pyreon/styler'\nconst S = styled('div')\`color: red\`\nexport function C() { return <S /> }`,
  },
  'pyreon/prefer-cx': {
    file: 'src/a.tsx',
    bad: `export const A = () => <div class={'base ' + (on ? 'on' : '')} />`,
    good: `import { cx } from '@pyreon/core'\nexport const A = () => <div class={cx(['base', on && 'on'])} />`,
  },
  'pyreon/no-theme-outside-provider': {
    file: 'src/a.tsx',
    bad: `import { useTheme } from '@pyreon/ui-core'\nexport function C() { const t = useTheme(); return <div /> }`,
    good: `import { useTheme, PyreonUI } from '@pyreon/ui-core'\nexport function C() { const t = useTheme(); return <div /> }`,
  },
  'pyreon/no-signal-read-in-attrs-callback': {
    file: 'src/a.ts',
    bad: `${SIG}import { rocketstyle } from '@pyreon/rocketstyle'\nconst on = signal(false)\nexport const B = rocketstyle()().attrs(() => ({ 'aria-pressed': on() }))`,
    good: `${SIG}import { rocketstyle } from '@pyreon/rocketstyle'\nconst on = signal(false)\nexport const B = rocketstyle()().attrs(() => ({ 'aria-pressed': () => on() }))`,
  },

  // ── hooks ────────────────────────────────────────────────────────────────
  'pyreon/no-raw-addeventlistener': {
    file: 'src/a.ts',
    bad: `export function C() { window.addEventListener('resize', onR) }`,
    good: `import { useEventListener } from '@pyreon/hooks'\nexport function C() { useEventListener(window, 'resize', onR) }`,
  },
  'pyreon/no-raw-setinterval': {
    file: 'src/a.ts',
    bad: `export function C() { setInterval(() => tick(), 100) }`,
    good: `${CORE}export function C() { onMount(() => { const id = setInterval(() => tick(), 100); return () => clearInterval(id) }) }`,
  },
  'pyreon/no-raw-localstorage': {
    file: 'src/a.ts',
    bad: `export function C() { return localStorage.getItem('k') }`,
    good: `import { useStorage } from '@pyreon/storage'\nexport function C() { return useStorage('k') }`,
  },

  // ── accessibility ────────────────────────────────────────────────────────
  'pyreon/toast-a11y': {
    file: 'src/a.tsx',
    bad: `export const A = () => <MyToast />`,
    good: `export const A = () => <MyToast role="status" aria-live="polite" />`,
  },
  'pyreon/dialog-a11y': {
    file: 'src/a.tsx',
    bad: `export const D = () => <dialog open><p>hi</p></dialog>`,
    good: `export const D = () => <dialog open aria-label="Settings"><p>hi</p></dialog>`,
  },
  'pyreon/overlay-a11y': {
    file: 'src/a.tsx',
    bad: `import { Overlay } from '@pyreon/elements'\nexport const O = () => <Overlay><div /></Overlay>`,
    good: `import { Overlay } from '@pyreon/elements'\nexport const O = () => <Overlay type="dialog"><div /></Overlay>`,
  },

  // ── router ───────────────────────────────────────────────────────────────
  'pyreon/no-href-navigation': {
    file: 'src/a.tsx',
    bad: `import { useRouter } from '@pyreon/router'\nexport const A = () => <a href="/about">About</a>`,
    good: `import { RouterLink } from '@pyreon/router'\nexport const A = () => <RouterLink to="/about">About</RouterLink>`,
  },
  'pyreon/no-imperative-navigate-in-render': {
    file: 'src/a.tsx',
    bad: `import { useNavigate } from '@pyreon/router'\nexport function C() { const navigate = useNavigate(); navigate('/x'); return <div /> }`,
    good: `import { useNavigate } from '@pyreon/router'\nexport function C() { const navigate = useNavigate(); return <button onClick={() => navigate('/x')} /> }`,
  },
  'pyreon/no-missing-fallback': {
    file: 'src/a.ts',
    bad: `import { createRouter } from '@pyreon/router'\nexport const r = createRouter({ routes: [{ path: '/', component: Home }] })`,
    good: `import { createRouter } from '@pyreon/router'\nexport const r = createRouter({ routes: [{ path: '/', component: Home }, { path: '*', component: NotFound }] })`,
  },
  'pyreon/prefer-use-is-active': {
    file: 'src/a.ts',
    bad: `import { useRouter } from '@pyreon/router'\nexport const active = location.pathname === '/foo'`,
    good: `import { useIsActive } from '@pyreon/router'\nexport function C() { return useIsActive('/foo') }`,
  },
  'pyreon/prefer-typed-search-params': {
    file: 'src/a.ts',
    bad: `import { useRouter } from '@pyreon/router'\nexport function C() { return new URLSearchParams(location.search).get('page') }`,
    good: `import { useTypedSearchParams } from '@pyreon/router'\nexport function C() { return useTypedSearchParams({ page: 'number' }) }`,
  },

  // ── security ─────────────────────────────────────────────────────────────
  'pyreon/no-target-blank-without-rel': {
    file: 'src/a.tsx',
    bad: `export const A = () => <a href="/x" target="_blank">go</a>`,
    good: `export const A = () => <a href="/x" target="_blank" rel="noopener noreferrer">go</a>`,
  },
  'pyreon/no-unsanitized-inner-html': {
    file: 'src/a.tsx',
    bad: `export const A = () => <div dangerouslySetInnerHTML={{ __html: userBio }} />`,
    good: `export const A = () => <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userBio) }} />`,
  },
  'pyreon/no-script-url': {
    file: 'src/a.tsx',
    bad: `export const A = () => <a href="javascript:alert(1)">x</a>`,
    good: `export const A = () => <button onClick={() => alert(1)}>x</button>`,
  },

  // ── ssg ──────────────────────────────────────────────────────────────────
  'pyreon/invalid-loader-export': {
    file: 'src/routes/a.tsx',
    bad: `export const loader = { data: 1 }\nexport default function P() { return <div /> }`,
    good: `export const loader = () => ({ data: 1 })\nexport default function P() { return <div /> }`,
  },
  'pyreon/missing-get-static-paths': {
    file: 'src/routes/[id].tsx',
    bad: `export default function P() { return <div /> }`,
    good: `export const getStaticPaths = () => [{ params: { id: '1' } }]\nexport default function P() { return <div /> }`,
  },
  'pyreon/revalidate-not-pure-literal': {
    file: 'src/routes/a.tsx',
    bad: `const TTL = 60\nexport const revalidate = TTL\nexport default function P() { return <div /> }`,
    good: `export const revalidate = 60\nexport default function P() { return <div /> }`,
  },

  // ── frontend ─────────────────────────────────────────────────────────────
  'pyreon/require-img-alt': {
    file: 'src/a.tsx',
    bad: `export const A = () => <img src="/a.png" width="10" height="10" />`,
    good: `export const A = () => <img src="/a.png" alt="" width="10" height="10" />`,
  },
  'pyreon/img-requires-dimensions': {
    file: 'src/a.tsx',
    bad: `export const A = () => <img src="/a.png" alt="" />`,
    good: `export const A = () => <img src="/a.png" alt="" width="10" height="10" />`,
  },
  'pyreon/content-visibility-needs-intrinsic-size': {
    file: 'src/a.tsx',
    bad: `export const A = () => <div style={{ contentVisibility: 'auto' }} />`,
    good: `export const A = () => <div style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 400px' }} />`,
  },
  'pyreon/no-positive-tabindex': {
    file: 'src/a.tsx',
    bad: `export const A = () => <div tabIndex={3} />`,
    good: `export const A = () => <div tabIndex={0} />`,
  },
  'pyreon/prefer-zero-image': {
    file: 'src/a.tsx',
    bad: `export const A = () => <img src="/a.png" alt="" width="10" height="10" />`,
    good: `import { Image } from '@pyreon/zero'\nexport const A = () => <Image src="/a.png" alt="" width={10} height={10} />`,
  },
  'pyreon/no-discarded-optimize-fields': {
    file: 'src/a.tsx',
    bad: `import hero from './hero.png?optimize'\nexport const A = () => <img src={hero.src} alt="" />`,
    good: `import hero from './hero.png?optimize'\nimport { Image } from '@pyreon/zero'\nexport const A = () => <Image {...hero} alt="" />`,
  },
  'pyreon/no-autofocus': {
    file: 'src/a.tsx',
    bad: `export const A = () => <input autoFocus />`,
    good: `export const A = () => <input />`,
  },
  'pyreon/no-redundant-role': {
    file: 'src/a.tsx',
    bad: `export const A = () => <button role="button" />`,
    good: `export const A = () => <button />`,
  },
  'pyreon/anchor-is-valid': {
    file: 'src/a.tsx',
    bad: `export const A = () => <a href="#">x</a>`,
    good: `export const A = () => <a href="/about">x</a>`,
  },
  'pyreon/heading-order': {
    file: 'src/a.tsx',
    bad: `export const A = () => <section><h1>a</h1><h3>b</h3></section>`,
    good: `export const A = () => <section><h1>a</h1><h2>b</h2></section>`,
  },
  'pyreon/color-contrast': {
    file: 'src/a.tsx',
    bad: `export const A = () => <div style={{ color: '#aaaaaa', background: '#bbbbbb' }} />`,
    good: `export const A = () => <div style={{ color: '#111111', background: '#ffffff' }} />`,
  },
  'pyreon/primitive-media-needs-label': {
    file: 'src/a.tsx',
    bad: `import { Image } from '@pyreon/primitives'\nexport const A = () => <Image src="/a.png" />`,
    good: `import { Image } from '@pyreon/primitives'\nexport const A = () => <Image src="/a.png" accessibilityLabel="A cat" />`,
  },

  // ── isomorphic / backend / web-perf / portable / js ──────────────────────
  'pyreon/no-locale-dependent-format': {
    file: 'src/a.ts',
    bad: `export const price = (n: number) => n.toLocaleString()`,
    good: `export const price = (n: number) => n.toLocaleString('en-US')`,
  },
  'pyreon/no-timezone-dependent-date': {
    file: 'src/a.ts',
    bad: `export const hour = () => new Date().getHours()`,
    good: `export const hour = () => new Date().getUTCHours()`,
  },
  'pyreon/no-unstable-render-id': {
    file: 'src/a.tsx',
    bad: `export const A = () => <label htmlFor={'f' + Math.random()}>x</label>`,
    good: `import { createUniqueId } from '@pyreon/core'\nconst id = createUniqueId()\nexport const A = () => <label htmlFor={id}>x</label>`,
  },
  'pyreon/no-node-builtin-in-component': {
    file: 'src/a.tsx',
    bad: `import { readFile } from 'node:fs/promises'\nexport const A = () => <div>{readFile}</div>`,
    good: `export const A = () => <div>ok</div>`,
  },
  'pyreon/no-sync-fs-in-request-path': {
    file: 'src/server/handler.ts',
    bad: `import { readFileSync } from 'node:fs'\nexport function handler() { return readFileSync('/etc/x') }`,
    good: `import { readFile } from 'node:fs/promises'\nexport async function handler() { return await readFile('/etc/x') }`,
  },
  'pyreon/no-floating-promise-in-handler': {
    file: 'src/server/handler.ts',
    bad: `export function handler() { sendReceipt(user) }`,
    good: `export async function handler() { await sendReceipt(user) }`,
  },
  'pyreon/prefer-passive-listener': {
    file: 'src/a.ts',
    bad: `export function bind(el: any) { el.addEventListener('scroll', onScroll) }`,
    good: `export function bind(el: any) { el.addEventListener('scroll', onScroll, { passive: true }) }`,
  },
  'pyreon/no-unbounded-raf-loop': {
    file: 'src/a.ts',
    bad: `export function start() { requestAnimationFrame(function step() { tick(); requestAnimationFrame(step) }) }`,
    good: `export function start() { let id = 0\n  const step = () => { tick(); id = requestAnimationFrame(step) }\n  id = requestAnimationFrame(step)\n  return () => cancelAnimationFrame(id) }`,
  },
  'pyreon/no-out-of-subset-construct': {
    file: 'src/a.ts',
    options: { portablePaths: ['src/'] },
    bad: `export enum Mode { On, Off }`,
    good: `export type Mode = 'on' | 'off'`,
  },
  'pyreon/no-platform-branch-without-fallback': {
    file: 'src/a.tsx',
    bad: `export const A = () => <Web><div /></Web>`,
    good: `export const A = () => (<><Web><div /></Web><NativeIOS><div /></NativeIOS><NativeAndroid><div /></NativeAndroid></>)`,
  },
  'pyreon/require-error-cause': {
    file: 'src/a.ts',
    bad: `export function load() { try { parse() } catch (e) { throw new Error('bad config') } }`,
    good: `export function load() { try { parse() } catch (e) { throw new Error('bad config', { cause: e }) } }`,
  },

  // ── query / http / rx / i18n / storage ───────────────────────────────────
  'pyreon/query-options-as-function': {
    file: 'src/a.ts',
    bad: `import { useQuery } from '@pyreon/query'\nexport const q = useQuery({ queryKey: ['a'], queryFn: fetchA })`,
    good: `import { useQuery } from '@pyreon/query'\nexport const q = useQuery(() => ({ queryKey: ['a'], queryFn: fetchA }))`,
  },
  'pyreon/query-fn-must-forward-signal': {
    file: 'src/a.ts',
    bad: `import { useQuery } from '@pyreon/query'\nexport const q = useQuery(() => ({ queryKey: ['a'], queryFn: () => fetch('/a') }))`,
    good: `import { useQuery } from '@pyreon/query'\nexport const q = useQuery(() => ({ queryKey: ['a'], queryFn: ({ signal }) => fetch('/a', { signal }) }))`,
  },
  'pyreon/no-unencoded-path-interpolation': {
    file: 'src/a.ts',
    bad: `import { http } from '@pyreon/http'\nexport const go = (id: string) => http.get(\`/users/\${id}\`)`,
    good: `import { http } from '@pyreon/http'\nexport const go = (id: string) => http.get('/users/:id', { params: { id } })`,
  },
  'pyreon/no-untimed-raw-fetch': {
    file: 'src/a.ts',
    bad: `export const go = () => fetch('/a')`,
    good: `export const go = (signal: AbortSignal) => fetch('/a', { signal })`,
  },
  'pyreon/rx-prefer-pipe': {
    file: 'src/a.ts',
    bad: `import { map, filter } from '@pyreon/rx'\nexport const out = map(filter(src, (x) => x > 1), (x) => x * 2)`,
    good: `import { pipe, map, filter } from '@pyreon/rx'\nexport const out = pipe(src, filter((x) => x > 1), map((x) => x * 2))`,
  },
  'pyreon/i18n-prefer-trans-for-rich-jsx': {
    file: 'src/a.tsx',
    bad: `import { useI18n } from '@pyreon/i18n'\nexport const A = () => { const { t } = useI18n(); return <p>{t('cta')} <a href="/x">link</a></p> }`,
    good: `import { Trans } from '@pyreon/i18n'\nexport const A = () => <Trans i18nKey="cta" components={{ a: <a href="/x" /> }} />`,
  },
  'pyreon/no-storage-write-as-call': {
    file: 'src/a.ts',
    bad: `import { useStorage } from '@pyreon/storage'\nconst theme = useStorage('theme', 'light')\ntheme('dark')`,
    good: `import { useStorage } from '@pyreon/storage'\nconst theme = useStorage('theme', 'light')\ntheme.set('dark')`,
  },
}

/** Every `@pyreon/*` package a dependency-gated rule might look for. */
const DEPS = [
  '@pyreon/core', '@pyreon/reactivity', '@pyreon/store', '@pyreon/form',
  '@pyreon/styler', '@pyreon/ui-core', '@pyreon/rocketstyle', '@pyreon/hooks',
  '@pyreon/router', '@pyreon/query', '@pyreon/rx', '@pyreon/i18n',
  '@pyreon/storage', '@pyreon/http', '@pyreon/zero', '@pyreon/elements',
  '@pyreon/primitives', '@pyreon/server', '@pyreon/test-utils', '@pyreon/charts',
  '@pyreon/vitest-config', '@pyreon/runtime-server',
]

let root = ''

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-fires-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@pyreon/fixture-project',
      dependencies: Object.fromEntries(DEPS.map((d) => [d, '*'])),
    }),
  )
})

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

/** Lint one source with ONLY `ruleId` enabled, so a neighbour cannot stand in. */
function lintOnly(ruleId: string, fx: Fixture, which: 'bad' | 'good') {
  const abs = join(root, fx.file)
  mkdirSync(dirname(abs), { recursive: true })
  const source = fx[which]
  writeFileSync(abs, source)
  const config: LintConfig = {
    rules: { [ruleId]: fx.options ? ['error', fx.options] : 'error' },
  }
  return lintFile(abs, source, allRules, config).diagnostics.filter(
    (d) => d.ruleId === ruleId,
  )
}

describe('every rule can fire', () => {
  it('FIXTURES is total over the registry', () => {
    const registered = allRules.map((r) => r.meta.id).sort()
    const covered = Object.keys(FIXTURES).sort()
    // Named explicitly so a new rule reads as "add a fixture", not "count moved".
    expect(covered.filter((id) => !registered.includes(id))).toEqual([])
    expect(registered.filter((id) => !covered.includes(id))).toEqual([])
  })

  for (const rule of allRules) {
    const id = rule.meta.id
    const fx = FIXTURES[id]
    if (!fx) continue

    // `require-browser-smoke-test` inspects the package DIRECTORY, not the
    // source text — it needs a real tree, so it is proven in its own suite
    // (`require-browser-smoke-test` specs) rather than by a source fixture.
    if (id === 'pyreon/require-browser-smoke-test') continue

    it(`${id} — fires on its defect`, () => {
      expect(lintOnly(id, fx, 'bad').length).toBeGreaterThan(0)
    })

    it(`${id} — stays quiet on the corrected form`, () => {
      expect(lintOnly(id, fx, 'good')).toEqual([])
    })
  }
})
