/**
 * `<Field multiline lines>` — the shape decision BOTH emitters lower from.
 *
 * Resolved once, here, rather than in each emitter, because every decision in
 * it is a parity decision: whether the field is a text area, how many rows it
 * shows, and which of the single-line props a text area drops. Two copies of
 * that logic is how one target starts honouring `onSubmit` on a text area while
 * the other ignores it.
 *
 * The web contract (`@pyreon/primitives` `web/Field.tsx`) is the oracle:
 * - `multiline` is STRUCTURAL — `<textarea>` vs `<input>`, and on iOS a
 *   different `TextField` initializer — so only a static value lowers.
 * - `lines` is the VISIBLE row count; the field is that tall and scrolls past
 *   it. Default `FIELD_DEFAULT_LINES`. A static value below 1 or non-integer
 *   falls back to the default on the web (`rows` would otherwise be invalid),
 *   and a dynamic value is clamped at runtime the same way.
 * - A text area has no keyboard `kind` (other than `text`) and no `onSubmit`
 *   (Return inserts a newline). The types forbid both; an untyped or cast
 *   caller gets a NAMED warning rather than a silent drop.
 */

import type { AttrIR, ExprIR } from './types'

/**
 * Visible rows of a `<Field multiline>` with no `lines`. MUST equal
 * `FIELD_DEFAULT_LINES` in `@pyreon/primitives`' `web/Field.tsx` — pinned by
 * `field-multiline.test.ts`.
 */
export const FIELD_DEFAULT_LINES = 3

export type FieldLines = { kind: 'static'; n: number } | { kind: 'dynamic'; expr: ExprIR }

export interface FieldShape {
  /** `true` when the field lowers to a multi-line text area. */
  multiline: boolean
  /** Visible rows; meaningful only when `multiline`. */
  lines: FieldLines
  /** `false` when a text area must drop `onSubmit`. */
  honourSubmit: boolean
  /** `false` when a text area must drop a non-text keyboard `kind`. */
  honourKind: boolean
  warnings: string[]
}

type JsxElement = Extract<ExprIR, { kind: 'jsx-element' }>
type ReadStatic = (e: JsxElement, name: string) => string | number | boolean | undefined

function findAttr(e: JsxElement, name: string): Extract<AttrIR, { kind: 'attr' }> | undefined {
  return e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> => a.kind === 'attr' && a.name === name,
  )
}

/** `() => x` reads as the value `x` — the same unwrap the emitters apply. */
function unwrapZeroArgArrow(e: ExprIR): ExprIR {
  return e.kind === 'arrow' && e.params.length === 0 ? e.body : e
}

export function resolveFieldShape(e: JsxElement, readStatic: ReadStatic): FieldShape {
  const warnings: string[] = []
  const multilineAttr = findAttr(e, 'multiline')
  const multilineStatic = readStatic(e, 'multiline')
  let multiline = false
  if (multilineAttr !== undefined) {
    if (typeof multilineStatic === 'boolean') {
      multiline = multilineStatic
    } else {
      warnings.push(
        '<Field multiline> was given a non-static value, which does NOT lower on iOS or Android — it ' +
          'selects a different control (a `<textarea>` on the web, `TextField(axis: .vertical)` on iOS), ' +
          'so the field is rendered SINGLE-LINE. Use a static `multiline` (or `multiline={false}`), or ' +
          'branch the element itself (`{long() ? <Field multiline … /> : <Field … />}`), which lowers on ' +
          'both targets.',
      )
    }
  }

  const linesAttr = findAttr(e, 'lines')
  let lines: FieldLines = { kind: 'static', n: FIELD_DEFAULT_LINES }
  if (linesAttr !== undefined) {
    if (!multiline) {
      warnings.push(
        '<Field lines> only applies to a `multiline` field — it is IGNORED here, as it is on the web ' +
          '(an `<input>` has no rows). Add `multiline`, or drop `lines`.',
      )
    } else {
      const stat = readStatic(e, 'lines')
      if (typeof stat === 'number') {
        if (Number.isInteger(stat) && stat >= 1) {
          lines = { kind: 'static', n: stat }
        } else {
          warnings.push(
            `<Field multiline lines={${stat}}>: \`lines\` must be a whole number of rows, at least 1 — the ` +
              `default of ${FIELD_DEFAULT_LINES} is used, as on the web.`,
          )
        }
      } else if (linesAttr.value.kind === 'literal') {
        warnings.push(
          `<Field multiline lines>: \`lines\` must be a number — the default of ${FIELD_DEFAULT_LINES} is used.`,
        )
      } else {
        lines = { kind: 'dynamic', expr: unwrapZeroArgArrow(linesAttr.value) }
      }
    }
  }

  let honourSubmit = true
  let honourKind = true
  if (multiline) {
    if (e.attrs.some((a) => a.kind === 'event' && a.name === 'submit')) {
      honourSubmit = false
      warnings.push(
        '<Field multiline onSubmit>: a multi-line field has no submit — Return inserts a newline on every ' +
          'target, as in a web `<textarea>` — so `onSubmit` is IGNORED. Submit from a `<Button>` instead.',
      )
    }
    const kindAttr = findAttr(e, 'kind')
    if (kindAttr !== undefined && readStatic(e, 'kind') !== 'text') {
      honourKind = false
      warnings.push(
        '<Field multiline kind>: a multi-line field has no keyboard kind (a `<textarea>` has no `type`), ' +
          'so `kind` is IGNORED and the default text keyboard is used. Drop `kind`, or make the field ' +
          'single-line.',
      )
    }
  }

  return { multiline, lines, honourSubmit, honourKind, warnings }
}
