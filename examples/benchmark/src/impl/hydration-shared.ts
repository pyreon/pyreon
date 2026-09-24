/**
 * Cross-framework hydration bench — SHARED page definitions.
 *
 * One module defines each framework's 1000-row table component; BOTH the
 * build-time fixture generator (server render in bun) AND the browser
 * hydration page import from here, so the SSR markup and the client tree
 * structurally cannot drift — the precondition for hydration to ADOPT nodes
 * instead of silently re-rendering (which would fake a fast number on some
 * frameworks and a mismatch warning on others).
 *
 * Page shape mirrors the fair-bench row: <table><tbody> of
 * <tr class={selected?'danger':''}><td>{id}</td><td><a onClick>{label}</a></td></tr>.
 * Pyreon is hand-written at its h() API; React/Preact as their automatic JSX
 * runtime's emit (`jsx`/`jsxs` — what their toolchains ship). Vue uses a REAL compiled template (see the Vue section)
 * because its compiled output carries patch flags a hand-written render
 * function does not, and SSR + client must agree on it.
 */

export interface FixtureRow {
  id: number
  label: string
}

export interface HydrationFixture {
  rows: FixtureRow[]
  /** Per-framework SSR HTML for the SAME `rows`, from the framework's OWN server renderer. */
  html: Record<string, string>
}

// ─── Pyreon ──────────────────────────────────────────────────────────────────
// h() + For — the same primitives the compiled JSX lowers to; the SSR side
// emits For key markers that hydrateRoot consumes.
import { For, h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'

export interface PyreonRowState {
  id: number
  label: ReturnType<typeof import('@pyreon/reactivity').signal<string>>
}

export function pyreonApp(
  rows: () => PyreonRowState[],
  isSelected: (id: number) => boolean,
  onSelect: (id: number) => void,
): VNode {
  return h(
    'table',
    null,
    h(
      'tbody',
      null,
      h(For, {
        each: () => rows(),
        by: (r: PyreonRowState) => r.id,
        children: (r: PyreonRowState) =>
          h(
            'tr',
            { class: () => (isSelected(r.id) ? 'danger' : '') },
            // raw number — runner.ts "Row-id rendering rule" (every arm now
            // hands its framework the number, as the compiled Vue template does)
            h('td', null, r.id),
            h('td', null, h('a', { onClick: () => onSelect(r.id) }, () => r.label())),
          ),
      }),
    ),
  )
}

// ─── React ───────────────────────────────────────────────────────────────────
// React and Preact are written as the automatic JSX runtime's output — esbuild's
// `jsx: 'automatic'` emit for the idiomatic source, diffed rather than assumed:
//
//   <table><tbody>{rows.map((row) =>
//     <tr key={row.id} className={selected === row.id ? 'danger' : ''}>
//       <td>{row.id}</td><td><a onClick={() => onSelect(row.id)}>{row.label}</a></td>
//     </tr>)}</tbody></table>
//
// (key as `jsx`'s third argument, `jsxs` + ONE `children` array for the `<tr>`,
// the raw `row.id` — not `createElement` varargs around `String(row.id)`.)
// Plain function calls, so the bun fixture generator still needs no transform.
import type * as React from 'react'
import { jsx as rjsx, jsxs as rjsxs } from 'react/jsx-runtime'

export function reactApp(
  rows: FixtureRow[],
  selected: number | null,
  onSelect: (id: number) => void,
): React.ReactElement {
  return rjsx('table', {
    children: rjsx('tbody', {
      children: rows.map((row) =>
        rjsxs(
          'tr',
          {
            className: selected === row.id ? 'danger' : '',
            children: [
              rjsx('td', { children: row.id }),
              rjsx('td', { children: rjsx('a', { onClick: () => onSelect(row.id), children: row.label }) }),
            ],
          },
          row.id,
        ),
      ),
    }),
  })
}

// ─── Preact ──────────────────────────────────────────────────────────────────
import type { VNode as PreactVNode } from 'preact'
import { jsx as pjsx, jsxs as pjsxs } from 'preact/jsx-runtime'
import { preactJsxKeyed } from './preact-jsx-keyed'

/** `jsxs` with the key slot re-typed exactly like `preactJsxKeyed` (see that module). */
const pjsxsKeyed = pjsxs as unknown as typeof preactJsxKeyed

export function preactApp(
  rows: FixtureRow[],
  selected: number | null,
  onSelect: (id: number) => void,
): PreactVNode {
  return pjsx('table', {
    children: pjsx('tbody', {
      children: rows.map((row) =>
        pjsxsKeyed(
          'tr',
          {
            class: selected === row.id ? 'danger' : '',
            children: [
              pjsx('td', { children: row.id }),
              pjsx('td', { children: pjsx('a', { onClick: () => onSelect(row.id), children: row.label }) }),
            ],
          },
          row.id,
        ),
      ),
    }),
  }) as PreactVNode
}

// ─── Vue ─────────────────────────────────────────────────────────────────────
// A COMPILED template — `HYDRATION_VUE_TEMPLATE` (`vue-templates.ts`), what a
// Vue SFC ships. The render function is INJECTED rather than imported, because
// the two sides compile the SAME template string with the SAME
// `VUE_SFC_COMPILE_OPTIONS` through different doors:
//   - browser: build-time `virtual:hydration-vue-render` (vite.config.ts)
//   - fixture generator (bun, no vite): `@vue/compiler-dom` at script start
// So SSR markup and client vnodes come from one template and cannot drift, and
// the client carries the compiled patch flags / blocks a real Vue app has.
// (The previous hand-written `h()` render function was described here as "what
// the template compiler emits" — it was not: it had no blocks or patch flags,
// and its v-for-equivalent array rendered without the `<!--[-->` fragment
// anchors the compiled `KEYED_FRAGMENT` produces.)
import { ref } from 'vue'
import type { Component, Ref } from 'vue'

export function vueApp(
  rows: FixtureRow[],
  render: (...args: never[]) => unknown,
): {
  component: Component
  selected: Ref<number | null>
} {
  const selected = ref<number | null>(null)
  const component: Component = {
    render,
    setup() {
      // `rows` is a plain array: setup state is only SHALLOWLY unwrapped, so
      // no row is proxied — the same no-reactivity-tax data the other arms get.
      return { rows, selected }
    },
  }
  return { component, selected }
}

// ─── Shared data ─────────────────────────────────────────────────────────────
/** Deterministic rows — the SAME data ships inside the fixture JSON so the
 * client builds its tree from fixture.rows verbatim (no RNG-sync risk). */
export function buildFixtureRows(n: number): FixtureRow[] {
  const A = ['pretty', 'large', 'big', 'small', 'tall', 'cheap', 'expensive', 'fancy']
  const C = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'orange']
  const N = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie']
  const rows: FixtureRow[] = []
  for (let i = 0; i < n; i++) {
    rows.push({
      id: i + 1,
      label: `${A[i % A.length]} ${C[(i * 7) % C.length]} ${N[(i * 13) % N.length]}`,
    })
  }
  return rows
}

export const HYDRATION_ROW_COUNT = 1000
