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
 * React / Preact / Vue are written at their documented no-compile API
 * (createElement / h / render function) — the same discipline the row-list
 * bench uses. Pyreon's client half is REAL JSX compiled by
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
import * as React from 'react'

const RSectionHeader = (p: { title: string; hint: string }) =>
  React.createElement(
    'div',
    { className: 'sec-hd' },
    React.createElement('h2', { className: 'sec-title' }, p.title),
    React.createElement('span', { className: 'sec-hint' }, p.hint),
  )
const RFormRow = (p: { label: string; name: string; value: string; hint: string }) =>
  React.createElement(
    'div',
    { className: 'row' },
    React.createElement('label', { className: 'row-label' }, p.label),
    React.createElement(
      'div',
      { className: 'row-ctl' },
      React.createElement('input', {
        className: 'row-input',
        type: 'text',
        name: p.name,
        defaultValue: p.value,
      }),
      React.createElement('small', { className: 'row-hint' }, p.hint),
    ),
  )

export function reactAppPage(
  selected: string | null,
  onSelect: (id: string) => void,
): React.ReactElement {
  const r = React.createElement
  const kids: React.ReactNode[] = [
    r(
      'div',
      { key: 'hd', className: 'page-hd' },
      r('h1', { className: 'page-title' }, 'Settings'),
      r(
        'button',
        {
          type: 'button',
          className: selected === 'save' ? 'page-save active' : 'page-save',
          onClick: () => onSelect('save'),
        },
        'Save',
      ),
    ),
  ]
  ROWS.forEach((d: AppPageRow, i: number) => {
    kids.push(
      d.kind === 'header'
        ? r(RSectionHeader, { key: i, title: d.label, hint: d.hint })
        : r(RFormRow, { key: i, label: d.label, name: d.name, value: d.value, hint: d.hint }),
    )
  })
  return r('div', { className: 'page' }, kids)
}

// ─── Preact ──────────────────────────────────────────────────────────────────
import { h as ph } from 'preact'
import type { ComponentChild } from 'preact'

const PSectionHeader = (p: { title: string; hint: string }) =>
  ph(
    'div',
    { class: 'sec-hd' },
    ph('h2', { class: 'sec-title' }, p.title),
    ph('span', { class: 'sec-hint' }, p.hint),
  )
const PFormRow = (p: { label: string; name: string; value: string; hint: string }) =>
  ph(
    'div',
    { class: 'row' },
    ph('label', { class: 'row-label' }, p.label),
    ph(
      'div',
      { class: 'row-ctl' },
      ph('input', { class: 'row-input', type: 'text', name: p.name, value: p.value }),
      ph('small', { class: 'row-hint' }, p.hint),
    ),
  )

export function preactAppPage(
  selected: string | null,
  onSelect: (id: string) => void,
): ComponentChild {
  const kids: ComponentChild[] = [
    ph(
      'div',
      { key: 'hd', class: 'page-hd' },
      ph('h1', { class: 'page-title' }, 'Settings'),
      ph(
        'button',
        {
          type: 'button',
          class: selected === 'save' ? 'page-save active' : 'page-save',
          onClick: () => onSelect('save'),
        },
        'Save',
      ),
    ),
  ]
  ROWS.forEach((d: AppPageRow, i: number) => {
    kids.push(
      d.kind === 'header'
        ? ph(PSectionHeader, { key: i, title: d.label, hint: d.hint })
        : ph(PFormRow, { key: i, label: d.label, name: d.name, value: d.value, hint: d.hint }),
    )
  })
  return ph('div', { class: 'page' }, kids)
}

// ─── Vue ─────────────────────────────────────────────────────────────────────
import { h as vh, ref } from 'vue'
import type { Component, FunctionalComponent, Ref, VNodeChild } from 'vue'

// Functional components — Vue's documented no-compile component form, the
// render-function analogue of the React/Preact halves above.
const VSectionHeader: FunctionalComponent<{ title: string; hint: string }> = (p) =>
  vh('div', { class: 'sec-hd' }, [
    vh('h2', { class: 'sec-title' }, p.title),
    vh('span', { class: 'sec-hint' }, p.hint),
  ])
VSectionHeader.props = { title: String, hint: String }

const VFormRow: FunctionalComponent<{
  label: string
  name: string
  value: string
  hint: string
}> = (p) =>
  vh('div', { class: 'row' }, [
    vh('label', { class: 'row-label' }, p.label),
    vh('div', { class: 'row-ctl' }, [
      vh('input', { class: 'row-input', type: 'text', name: p.name, value: p.value }),
      vh('small', { class: 'row-hint' }, p.hint),
    ]),
  ])
VFormRow.props = { label: String, name: String, value: String, hint: String }

export function vueAppPage(): { component: Component; selected: Ref<string | null> } {
  const selected = ref<string | null>(null)
  const component: Component = {
    setup() {
      return () => {
        const kids: VNodeChild[] = [
          vh('div', { class: 'page-hd' }, [
            vh('h1', { class: 'page-title' }, 'Settings'),
            vh(
              'button',
              {
                type: 'button',
                class: selected.value === 'save' ? 'page-save active' : 'page-save',
                onClick: () => (selected.value = 'save'),
              },
              'Save',
            ),
          ]),
        ]
        ROWS.forEach((d: AppPageRow, i: number) => {
          kids.push(
            d.kind === 'header'
              ? vh(VSectionHeader, { key: i, title: d.label, hint: d.hint })
              : vh(VFormRow, {
                  key: i,
                  label: d.label,
                  name: d.name,
                  value: d.value,
                  hint: d.hint,
                }),
          )
        })
        return vh('div', { class: 'page' }, kids)
      }
    },
  }
  return { component, selected }
}
