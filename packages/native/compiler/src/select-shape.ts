/**
 * `<Select options>` — how the option list reaches the runtime's
 * `PyreonSelectOption` array, decided once for both emitters.
 *
 * Two shapes, and they are the two an app writes:
 * - an ARRAY LITERAL of `{ value, label, disabled? }` objects → one
 *   `PyreonSelectOption(…)` per element, each field emitted as written (a
 *   runtime expression is fine);
 * - any OTHER expression (a signal, a prop, a `const`, a computed) → that
 *   expression mapped element by element, reading `value`, `label` and — when
 *   the element type declares it — `disabled`.
 *
 * The element type matters because the mapped form names its fields: reading
 * `disabled` off a type that has none does not compile, and NOT reading it off
 * one that has it silently enables options the web disables. When the type is
 * not known the field is not read, and that is said by name.
 */

import type { ExprIR, StructIR, TypeIR } from './types'

export type SelectOptionField = 'value' | 'label' | 'disabled'

export type SelectOptions =
  | {
      kind: 'literal'
      items: Array<{ value: ExprIR; label: ExprIR; disabled?: ExprIR }>
    }
  /** `disabled`: whether the element type declares the field, and whether it is optional. */
  | { kind: 'mapped'; source: ExprIR; disabled: 'none' | 'required' | 'optional' }
  /** The elements already ARE the runtime's `SelectOption` (`@pyreon/primitives`' type). */
  | { kind: 'passthrough'; source: ExprIR }

export interface SelectShape {
  options: SelectOptions | null
  warnings: string[]
}

type Fields = readonly { name: string; type: TypeIR }[] | undefined

/**
 * @param resolveStruct the emitter's own struct table (the element type of a
 *   mapped source is usually a declared or synthesized struct).
 */
export function resolveSelectOptions(
  options: ExprIR | undefined,
  elementType: TypeIR | undefined,
  resolveStruct: (name: string) => StructIR | undefined,
): SelectShape {
  const warnings: string[] = []
  if (options === undefined) {
    warnings.push('<Select> needs `options` — a native picker with no choices renders empty.')
    return { options: { kind: 'literal', items: [] }, warnings }
  }
  const src = options.kind === 'arrow' && options.params.length === 0 ? options.body : options
  if (src.kind === 'array') {
    const items: Array<{ value: ExprIR; label: ExprIR; disabled?: ExprIR }> = []
    for (const el of src.elements) {
      if (el.kind !== 'object' || (el.spreads !== undefined && el.spreads.length > 0)) {
        warnings.push(
          '<Select options={[…]}>: every option must be an object literal `{ value, label, disabled? }` — this one is not, so it is DROPPED on iOS and Android. Build the list as literals, or pass it as a typed signal / prop.',
        )
        continue
      }
      const field = (n: string) => el.fields.find((f) => f.name === n)?.value
      const value = field('value')
      const label = field('label')
      if (value === undefined || label === undefined) {
        warnings.push('<Select options>: an option without both `value` and `label` is DROPPED on iOS and Android.')
        continue
      }
      for (const f of el.fields) {
        if (f.name !== 'value' && f.name !== 'label' && f.name !== 'disabled') {
          warnings.push(`<Select options>: the option field \`${f.name}\` is not read by the native pickers (only value, label and disabled are).`)
        }
      }
      const disabled = field('disabled')
      items.push(disabled !== undefined ? { value, label, disabled } : { value, label })
    }
    return { options: { kind: 'literal', items }, warnings }
  }

  let fields: Fields
  if (elementType?.kind === 'object') fields = elementType.fields
  else if (elementType?.kind === 'typeRef') {
    const struct = resolveStruct(elementType.name)
    if (struct?.external === true && struct.name === 'SelectOption') {
      return { options: { kind: 'passthrough', source: src }, warnings }
    }
    fields = struct?.fields
  }
  if (fields === undefined) {
    warnings.push(
      '<Select options>: the element type of `options` is not known to the compiler, so the native pickers read `value` and `label` only — a `disabled` flag would be IGNORED. Type the list (`signal<SelectOption[]>(…)`, a typed prop) or write it as a literal.',
    )
    return { options: { kind: 'mapped', source: src, disabled: 'none' }, warnings }
  }
  const has = (n: string) => fields!.some((f) => f.name === n)
  if (!has('value') || !has('label')) {
    warnings.push(
      '<Select options>: the elements of `options` have no `value` and `label` fields, which a native picker needs — the picker is EMPTY on iOS and Android.',
    )
    return { options: null, warnings }
  }
  const d = fields.find((f) => f.name === 'disabled')
  const optional =
    d !== undefined &&
    d.type.kind === 'union' &&
    d.type.branches.some((b) => b.kind === 'undefined' || b.kind === 'null')
  return {
    options: { kind: 'mapped', source: src, disabled: d === undefined ? 'none' : optional ? 'optional' : 'required' },
    warnings,
  }
}
