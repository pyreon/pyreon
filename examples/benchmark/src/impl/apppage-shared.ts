/**
 * App-page hydration scenario — SHARED page definitions.
 *
 * One module defines each framework's settings page; BOTH the build-time
 * fixture generator (server render in bun) AND the browser hydration page
 * import from here, so SSR markup and client tree cannot drift.
 *
 * Every framework composes the SAME components (SectionHeader + FormRow) over
 * the SAME descriptor (`apppage-descriptor.ts`) and emits byte-identical
 * markup — asserted by the fixture generator, which diffs every framework's
 * HTML against Pyreon's after normalising each framework's own hydration
 * annotations (Vue's `<!--[-->` fragment markers, Pyreon's `<!--$-->` accessor
 * markers, etc.).
 *
 * React / Preact are written as their automatic JSX runtime's emit
 * (`jsx`/`jsxs`), Vue as build-time-compiled templates — each framework's own
 * toolchain output, the same standard the row-list bench uses. Pyreon's client half is REAL JSX compiled by
 * @pyreon/vite-plugin (src/impl/apppage-pyreon.tsx, generated); the Pyreon SSR
 * half below is its h() twin, which the runtime renders to the same markup.
 */
import { appPageRows, type AppPageRow } from './apppage-descriptor'

/**
 * The page descriptor, built ONCE at module load.
 *
 * Load-bearing for fairness: React / Preact / Vue map over this inside their
 * render, which runs inside the timed hydration region. Pyreon's page is
 * spelled-out JSX and never builds a descriptor at all, so calling
 * `appPageRows()` per render would charge three frameworks ~10µs of array
 * construction that the fourth does not pay. Hoisting it leaves only vnode
 * construction + hydration inside the timed region for everyone.
 */
const ROWS: readonly AppPageRow[] = appPageRows()

// ─── Pyreon (SSR twin — the client uses the compiled JSX) ────────────────────
import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'

export function pyreonAppPage(selected: () => string | null): VNode {
  const kids: unknown[] = [
    h(
      'div',
      { class: 'page-hd' },
      h('h1', { class: 'page-title' }, 'Settings'),
      h(
        'button',
        {
          type: 'button',
          class: () => (selected() === 'save' ? 'page-save active' : 'page-save'),
        },
        'Save',
      ),
    ),
  ]
  for (const d of ROWS) {
    kids.push(
      d.kind === 'header'
        ? h(
            'div',
            { class: 'sec-hd' },
            h('h2', { class: 'sec-title' }, d.label),
            h('span', { class: 'sec-hint' }, d.hint),
          )
        : h(
            'div',
            { class: 'row' },
            h('label', { class: 'row-label' }, d.label),
            h(
              'div',
              { class: 'row-ctl' },
              h('input', { class: 'row-input', type: 'text', name: d.name, value: d.value }),
              h('small', { class: 'row-hint' }, d.hint),
            ),
          ),
    )
  }
  return h('div', { class: 'page' }, ...(kids as never[]))
}

// ─── React ───────────────────────────────────────────────────────────────────
// React and Preact are written as the automatic JSX runtime's output — esbuild's
// `jsx: 'automatic'` emit for the idiomatic page, diffed rather than assumed:
//
//   const FormRow = (p) => <div className="row"><label className="row-label">{p.label}</label>
//     <div className="row-ctl"><input className="row-input" type="text" name={p.name}
//       defaultValue={p.value} /><small className="row-hint">{p.hint}</small></div></div>
//   <div className="page"><div className="page-hd">…<button …>Save</button></div>
//     {ROWS.map((d, i) => d.kind === 'header' ? <SectionHeader key={i} … /> : <FormRow key={i} … />)}</div>
//
// i.e. `jsxs` with ONE `children` array per multi-child element, keys as
// `jsx`'s third argument, and the mapped rows as a single nested array — not
// `createElement` varargs plus a hand-keyed flat array, which JSX never emits.
import type * as React from 'react'
import { jsx as rjsx, jsxs as rjsxs } from 'react/jsx-runtime'

const RSectionHeader = (p: { title: string; hint: string }) =>
  rjsxs('div', {
    className: 'sec-hd',
    children: [
      rjsx('h2', { className: 'sec-title', children: p.title }),
      rjsx('span', { className: 'sec-hint', children: p.hint }),
    ],
  })
const RFormRow = (p: { label: string; name: string; value: string; hint: string }) =>
  rjsxs('div', {
    className: 'row',
    children: [
      rjsx('label', { className: 'row-label', children: p.label }),
      rjsxs('div', {
        className: 'row-ctl',
        children: [
          rjsx('input', {
            className: 'row-input',
            type: 'text',
            name: p.name,
            defaultValue: p.value,
          }),
          rjsx('small', { className: 'row-hint', children: p.hint }),
        ],
      }),
    ],
  })

export function reactAppPage(
  selected: string | null,
  onSelect: (id: string) => void,
): React.ReactElement {
  return rjsxs('div', {
    className: 'page',
    children: [
      rjsxs('div', {
        className: 'page-hd',
        children: [
          rjsx('h1', { className: 'page-title', children: 'Settings' }),
          rjsx('button', {
            type: 'button',
            className: selected === 'save' ? 'page-save active' : 'page-save',
            onClick: () => onSelect('save'),
            children: 'Save',
          }),
        ],
      }),
      ROWS.map((d: AppPageRow, i: number) =>
        d.kind === 'header'
          ? rjsx(RSectionHeader, { title: d.label, hint: d.hint }, i)
          : rjsx(RFormRow, { label: d.label, name: d.name, value: d.value, hint: d.hint }, i),
      ),
    ],
  })
}

// ─── Preact ──────────────────────────────────────────────────────────────────
import type { ComponentChild } from 'preact'
import { jsx as pjsx, jsxs as pjsxs } from 'preact/jsx-runtime'
import { preactJsxKeyed } from './preact-jsx-keyed'

const PSectionHeader = (p: { title: string; hint: string }) =>
  pjsxs('div', {
    class: 'sec-hd',
    children: [
      pjsx('h2', { class: 'sec-title', children: p.title }),
      pjsx('span', { class: 'sec-hint', children: p.hint }),
    ],
  })
const PFormRow = (p: { label: string; name: string; value: string; hint: string }) =>
  pjsxs('div', {
    class: 'row',
    children: [
      pjsx('label', { class: 'row-label', children: p.label }),
      pjsxs('div', {
        class: 'row-ctl',
        children: [
          pjsx('input', { class: 'row-input', type: 'text', name: p.name, value: p.value }),
          pjsx('small', { class: 'row-hint', children: p.hint }),
        ],
      }),
    ],
  })

export function preactAppPage(
  selected: string | null,
  onSelect: (id: string) => void,
): ComponentChild {
  return pjsxs('div', {
    class: 'page',
    children: [
      pjsxs('div', {
        class: 'page-hd',
        children: [
          pjsx('h1', { class: 'page-title', children: 'Settings' }),
          pjsx('button', {
            type: 'button',
            class: selected === 'save' ? 'page-save active' : 'page-save',
            onClick: () => onSelect('save'),
            children: 'Save',
          }),
        ],
      }),
      ROWS.map((d: AppPageRow, i: number) =>
        d.kind === 'header'
          ? preactJsxKeyed(PSectionHeader, { title: d.label, hint: d.hint }, i)
          : preactJsxKeyed(
              PFormRow,
              { label: d.label, name: d.name, value: d.value, hint: d.hint },
              i,
            ),
      ),
    ],
  })
}

// ─── Vue ─────────────────────────────────────────────────────────────────────
// COMPILED templates — `APPPAGE_*_VUE_TEMPLATE` (`vue-templates.ts`), three
// SFC-style components. The render functions are INJECTED, exactly as in
// `hydration-shared.ts`'s `vueApp`, because the two sides compile the SAME
// template strings with the SAME `VUE_SFC_COMPILE_OPTIONS` through different
// doors:
//   - browser: build-time `virtual:apppage-*-vue-render` (vite.config.ts)
//   - fixture generator (bun, no vite): `@vue/compiler-dom` at script start
// The previous functional components + hand-written `h()` page carried no
// block tree or patch flags, so hydration re-patched every static prop; the
// compiled vnodes let Vue's hydrator skip them, as a real Vue app's do.
import { ref } from 'vue'
import type { Component, Ref } from 'vue'

export interface VueAppPageRenders {
  page: (...args: never[]) => unknown
  sectionHeader: (...args: never[]) => unknown
  formRow: (...args: never[]) => unknown
}

export function vueAppPage(renders: VueAppPageRenders): {
  component: Component
  selected: Ref<string | null>
} {
  const selected = ref<string | null>(null)
  const SectionHeader: Component = {
    props: { title: String, hint: String },
    render: renders.sectionHeader,
  }
  const FormRow: Component = {
    props: { label: String, name: String, value: String, hint: String },
    render: renders.formRow,
  }
  const component: Component = {
    components: { SectionHeader, FormRow },
    render: renders.page,
    setup() {
      // `ROWS` is returned as setup state, which is only SHALLOWLY unwrapped —
      // no row is proxied, the same no-reactivity-tax data the other arms get.
      return { rows: ROWS, selected }
    },
  }
  return { component, selected }
}
