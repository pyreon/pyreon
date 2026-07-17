import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'

export interface NumberInputBaseProps {
  /** Controlled value. Omit for uncontrolled (see `defaultValue`). */
  value?: number
  /** Initial value in uncontrolled mode. Defaults to `min` when finite, else `0`. */
  defaultValue?: number
  /** Called with the normalized (clamped / stepped / rounded) value on every change. */
  onChange?: (value: number) => void
  /** Lower bound, inclusive. Default `-Infinity` (unbounded). */
  min?: number
  /** Upper bound, inclusive. Default `Infinity` (unbounded). */
  max?: number
  /** Arrow-key / increment / decrement granularity. Must be > 0. Default `1`. */
  step?: number
  /** PageUp / PageDown granularity. Must be > 0. Default `step * 10`. */
  largeStep?: number
  /**
   * Decimal places to round AND format to. When set, the displayed text is
   * `toFixed(precision)` (so `precision: 2` shows `"3.00"`). When omitted, the
   * rounding precision for STEPPING is derived from `step`/`min` purely to kill
   * float drift, and typed text is never re-rounded.
   */
  precision?: number
  /** Disables typing, stepping and focus. Sets `disabled` + `aria-disabled`. */
  disabled?: boolean
  /** Blocks typing and stepping, keeps focus. Sets `readonly` + `aria-readonly`. */
  readOnly?: boolean
  /**
   * Optional render-fn. When absent the primitive renders the `<input>` itself
   * (with `inputProps()` already applied); supply it to wire the +/- buttons
   * around your own input.
   */
  children?: (state: NumberInputState) => VNodeChild
  [key: string]: unknown
}

export interface NumberInputState {
  /** Current value — always finite, always within `[min, max]`. Never `NaN`. */
  value: () => number
  /** Step up by `step`. No-op when disabled / readOnly / already at `max`. */
  increment: () => void
  /** Step down by `step`. No-op when disabled / readOnly / already at `min`. */
  decrement: () => void
  /** `false` at `max` (or when disabled / readOnly) — drives the + button's disabled state. */
  canIncrement: () => boolean
  /** `false` at `min` (or when disabled / readOnly) — drives the - button's disabled state. */
  canDecrement: () => boolean
  /**
   * Props to spread on the input element: `{...state.inputProps()}`.
   *
   * Every value that can change at runtime (`value`, `aria-valuenow`,
   * `aria-disabled`, …) is an ACCESSOR FUNCTION, not a resolved value and not a
   * getter. `applyProp` (`runtime-dom/src/props.ts`) wraps a function-valued
   * non-`on*` prop in a `renderEffect`, so each one stays reactive — and unlike
   * a getter, a function VALUE survives the object spread that a consumer's
   * `{...state.inputProps()}` performs. That makes the ARIA live in BOTH the
   * compiled app and an uncompiled (plain-oxc JSX) context. Returning a record
   * rather than an exact type mirrors `FileUploadBase.dropZoneProps`.
   */
  inputProps: () => Record<string, unknown>
}

/* -------------------------------------------------------------- numerics */

/**
 * Decimal places in `n`'s canonical string form, exponent-aware.
 * `String(1e-7)` is `"1e-7"`, so a naive `split('.')[1].length` reports 0
 * decimals for a number that plainly has 7 — which would make `roundTo` flatten
 * it to `0`. Used only to DERIVE a rounding precision from `step`, never to format.
 */
function decimalsOf(n: number): number {
  if (!Number.isFinite(n)) return 0
  const s = String(Math.abs(n))
  const e = s.indexOf('e')
  if (e === -1) return (s.split('.')[1] ?? '').length
  const mantissaDecimals = (s.slice(0, e).split('.')[1] ?? '').length
  const exponent = Number(s.slice(e + 1))
  return Math.max(0, mantissaDecimals - exponent)
}

/**
 * Round to `decimals` places via the DECIMAL string form (`toFixed`), not via
 * `Math.round(n * 10 ** decimals) / 10 ** decimals` — the multiply/divide pair
 * re-introduces the very binary drift we are removing. This is what turns the
 * `0.2 + 0.1 = 0.30000000000000004` of IEEE-754 back into `0.3`.
 */
function roundTo(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return n
  if (decimals <= 0) return Math.round(n)
  // toFixed throws a RangeError above 100 digits.
  return Number(n.toFixed(Math.min(decimals, 100)))
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

/**
 * Snap to the nearest `origin + k * step` grid point. The grid is anchored at
 * `min` (per the HTML stepping algorithm's "step base"), falling back to `0`
 * when `min` is unbounded — otherwise `-Infinity` would poison the arithmetic
 * into `NaN`.
 */
function snapToStep(n: number, step: number, origin: number): number {
  if (!Number.isFinite(step) || step <= 0) return n
  const base = Number.isFinite(origin) ? origin : 0
  return base + Math.round((n - base) / step) * step
}

/**
 * Parse user-typed text to a finite number, or `null` for anything that is not
 * one. `null` (never `NaN`) is what keeps a garbage entry from ever reaching
 * the value signal — `Number('')` and `Number(' ')` are `0`, and
 * `Number('Infinity')` is `Infinity`, so both are excluded explicitly.
 */
function parseNumber(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/* ------------------------------------------------------------- primitive */

/**
 * Headless number input base — the WAI-ARIA **spinbutton** pattern over a
 * `type="text"` input.
 *
 * ## Why not `<input type="number">`
 *
 * This deliberately does NOT render a native number input:
 *
 * - **Its spinners are unstylable.** `::-webkit-inner-spin-button` is a
 *   closed shadow part with no cross-browser styling story, and Firefox exposes
 *   nothing at all. This library styles every control through rocketstyle, so a
 *   control whose most visible affordance cannot be themed is a dead end. The
 *   spinbutton pattern lets the component ship real, stylable +/- buttons wired
 *   to `increment` / `decrement`.
 * - **It mutates on wheel-scroll.** A focused native number input silently
 *   changes value when the page is scrolled over it — a real, repeatedly
 *   reported data-loss footgun. We bind no wheel handler, so scrolling is inert.
 * - **It formats inconsistently.** Locale decimal separators, `1e3`, and
 *   leading zeros are normalized differently per engine, and a rejected entry
 *   reports `value === ''` with no way to recover what the user typed.
 * - **It gives no control over `aria-valuetext`.** Announcing "5 items" or
 *   "20 %" instead of a bare "5" requires owning the ARIA, which the native
 *   control does not permit.
 *
 * So: `role="spinbutton"` + explicit `aria-valuenow` / `aria-valuemin` /
 * `aria-valuemax`, `inputmode="decimal"` for a numeric soft keyboard, and
 * keyboard stepping implemented here. This is the same call Mantine, Ark UI and
 * Radix's number-field make.
 *
 * ## Normalization — two pipelines, deliberately
 *
 * - **Stepping** (`increment` / `decrement` / arrows / PageUp / PageDown /
 *   Home / End) → move on the `step` grid, clamp, then round away float drift.
 * - **Typing** → clamp (and round only when `precision` is given). Typed text
 *   is NOT snapped to `step` and NOT rounded to a step-derived precision,
 *   because both destroy legitimate input: with the DEFAULT `step: 1`, snapping
 *   would rewrite a typed `2.5` to `3`, and with `step: 5` you could never
 *   enter `7`. Float drift is an artifact of repeated ARITHMETIC, so the
 *   derived-precision rounding belongs on the arithmetic path only. Mantine and
 *   Ark UI draw the line in the same place.
 *
 * Because typing may leave the value off the `step` grid, the arrow path
 * implements the HTML stepping algorithm: an off-grid value ALIGNS to the
 * adjacent grid point in the step's direction (`step: 2`, value `5`, ArrowUp →
 * `6`) instead of overshooting to `8`. See `stepBy`.
 *
 * Both pipelines clamp, so `value()` can never leave `[min, max]` and the
 * `aria-valuemin <= aria-valuenow <= aria-valuemax` invariant always holds.
 * Clamping wins over the grid, so a `max` that is off-grid stays reachable.
 *
 * @example
 * // Direct — the primitive renders the input.
 * <NumberInputBase defaultValue={5} min={0} max={10} onChange={setQty} />
 *
 * @example
 * // Render-fn — wire your own stylable stepper buttons.
 * <NumberInputBase min={0} max={10}>
 *   {(s) => (
 *     <div>
 *       <button disabled={() => !s.canDecrement()} onClick={s.decrement}>-</button>
 *       <input {...s.inputProps()} />
 *       <button disabled={() => !s.canIncrement()} onClick={s.increment}>+</button>
 *     </div>
 *   )}
 * </NumberInputBase>
 */
export const NumberInputBase: ComponentFn<NumberInputBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'value',
    'defaultValue',
    'onChange',
    'min',
    'max',
    'step',
    'largeStep',
    'precision',
    'disabled',
    'readOnly',
    'children',
  ])

  // Every config read goes through an accessor so a getter-shaped reactive prop
  // (what the compiler emits for `min={sig()}`) is read INSIDE the tracking
  // scope of whichever effect consumes it — a setup-time `own.min` read would
  // snapshot it forever.
  const minOf = (): number => (typeof own.min === 'number' ? own.min : -Infinity)
  const maxOf = (): number => (typeof own.max === 'number' ? own.max : Infinity)
  const stepOf = (): number => {
    const s = own.step
    // A `step` of 0 / negative / NaN would make snapToStep divide by zero.
    return typeof s === 'number' && Number.isFinite(s) && s > 0 ? s : 1
  }
  const largeStepOf = (): number => {
    const l = own.largeStep
    return typeof l === 'number' && Number.isFinite(l) && l > 0 ? l : stepOf() * 10
  }
  /** The EXPLICIT precision only — `undefined` means "derive it, for stepping". */
  const precisionOf = (): number | undefined => {
    const p = own.precision
    return typeof p === 'number' && Number.isFinite(p) && p >= 0 ? Math.floor(p) : undefined
  }
  /** Rounding precision for the ARITHMETIC path. Grid points are `min + k*step`, so both operands feed the drift. */
  const stepDecimals = (): number => {
    const explicit = precisionOf()
    if (explicit !== undefined) return explicit
    const base = minOf()
    return Math.max(decimalsOf(stepOf()), Number.isFinite(base) ? decimalsOf(base) : 0)
  }

  const initialValue = ((): number => {
    if (typeof own.defaultValue === 'number' && Number.isFinite(own.defaultValue)) {
      return own.defaultValue
    }
    const min = minOf()
    return Number.isFinite(min) ? min : 0
  })()

  const [rawValue, setRawValue] = useControllableState<number>({
    value: () => own.value,
    defaultValue: initialValue,
    onChange: own.onChange,
  })

  /**
   * The current value, CLAMPED on read. Clamping the read (rather than pushing
   * a correction back through `onChange`) is what keeps a controlled parent
   * authoritative — we never fight it — while still guaranteeing that
   * `aria-valuenow` cannot land outside `[aria-valuemin, aria-valuemax]`. A
   * non-finite raw value (a parent passing `NaN`, a bad `defaultValue`) folds
   * to a clamped `0` so `value()` is total.
   */
  const value = (): number => {
    const raw = rawValue()
    const safe = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
    return clamp(safe, minOf(), maxOf())
  }

  /**
   * The in-progress edit text, or `null` when not editing (display derives from
   * `value()`). This is what lets a half-typed `"-"` / `"1."` / `"abc"` live in
   * the input without ever reaching the value signal. Cleared on blur and on
   * every stepping op, which re-syncs the display to the normalized value.
   */
  const rawText = signal<string | null>(null)

  const formatValue = (n: number): string => {
    const p = precisionOf()
    return p !== undefined ? n.toFixed(Math.min(p, 100)) : String(n)
  }

  const displayText = (): string => rawText() ?? formatValue(value())

  const isLocked = (): boolean => own.disabled === true || own.readOnly === true

  /** Arithmetic path: snap to the step grid, clamp, then round the drift away. */
  const normalizeStepped = (n: number): number =>
    roundTo(clamp(snapToStep(n, stepOf(), minOf()), minOf(), maxOf()), stepDecimals())

  /** Typing path: clamp, and round ONLY to an explicit precision. See the class JSDoc. */
  const normalizeTyped = (n: number): number => {
    const p = precisionOf()
    return clamp(p !== undefined ? roundTo(n, p) : n, minOf(), maxOf())
  }

  const commit = (next: number): void => {
    if (!Number.isFinite(next)) return
    // Skip the no-op write so holding ArrowUp at `max` doesn't spam onChange.
    if (next === value()) return
    setRawValue(next)
  }

  /**
   * Whether `n` sits exactly on the `stepBase + k * step` grid. The comparison
   * runs AFTER rounding both sides to the same precision, so IEEE-754 drift in
   * the division (`0.3 / 0.1` is `2.9999999999999996`) cannot misreport an
   * on-grid value as off-grid.
   */
  const isOnGrid = (n: number): boolean =>
    roundTo(snapToStep(n, stepOf(), minOf()), stepDecimals()) === n

  /**
   * Arrow / increment / decrement — the HTML `stepUp()` / `stepDown()`
   * semantics: from an ON-grid value move one full `step`; from an OFF-grid
   * value (which typing legitimately produces — see the class JSDoc) move to
   * the ADJACENT grid point in the step's DIRECTION rather than overshooting
   * past it. With `step: 2` from a typed `5`, ArrowUp is `6` — not the `8` that
   * a naive `snapToStep(5 + 2)` (round-to-NEAREST of 7) would give, which would
   * move by 3 on a 2-step. Matches `<input type="number">`, Mantine and Ark UI.
   */
  const stepBy = (dir: 1 | -1): void => {
    if (isLocked()) return
    const current = value()
    const step = stepOf()
    const min = minOf()
    const base = Number.isFinite(min) ? min : 0
    const k = (current - base) / step
    const next = isOnGrid(current)
      ? current + dir * step
      : base + (dir > 0 ? Math.ceil(k) : Math.floor(k)) * step
    commit(normalizeStepped(next))
    rawText.set(null)
  }

  /**
   * PageUp / PageDown — a plain `largeStep` jump, then normalized back onto the
   * `step` grid (nearest, since `largeStep` need not be a multiple of `step`).
   * Unlike the arrow path this does not grid-align first: a page jump is a
   * coarse move, so overshoot correction would make it land a full step short.
   */
  const pageBy = (dir: 1 | -1): void => {
    if (isLocked()) return
    commit(normalizeStepped(value() + dir * largeStepOf()))
    rawText.set(null)
  }

  const jumpTo = (target: number): void => {
    if (isLocked() || !Number.isFinite(target)) return
    commit(roundTo(clamp(target, minOf(), maxOf()), stepDecimals()))
    rawText.set(null)
  }

  const increment = (): void => stepBy(1)
  const decrement = (): void => stepBy(-1)
  const canIncrement = (): boolean => !isLocked() && value() < maxOf()
  const canDecrement = (): boolean => !isLocked() && value() > minOf()

  const handleInput = (e: Event): void => {
    if (isLocked()) return
    const text = (e.target as HTMLInputElement).value
    rawText.set(text)
    const parsed = parseNumber(text)
    // Unparseable → hold the text, leave the value alone. Never NaN.
    if (parsed === null) return
    commit(normalizeTyped(parsed))
  }

  const handleBlur = (): void => {
    // handleInput already committed each keystroke; this re-commit only matters
    // for a value set without an `input` event. Clearing rawText re-derives the
    // display from value(), which is what reformats `"0015"` → `"15"` and snaps
    // an out-of-range `"99"` back to `max`.
    const text = rawText()
    if (text !== null && !isLocked()) {
      const parsed = parseNumber(text)
      if (parsed !== null) commit(normalizeTyped(parsed))
    }
    rawText.set(null)
  }

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (isLocked()) return
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault() // would otherwise move the caret
        stepBy(1)
        break
      case 'ArrowDown':
        e.preventDefault()
        stepBy(-1)
        break
      case 'PageUp':
        e.preventDefault()
        pageBy(1)
        break
      case 'PageDown':
        e.preventDefault()
        pageBy(-1)
        break
      case 'Home': {
        // Only hijack when there is a bound to jump to — on an unbounded input
        // Home/End must keep their native caret-movement meaning.
        const min = minOf()
        if (Number.isFinite(min)) {
          e.preventDefault()
          jumpTo(min)
        }
        break
      }
      case 'End': {
        const max = maxOf()
        if (Number.isFinite(max)) {
          e.preventDefault()
          jumpTo(max)
        }
        break
      }
      default:
        break
    }
  }

  const inputProps = (): Record<string, unknown> => ({
    // Static semantics — the whole point of the primitive; a consumer's
    // `type="number"` in `rest` is intentionally overridden (see class JSDoc).
    type: 'text',
    role: 'spinbutton',
    inputmode: 'decimal',
    // Accessors: reactive via applyProp's renderEffect, and spread-safe.
    value: () => displayText(),
    'aria-valuenow': () => value(),
    // An unbounded end is announced by OMITTING the attribute — `aria-valuemin`
    // has no "none" token, and "-Infinity" is not a valid <decimal>.
    'aria-valuemin': () => (Number.isFinite(minOf()) ? minOf() : undefined),
    'aria-valuemax': () => (Number.isFinite(maxOf()) ? maxOf() : undefined),
    // ARIA state is a STRING enum — a boolean would render presence-only
    // (`aria-disabled=""`), which AT does not read as "true".
    'aria-disabled': () => (own.disabled === true ? 'true' : undefined),
    'aria-readonly': () => (own.readOnly === true ? 'true' : undefined),
    disabled: () => own.disabled === true,
    readOnly: () => own.readOnly === true,
    onInput: handleInput,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
  })

  const state: NumberInputState = {
    value,
    increment,
    decrement,
    canIncrement,
    canDecrement,
    inputProps,
  }

  // Structural, not reactive: whether a render-fn was supplied is a fixed shape
  // decision, so a plain branch is correct here (cf. rule "reactive conditional
  // rendering returns an accessor" — no signal is read).
  if (typeof own.children === 'function') {
    return (own.children as (state: NumberInputState) => VNodeChild)(state)
  }

  // `rest` FIRST so the consumer's rocketstyle className / style / id / ref land
  // on the input — a primitive that drops `rest` renders unstyled — and the
  // primitive's own semantics win over it.
  return <input {...(rest as Record<string, unknown>)} {...inputProps()} />
}
