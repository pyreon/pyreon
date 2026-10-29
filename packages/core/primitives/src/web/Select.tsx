// Web implementation of `<Select>` — a native `<select>`.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { SelectOption, SelectProps } from '../types/input'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Select>` — choose one value from a list.
 *
 * Compiles to:
 * - Web (this impl): `<select>` + one `<option>` per entry, behind a DISABLED
 *   `<option value="">` carrying the `placeholder` (blank without one), so it
 *   shows while nothing is selected and cannot be chosen again
 * - iOS (via PMTC): a menu-style `Picker` (`PyreonSelect` in the runtime)
 * - Android (via PMTC): a Material 3 `ExposedDropdownMenuBox` (`PyreonSelect`)
 *
 * `value` and `options` are read inside reactive thunks, never at setup — the
 * same reason `<Field>` does (see `Field.tsx`): a compiler-emitted reactive prop
 * is a getter, and reading it once captures the first value.
 */
export const Select = (props: SelectProps): VNode => {
  const read = <T,>(v: T | (() => T)): T => (typeof v === 'function' ? (v as () => T)() : v)
  const getValue = (): string => read(props.value)
  const getOptions = (): readonly SelectOption[] => read(props.options)

  const onChange = (e: Event) => {
    props.onChange((e.target as HTMLSelectElement).value)
  }

  const style: Record<string, string> = {
    padding: '8px 12px',
    'border-radius': '6px',
    'border-width': '1px',
    'border-style': 'solid',
    'border-color': '#d1d5db', // gray-300
    'font-size': '14px',
    'font-family': 'inherit',
    'line-height': '1.25',
    'background-color': 'transparent',
  }
  if (props.disabled) {
    style.opacity = '0.5'
    style.cursor = 'not-allowed'
  }

  // The selection is carried by each `<option>`'s `selected`, not by
  // `select.value`. A `value` binding re-applies only when the VALUE changes, so
  // options that arrive later (loaded asynchronously, or filtered) would come
  // up with the browser's first option selected while `value` still names
  // another. A per-option binding is right whichever of the two changes.
  const attrs: Record<string, unknown> = {
    ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
    style: mergePassthroughStyle(style, props.style),
    onChange,
  }
  if (props.disabled) attrs.disabled = true

  const placeholder = props.placeholder
  // One accessor child: the option list re-renders when `options` changes. A
  // keyed list never re-renders a SURVIVING key, so the key carries everything
  // the option renders — an option whose label changes is remounted rather
  // than frozen.
  const children = () => {
    const list = getOptions().map((o) => {
      const optionAttrs: Record<string, unknown> = {
        key: `${o.value}\u0001${o.label}\u0001${o.disabled === true ? 1 : 0}`,
        value: o.value,
        selected: () => getValue() === o.value,
      }
      if (o.disabled) optionAttrs.disabled = true
      return h('option', optionAttrs, o.label)
    })
    // The empty option is ALWAYS there, labelled with the placeholder or blank.
    // Without it a `<select>` whose value matches no option shows its FIRST
    // option — a selection the signal does not hold — where the native pickers
    // show nothing. Disabled, so it cannot be chosen once something is.
    const placeholderAttrs = {
      key: '\u0000placeholder',
      value: '',
      disabled: true,
      selected: () => !getOptions().some((o) => o.value === getValue()),
    }
    return [h('option', placeholderAttrs, placeholder ?? ''), ...list]
  }
  return h('select', attrs, children)
}
