/**
 * `<Field kind="date" | "time" | "datetime" min max>` — the decision both
 * emitters lower from, so the two cannot disagree about which fields are
 * pickers or what their bounds are.
 *
 * The web contract (`@pyreon/primitives` web/Field.tsx) is the oracle: the
 * value is the wall-clock string an `<input type="date" | "time" |
 * "datetime-local">` produces — `YYYY-MM-DD`, `HH:mm`, `YYYY-MM-DDTHH:mm`, no
 * time zone — and `min` / `max` are strings in the same format.
 *
 * - `kind` selects a different control on every target, so a date kind only
 *   lowers when it is static (a dynamic one is already a named warning in the
 *   text-field path).
 * - A static `min` / `max` that is not in the kind's format would be IGNORED by
 *   a browser; natively it would be a picker bounded by nonsense, so it is
 *   dropped with a named warning instead.
 * - A picker has no keyboard submit, so `onSubmit` (forbidden by the types) is
 *   named and not wired.
 */

import type { AttrIR, ExprIR } from './types'

export type DateFieldKind = 'date' | 'time' | 'datetime'

export type DateBound = { kind: 'static'; value: string } | { kind: 'dynamic'; expr: ExprIR }

export interface DateFieldShape {
  kind: DateFieldKind
  min: DateBound | undefined
  max: DateBound | undefined
  /** `false` when an `onSubmit` must be dropped. */
  honourSubmit: boolean
  warnings: string[]
}

const FORMATS: Readonly<Record<DateFieldKind, { re: RegExp; example: string }>> = {
  date: { re: /^\d{4}-\d{2}-\d{2}$/, example: '"2026-10-22"' },
  time: { re: /^\d{2}:\d{2}$/, example: '"09:30"' },
  datetime: { re: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, example: '"2026-10-22T09:30"' },
}

export const DATE_FIELD_KINDS: ReadonlySet<string> = new Set(['date', 'time', 'datetime'])

type JsxElement = Extract<ExprIR, { kind: 'jsx-element' }>
type ReadStatic = (e: JsxElement, name: string) => string | number | boolean | undefined

/** Is the value a real calendar date / clock time, not just the right shape? */
function isValid(kind: DateFieldKind, v: string): boolean {
  const [d, t] = kind === 'time' ? [undefined, v] : kind === 'date' ? [v, undefined] : v.split('T')
  if (d !== undefined) {
    const [y, m, day] = d.split('-').map(Number) as [number, number, number]
    const probe = new Date(Date.UTC(y, m - 1, day))
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== day) return false
  }
  if (t !== undefined) {
    const [h, min] = t.split(':').map(Number) as [number, number]
    if (h > 23 || min > 59) return false
  }
  return true
}

/** `undefined` when the element is not a static date-kind Field. */
export function resolveDateFieldShape(e: JsxElement, readStatic: ReadStatic): DateFieldShape | undefined {
  const kind = readStatic(e, 'kind')
  if (typeof kind !== 'string' || !DATE_FIELD_KINDS.has(kind)) return undefined
  // `multiline` wins over a date kind, as on the web (`<textarea>` is chosen
  // first, and a text area has no picker). The types reject the combination;
  // the text-area path names the ignored `kind` for an untyped caller.
  if (readStatic(e, 'multiline') === true) return undefined
  const k = kind as DateFieldKind
  const warnings: string[] = []
  if (e.attrs.some((a) => a.kind === 'attr' && a.name === 'lines')) {
    warnings.push(
      `<Field kind="${k}" lines>: \`lines\` only applies to a \`multiline\` text field — it is IGNORED on a picker, as on the web.`,
    )
  }

  const bound = (name: 'min' | 'max'): DateBound | undefined => {
    const attr = e.attrs.find(
      (a): a is Extract<AttrIR, { kind: 'attr' }> => a.kind === 'attr' && a.name === name,
    )
    if (attr === undefined) return undefined
    const stat = readStatic(e, name)
    if (stat !== undefined) {
      if (typeof stat === 'string' && FORMATS[k].re.test(stat) && isValid(k, stat)) {
        return { kind: 'static', value: stat }
      }
      warnings.push(
        `<Field kind="${k}" ${name}=${JSON.stringify(stat)}>: \`${name}\` must be a ${k} in the value format (${FORMATS[k].example}) — a browser ignores any other, so it is DROPPED on iOS and Android too.`,
      )
      return undefined
    }
    const v = attr.value
    return { kind: 'dynamic', expr: v.kind === 'arrow' && v.params.length === 0 ? v.body : v }
  }

  const min = bound('min')
  const max = bound('max')
  if (
    min?.kind === 'static' &&
    max?.kind === 'static' &&
    min.value > max.value
  ) {
    warnings.push(
      `<Field kind="${k}" min="${min.value}" max="${max.value}">: \`min\` is after \`max\`, so nothing can be picked. Both bounds are kept, as on the web, but this is almost certainly a mistake.`,
    )
  }

  let honourSubmit = true
  if (e.attrs.some((a) => a.kind === 'event' && a.name === 'submit')) {
    honourSubmit = false
    warnings.push(
      `<Field kind="${k}" onSubmit>: a date / time picker has no keyboard submit, so \`onSubmit\` is IGNORED on iOS and Android. React to the value with \`onChangeText\`, or submit from a \`<Button>\`.`,
    )
  }
  return { kind: k, min, max, honourSubmit, warnings }
}
