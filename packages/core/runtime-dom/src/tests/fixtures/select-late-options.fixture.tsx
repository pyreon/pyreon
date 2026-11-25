/**
 * Compiled by the REAL Pyreon transform (see `../compiled-fixtures-plugin.ts`)
 * for `select-value-late-options.browser.test.tsx` (#4820): a controlled
 * `<select value>` whose options arrive after mount.
 */
import { For } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'

/** The issue's component: options from a `<For>` over a list that loads later. */
export function ForPicker(props: { value: Signal<string>; options: Signal<string[]> }) {
  return (
    <select value={props.value()} onChange={(e) => props.value.set((e.target as HTMLSelectElement).value)}>
      <For each={props.options()} by={(o) => o}>
        {(o) => <option value={o}>{o}</option>}
      </For>
    </select>
  )
}

/** Options from an unkeyed `.map` inside a template `<select>`, grouped. */
export function MapPicker(props: { value: Signal<string>; options: Signal<string[]> }) {
  return (
    <div>
      <select value={props.value()}>
        <option value="none">none</option>
        <optgroup>{props.options().map((o) => <option value={o}>{o}</option>)}</optgroup>
      </select>
    </div>
  )
}
