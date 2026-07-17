import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { mergeProps, splitProps } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'
import { batch, computed, signal } from '@pyreon/reactivity'

/** WAI-ARIA default when no `length` is supplied — the ubiquitous 6-digit OTP. */
const DEFAULT_LENGTH = 6

/**
 * Split a canonical pin string into a fixed-length, LEFT-PACKED cell list.
 * `('12', 4)` → `['1', '2', '', '']`. Over-long values are truncated to `n`.
 */
const toCells = (v: string, n: number): string[] => {
  const out: string[] = new Array(n)
  for (let i = 0; i < n; i++) out[i] = v[i] ?? ''
  return out
}

/** Element-wise array equality — the `cells` computed's notify gate. */
const sameCells = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((c, i) => c === b[i])

export interface PinInputBaseProps {
  /** Number of cells. Default `6`. A non-integer / non-positive value falls back to the default. */
  length?: number
  /**
   * The whole pin, as ONE string. Controlled. Controlled-ness is decided ONCE
   * at mount (see `useControllableState`), so don't switch a mounted instance
   * between controlled and uncontrolled.
   */
  value?: string
  /** Uncontrolled initial pin. Default `''`. */
  defaultValue?: string
  /** Fired with the NEXT whole pin on every committed edit. */
  onChange?: (value: string) => void
  /**
   * Fired with the whole pin when the last empty cell is filled — including via
   * paste. Fires on the incomplete→complete TRANSITION only, so editing an
   * already-complete pin does not re-fire it (see `commit`).
   */
  onComplete?: (value: string) => void
  /**
   * Input flavour. `'number'` restricts entry to digits and asks for the numeric
   * soft keyboard; `'password'` masks the cells. Default `'text'`.
   *
   * NOTE `'number'` does NOT render `<input type="number">` — that type ignores
   * `maxLength` entirely (per spec, maxLength applies only to text-ish types)
   * and ships spinners plus `e`/`+`/`-` acceptance. The correct OTP shape, used
   * by every mainstream implementation, is `type="text"` + `inputMode="numeric"`.
   */
  type?: 'text' | 'number' | 'password'
  /** Mask the cells (renders `type="password"`) while keeping `type`'s keyboard/filtering. */
  mask?: boolean
  /** Disable every cell. */
  disabled?: boolean
  /** Per-cell placeholder. */
  placeholder?: string
  /**
   * Override the per-cell accessible name. Defaults to `Digit {i+1} of {n}`.
   * A cell input has no visible label, so it MUST carry one — without it every
   * cell announces identically ("edit text, blank") and the user cannot tell
   * which of six they are in.
   */
  cellLabel?: (index: number, length: number) => string
  /** Render function. */
  children?: (state: PinInputState) => VNodeChild
  [key: string]: unknown
}

export interface PinInputState {
  /** The whole pin. Holes collapse — see `cells`. */
  value: () => string
  /** Per-cell characters, always exactly `length` long. `''` = empty cell. */
  cells: () => string[]
  /** Index of the cell that currently has focus (last focused, if none does). */
  focusedIndex: () => number
  /** Clear every cell. Deliberately does NOT move focus — a state API should not steal it. */
  clear: () => void
  /**
   * Props for the CONTAINER element. Carries the component-level `rest`
   * (rocketstyle class/style, data-*, id, aria-label…) — spread it or the
   * wrapping component renders UNSTYLED.
   */
  rootProps: () => Record<string, unknown>
  /**
   * Props for the cell at `index`.
   *
   * SNAPSHOT-style helper (like ComboboxBase's `getOptionProps` / CalendarBase's
   * `getDayProps`): the returned OBJECT is built per call. But every STATEFUL
   * entry on it (`value`, `aria-label`, `disabled`, `type`, `inputMode`) is
   * ACCESSOR-valued, so it stays live through a one-time `{...spread}` —
   * only the object's shape is a snapshot, never its state.
   *
   * That means the ordinary fixed-`length` case needs NO reactive accessor:
   *
   *     {Array.from({ length: 6 }, (_, i) => <input {...state.getCellProps(i)} />)}
   *
   * ONLY a changing `length` needs one — and it MUST key on the length you own,
   * never on `state.cells()`:
   *
   *     {() => Array.from({ length: myLength() }, (_, i) => <input {...state.getCellProps(i)} />)}
   *
   * TRAP (measured, not theoretical): `{() => state.cells().map(...)}` looks
   * equivalent and is not. It subscribes the accessor to `cells`, which changes
   * on EVERY keystroke — so the whole cell list remounts mid-typing, the input
   * elements lose identity, and focus falls back to `<body>`, killing
   * auto-advance. `cells()` is for reading state, not for driving structure.
   */
  getCellProps: (index: number) => Record<string, unknown>
}

/**
 * Headless OTP / PIN input (the WAI-ARIA "grouped text inputs" shape).
 *
 * Renders nothing itself: a render-fn primitive in the ComboboxBase / TreeBase
 * mould. Owns the whole signature OTP behaviour set — auto-advance,
 * backspace-to-previous, arrow/Home/End navigation, and paste-distribute.
 *
 * ## The value model, and why there are two of them
 *
 * The public model is ONE string (`value`), because that is what a consumer
 * submits and what a controlled parent round-trips. But a string cannot express
 * a HOLE: clearing the middle cell of `123` and joining gives `13`, which
 * re-derives to `['1','3','']` — the `3` visibly JUMPS one cell left. So the
 * DISPLAY model is a separate fixed-length array (`display`) that preserves
 * holes, reconciled against `value` by the `cells` computed:
 *
 *   - display still spells the canonical value → keep it (holes survive);
 *   - it doesn't → re-derive left-packed from `value` (a genuine EXTERNAL change).
 *
 * That echo-reconciliation is what makes controlled and uncontrolled behave
 * IDENTICALLY. Uncontrolled: we commit `['1','','3']`, emit `'13'`, and the
 * display still spells `'13'` → the hole survives. Controlled + parent echoes
 * `'13'` back: same check, same hole. Controlled + parent IGNORES the change:
 * `value` stays put, display disagrees, and the parent's value wins — the
 * primitive reports, it never fights the parent.
 */
export const PinInputBase: ComponentFn<PinInputBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'length',
    'value',
    'defaultValue',
    'onChange',
    'onComplete',
    'type',
    'mask',
    'disabled',
    'placeholder',
    'cellLabel',
    'children',
  ])

  const lengthOf = (): number => {
    const n = own.length ?? DEFAULT_LENGTH
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_LENGTH
  }

  const [value, setValue] = useControllableState<string>({
    value: () => own.value,
    defaultValue: own.defaultValue ?? '',
    onChange: own.onChange,
  })

  // Hole-preserving display model. Never read directly — read `cells`, which
  // reconciles this against the canonical `value` (see the component docblock).
  const display = signal<string[]>(toCells(value(), lengthOf()))

  // `equals` gates the notify: a commit that leaves the cells element-wise
  // identical (a rejected keystroke, a parent echoing the same value) must not
  // re-run every cell's reactive `value` binding.
  const cells = computed(
    () => {
      const v = value()
      const n = lengthOf()
      const shown = display()
      return shown.length === n && shown.join('') === v ? shown : toCells(v, n)
    },
    { equals: sameCells },
  )

  const focusedIndex = signal(0)

  // Cell elements, by index — populated by `getCellProps`'s ref. Focus movement
  // walks THIS, not the DOM: a `closest('[data-pin-input]')` query would make
  // every keyboard interaction silently depend on the consumer having spread
  // `rootProps` onto a real container.
  const cellEls: (HTMLInputElement | null)[] = []

  // Fires the incomplete→complete transition only. Tracked here rather than
  // derived, so editing an already-full pin doesn't re-announce completion on
  // every keystroke.
  let completeFired = false

  /**
   * Filter raw input/clipboard text down to acceptable characters. Whitespace
   * is always stripped so a pasted `"123 456"` lands as `123456`; `'number'`
   * additionally drops every non-digit, which doubles as the single-keystroke
   * reject (`'a'` → `''`).
   */
  const sanitize = (raw: string): string => {
    const s = raw.replace(/\s+/g, '')
    return own.type === 'number' ? s.replace(/\D/g, '') : s
  }

  const labelFor = (index: number): string => {
    const n = lengthOf()
    return own.cellLabel?.(index, n) ?? `Digit ${index + 1} of ${n}`
  }

  /**
   * Write the next cell list: update the display model and report the joined
   * pin. Both writes land in ONE batch so the `cells` computed never observes
   * the intermediate state where the display and the value disagree.
   */
  const commit = (next: string[]): void => {
    const joined = next.join('')
    batch(() => {
      display.set(next)
      setValue(joined)
    })

    const complete = next.every((c) => c !== '')
    if (complete && !completeFired) {
      completeFired = true
      own.onComplete?.(joined)
    } else if (!complete) {
      completeFired = false
    }
  }

  /** Move focus to `index`, clamped into range, selecting the cell's content. */
  const focusIndex = (index: number): void => {
    const clamped = Math.max(0, Math.min(index, lengthOf() - 1))
    focusedIndex.set(clamped)
    const el = cellEls[clamped]
    if (!el) return
    el.focus()
    // Select so the next keystroke REPLACES rather than being swallowed by
    // maxLength=1 (a full cell with a collapsed caret accepts no input).
    el.select()
  }

  /**
   * Force a cell's DOM value back to the model.
   *
   * The reactive `value` binding only re-runs when the model CHANGES, so a
   * keystroke the model rejects (`'a'` in number mode, or a parent-controlled
   * value that didn't move) would leave the rejected character sitting in the
   * DOM — the classic controlled-input divergence. Re-syncing unconditionally
   * is idempotent: when the binding did re-run, this writes the same string.
   */
  const syncCell = (el: HTMLInputElement, index: number): void => {
    const expected = cells()[index] ?? ''
    if (el.value !== expected) el.value = expected
  }

  /**
   * Write `chars` across the cells starting at `startIndex`, filling as many as
   * fit and dropping the overflow. Shared by paste and by multi-character input
   * (platform OTP autofill delivers the whole code to one field).
   */
  const distribute = (startIndex: number, chars: string): void => {
    if (!chars) return
    const n = lengthOf()
    const next = [...cells()]
    let idx = startIndex
    for (const ch of chars) {
      if (idx >= n) break
      next[idx] = ch
      idx++
    }
    commit(next)
    // `idx` is one past the last cell written: the next empty cell when the
    // paste ran out early, or `n` when it filled to the end — clamped to the
    // last filled cell.
    focusIndex(Math.min(idx, n - 1))
  }

  const handleFocus = (index: number, e: Event): void => {
    focusedIndex.set(index)
    // See `focusIndex` — select on ARRIVAL too, so a click or Tab into a full
    // cell can be typed over.
    ;(e.currentTarget as HTMLInputElement).select()
  }

  const handleInput = (index: number, e: Event): void => {
    const el = e.currentTarget as HTMLInputElement
    if (own.disabled) {
      syncCell(el, index)
      return
    }

    const raw = el.value

    // An empty field is a genuine deletion (select-then-Delete), NOT a rejected
    // character — the two are only distinguishable here, before sanitizing.
    if (raw === '') {
      const next = [...cells()]
      next[index] = ''
      commit(next)
      syncCell(el, index)
      return
    }

    const chars = sanitize(raw)
    if (chars.length === 0) {
      // Rejected (e.g. a letter in number mode): the model is unchanged, so the
      // reactive binding won't fire — undo the browser's edit by hand.
      syncCell(el, index)
      return
    }

    if (chars.length > 1) {
      // Platform OTP autofill drops the entire code into the first cell.
      distribute(index, chars)
      syncCell(el, index)
      return
    }

    const next = [...cells()]
    next[index] = chars
    commit(next)
    focusIndex(index + 1)
    syncCell(el, index)
  }

  const handleKeyDown = (index: number, e: KeyboardEvent): void => {
    if (own.disabled) return

    if (e.key === 'Backspace') {
      // We own the mutation, so stop the browser from ALSO deleting (which
      // would clear this cell *and* the previous one on a single press).
      e.preventDefault()
      const cur = cells()
      if (cur[index]) {
        // Filled: clear in place, keep focus — the user is retyping this cell.
        const next = [...cur]
        next[index] = ''
        commit(next)
        const el = cellEls[index]
        if (el) syncCell(el, index)
      } else if (index > 0) {
        // Empty: step back and clear THAT one, so a run of backspaces walks the
        // pin out right-to-left.
        const next = [...cur]
        next[index - 1] = ''
        commit(next)
        focusIndex(index - 1)
      }
      return
    }

    // Arrow/Home/End move focus only. `navigateByRole` is deliberately not
    // reused: it WRAPS (last → first), which is right for a tablist but wrong
    // for a pin — and it resolves siblings through a container selector this
    // primitive has no guarantee the consumer rendered.
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusIndex(index - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusIndex(index + 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusIndex(lengthOf() - 1)
    }
  }

  const handlePaste = (index: number, e: ClipboardEvent): void => {
    if (own.disabled) return
    // We own the insert — without this the browser ALSO drops the full string
    // into the cell under the caret.
    e.preventDefault()
    distribute(index, sanitize(e.clipboardData?.getData('text') ?? ''))
  }

  const state: PinInputState = {
    value,
    cells,
    focusedIndex,
    clear: () => commit(toCells('', lengthOf())),
    // Forward the component-level props onto the CONTAINER — the element the
    // wrapping PinInput's `.theme()` actually describes. This primitive renders
    // no element of its own, so without this the rocketstyle chain computes a
    // class that reaches NOTHING and the component renders UNSTYLED.
    // `mergeProps` (descriptor-safe) is required over an object spread so a
    // getter-shaped reactive prop isn't frozen; our own attributes go last and
    // therefore win.
    rootProps: () =>
      mergeProps(rest as Record<string, unknown>, {
        // A set of inputs that are one control needs a grouping role; the
        // consumer names it by passing `aria-label` through `rest`.
        role: 'group',
        'data-pin-input': '',
        'data-disabled': () => (own.disabled ? '' : undefined),
      } as Record<string, unknown>),
    getCellProps: (index: number) => ({
      ref: (el: HTMLInputElement | null) => {
        cellEls[index] = el
      },
      'data-pin-cell': '',
      'data-index': index,
      // ACCESSOR-VALUED, not getters. `applyProp` renderEffect-wraps a function
      // value on any non-`on*` prop, so these survive a consumer's `{...spread}`
      // — which would FIRE AND FREEZE a getter (the reason FileUploadBase's
      // getter-backed ARIA has to be re-mounted per variant in its tests).
      type: () => (own.mask || own.type === 'password' ? 'password' : 'text'),
      inputMode: () => (own.type === 'number' ? 'numeric' : 'text'),
      maxLength: 1,
      // The platform OTP-autofill hook belongs on the FIRST cell only: it
      // targets one field with the whole code (which `handleInput` then
      // distributes). On every cell, the OS would offer to fill each one.
      // camelCase, NOT the HTML-lowercase 'autocomplete': it works through a
      // BARE input (setAttribute passthrough) but @pyreon/styler's forward
      // ALLOWLIST (forward.ts) only carries 'autoComplete', so the lowercase
      // name is SILENTLY DROPPED the moment a cell is a styled component.
      // camelCase survives both paths (HTML attr names are case-insensitive).
      autoComplete: index === 0 ? 'one-time-code' : 'off',
      'aria-label': () => labelFor(index),
      value: () => cells()[index] ?? '',
      placeholder: own.placeholder,
      disabled: () => own.disabled ?? false,
      // ARIA state is a STRING enum, never a boolean — a boolean renders
      // presence-only `aria-disabled=""`, which AT reads as the default.
      'aria-disabled': () => (own.disabled ? 'true' : undefined),
      onInput: (e: Event) => handleInput(index, e),
      onKeyDown: (e: KeyboardEvent) => handleKeyDown(index, e),
      onPaste: (e: ClipboardEvent) => handlePaste(index, e),
      onFocus: (e: Event) => handleFocus(index, e),
    }),
  }

  if (typeof own.children === 'function') {
    return (own.children as (state: PinInputState) => VNodeChild)(state)
  }
  return null
}
