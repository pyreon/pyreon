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
 * All frameworks are hand-written at their compiler's output level or their
 * documented no-compile API (createElement / h / render-fn) — same discipline
 * as `impl/solid.ts`'s template() note.
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
            h('td', null, String(r.id)),
            h('td', null, h('a', { onClick: () => onSelect(r.id) }, () => r.label())),
          ),
      }),
    ),
  )
}

// ─── React ───────────────────────────────────────────────────────────────────
// createElement — no JSX so the fixture generator needs no transform.
import * as React from 'react'

export function reactApp(
  rows: FixtureRow[],
  selected: number | null,
  onSelect: (id: number) => void,
): React.ReactElement {
  const r = React.createElement
  return r(
    'table',
    null,
    r(
      'tbody',
      null,
      rows.map((row) =>
        r(
          'tr',
          { key: row.id, className: selected === row.id ? 'danger' : '' },
          r('td', null, String(row.id)),
          r('td', null, r('a', { onClick: () => onSelect(row.id) }, row.label)),
        ),
      ),
    ),
  )
}

// ─── Preact ──────────────────────────────────────────────────────────────────
import { h as ph } from 'preact'
import type { VNode as PreactVNode } from 'preact'

export function preactApp(
  rows: FixtureRow[],
  selected: number | null,
  onSelect: (id: number) => void,
): PreactVNode {
  return ph(
    'table',
    null,
    ph(
      'tbody',
      null,
      rows.map((row) =>
        ph(
          'tr',
          { key: row.id, class: selected === row.id ? 'danger' : '' },
          ph('td', null, String(row.id)),
          ph('td', null, ph('a', { onClick: () => onSelect(row.id) }, row.label)),
        ),
      ),
    ),
  )
}

// ─── Vue ─────────────────────────────────────────────────────────────────────
// Render-function component (what the template compiler emits) — avoids
// runtime template compilation entirely, so hydrate timing measures the
// hydration walk, not a compile.
import { h as vh, ref } from 'vue'
import type { Component, Ref } from 'vue'

export function vueApp(rows: FixtureRow[]): {
  component: Component
  selected: Ref<number | null>
} {
  const selected = ref<number | null>(null)
  const component: Component = {
    setup() {
      return () =>
        vh('table', null, [
          vh(
            'tbody',
            null,
            rows.map((row) =>
              vh('tr', { key: row.id, class: selected.value === row.id ? 'danger' : '' }, [
                vh('td', null, String(row.id)),
                vh('td', null, [
                  vh('a', { onClick: () => (selected.value = row.id) }, row.label),
                ]),
              ]),
            ),
          ),
        ])
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
