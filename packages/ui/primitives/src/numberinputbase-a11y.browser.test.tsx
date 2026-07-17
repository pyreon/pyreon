/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for NumberInputBase — the WAI-ARIA spinbutton contract,
 * the keyboard stepping model, and the numeric normalization.
 *
 * ## Why these assert TRANSITIONS, not just initial state
 *
 * This package's browser config runs plain oxc JSX with NO Pyreon reactive-prop
 * compiler, so `aria-x={sig() ? …}` would SNAPSHOT at mount and never flip —
 * a primitive can therefore ship with perfect-looking initial ARIA and a frozen
 * live region. `inputProps()` defends against that by exposing every
 * runtime-changing value as an ACCESSOR FUNCTION (which `applyProp` wraps in a
 * `renderEffect`, and which — unlike a getter — survives the consumer's object
 * spread). The only assertion that can prove it is a state TRANSITION: mount,
 * change the value, and re-read the attribute. Hence
 * "aria-valuenow UPDATES after increment" rather than "aria-valuenow is 5".
 *
 * ## Event realism
 *
 * `keydown` / `input` are DELEGATED by the runtime (listener on the mount
 * container), so those dispatches must set `bubbles: true`. `blur` is NOT
 * delegated — `applyEventProp` direct-attaches it to the element — so a
 * non-bubbling FocusEvent reaches it. Synthetic dispatch is legitimate here
 * because every handler under test is one this primitive attaches itself; no
 * NATIVE activation behaviour (a <button>'s Enter→click) is relied on, so no
 * trusted-input / CDP userEvent is required.
 *
 * ## Bisects (all verified, see the PR/report)
 *   - accessor→value in inputProps        → the aria-valuenow TRANSITION spec fails (frozen at mount)
 *   - roundTo→raw arithmetic              → the float-drift spec fails (0.30000000000000004)
 *   - drop the clamp in `value()`         → the clamp/canIncrement specs fail
 *   - drop `{...rest}` from the render    → the rest-forwarding spec fails (unstyled)
 */
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import {
  NumberInputBase,
  type NumberInputBaseProps,
  type NumberInputState,
} from './NumberInputBase'

/**
 * Mounts through the RENDER-FN path and spreads `inputProps()` onto the input —
 * i.e. exactly the shape a real component (which owns the +/- buttons) uses, and
 * the shape where a getter-based ARIA would be snapshotted by the spread.
 */
function mountNumber(props: Partial<NumberInputBaseProps> = {}) {
  let captured!: NumberInputState
  const { container, unmount } = mountInBrowser(
    h(NumberInputBase as never, {
      ...props,
      children: (s: NumberInputState) => {
        captured = s
        return h('input', { ...s.inputProps(), id: 'ni' })
      },
    }),
  )
  return {
    container,
    unmount,
    state: () => captured,
    input: () => container.querySelector('#ni') as HTMLInputElement,
  }
}

/** keydown is delegated → must bubble. Returns the event so defaultPrevented is assertable. */
function press(el: HTMLElement, key: string): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev
}

/** Simulates a user edit: set the raw text, then fire the (delegated) input event. */
function type(el: HTMLInputElement, text: string): void {
  el.value = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** blur is NOT delegated (direct addEventListener) → no bubbling needed. */
function blur(el: HTMLElement): void {
  el.dispatchEvent(new FocusEvent('blur'))
}

describe('NumberInputBase — spinbutton semantics', () => {
  it('renders a text input carrying the spinbutton role + numeric soft keyboard', async () => {
    const { input, unmount } = mountNumber({ defaultValue: 5, min: 0, max: 10 })
    await flush()
    const el = input()
    // A TEXT input by design — the native number spinners are unstylable and
    // mutate on wheel-scroll (see NumberInputBase's JSDoc).
    expect(el.getAttribute('type')).toBe('text')
    expect(el.getAttribute('role')).toBe('spinbutton')
    expect(el.getAttribute('inputmode')).toBe('decimal')
    expect(el.getAttribute('aria-valuenow')).toBe('5')
    expect(el.value).toBe('5')
    unmount()
  })

  it('publishes aria-valuemin / aria-valuemax when the bounds are finite', async () => {
    const { input, unmount } = mountNumber({ defaultValue: 5, min: 0, max: 10 })
    await flush()
    expect(input().getAttribute('aria-valuemin')).toBe('0')
    expect(input().getAttribute('aria-valuemax')).toBe('10')
    unmount()
  })

  it('OMITS aria-valuemin / aria-valuemax when the bound is unbounded', async () => {
    // aria-valuemin has no "none" token and "-Infinity" is not a valid
    // <decimal> — an unbounded end must be announced by absence.
    const { input, unmount } = mountNumber({ defaultValue: 5 })
    await flush()
    expect(input().getAttribute('aria-valuemin')).toBeNull()
    expect(input().getAttribute('aria-valuemax')).toBeNull()
    expect(input().getAttribute('aria-valuenow')).toBe('5')
    unmount()
  })

  it('publishes only the bound that is finite', async () => {
    const { input, unmount } = mountNumber({ defaultValue: 5, min: 0 })
    await flush()
    expect(input().getAttribute('aria-valuemin')).toBe('0')
    expect(input().getAttribute('aria-valuemax')).toBeNull()
    unmount()
  })

  it('reflects disabled / readOnly as STRING aria state plus the native attribute', async () => {
    const d = mountNumber({ defaultValue: 1, disabled: true })
    await flush()
    // String enum — a boolean would render presence-only (aria-disabled="")
    // which AT does not read as "true".
    expect(d.input().getAttribute('aria-disabled')).toBe('true')
    expect(d.input().disabled).toBe(true)
    expect(d.input().getAttribute('aria-readonly')).toBeNull()
    d.unmount()

    const r = mountNumber({ defaultValue: 1, readOnly: true })
    await flush()
    expect(r.input().getAttribute('aria-readonly')).toBe('true')
    expect(r.input().readOnly).toBe(true)
    expect(r.input().getAttribute('aria-disabled')).toBeNull()
    r.unmount()
  })

  it('omits the aria state entirely when enabled + writable', async () => {
    const { input, unmount } = mountNumber({ defaultValue: 1 })
    await flush()
    expect(input().getAttribute('aria-disabled')).toBeNull()
    expect(input().getAttribute('aria-readonly')).toBeNull()
    expect(input().disabled).toBe(false)
    unmount()
  })
})

describe('NumberInputBase — reactive ARIA (the snapshot-freeze trap)', () => {
  it('UPDATES aria-valuenow + the displayed value after increment', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 5, min: 0, max: 10 })
    await flush()
    expect(input().getAttribute('aria-valuenow')).toBe('5')

    state().increment()
    await flush()
    // THE assertion: a getter/value-based inputProps would still read "5" here.
    expect(input().getAttribute('aria-valuenow')).toBe('6')
    expect(input().value).toBe('6')
    unmount()
  })

  it('UPDATES aria-valuenow after decrement', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 5, min: 0, max: 10 })
    await flush()
    state().decrement()
    state().decrement()
    await flush()
    expect(state().value()).toBe(3)
    expect(input().getAttribute('aria-valuenow')).toBe('3')
    expect(input().value).toBe('3')
    unmount()
  })

  it('UPDATES aria-valuenow after keyboard stepping', async () => {
    const { input, unmount } = mountNumber({ defaultValue: 0, min: 0, max: 100 })
    await flush()
    press(input(), 'ArrowUp')
    await flush()
    expect(input().getAttribute('aria-valuenow')).toBe('1')
    unmount()
  })
})

describe('NumberInputBase — keyboard', () => {
  it('ArrowUp / ArrowDown step by `step`', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 4, step: 2 })
    await flush()
    press(input(), 'ArrowUp')
    await flush()
    expect(state().value()).toBe(6)
    press(input(), 'ArrowDown')
    await flush()
    expect(state().value()).toBe(4)
    unmount()
  })

  it('aligns an OFF-grid value to the adjacent grid point in the step direction', async () => {
    // The HTML stepUp()/stepDown() semantics. Typing 5 with step 2 is legal
    // (typed text is never snapped), so the arrow must ALIGN — a naive
    // snapToStep(5 + 2) rounds 7 to 8, moving by 3 on a 2-step.
    const up = mountNumber({ defaultValue: 5, min: 0, step: 2 })
    await flush()
    press(up.input(), 'ArrowUp')
    await flush()
    expect(up.state().value()).toBe(6)
    up.unmount()

    const down = mountNumber({ defaultValue: 5, min: 0, step: 2 })
    await flush()
    press(down.input(), 'ArrowDown')
    await flush()
    expect(down.state().value()).toBe(4)
    down.unmount()
  })

  it('PageUp / PageDown step by `largeStep`', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 0, step: 1, largeStep: 25 })
    await flush()
    press(input(), 'PageUp')
    await flush()
    expect(state().value()).toBe(25)
    press(input(), 'PageDown')
    await flush()
    expect(state().value()).toBe(0)
    unmount()
  })

  it('largeStep defaults to step * 10', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 0, step: 2 })
    await flush()
    press(input(), 'PageUp')
    await flush()
    expect(state().value()).toBe(20)
    unmount()
  })

  it('Home / End jump to min / max', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 5, min: -3, max: 42 })
    await flush()
    press(input(), 'Home')
    await flush()
    expect(state().value()).toBe(-3)
    expect(input().getAttribute('aria-valuenow')).toBe('-3')

    press(input(), 'End')
    await flush()
    expect(state().value()).toBe(42)
    expect(input().getAttribute('aria-valuenow')).toBe('42')
    unmount()
  })

  it('leaves Home / End to the native caret when the bound is unbounded', async () => {
    // Hijacking Home in a text input with no min would steal caret movement for
    // nothing — there is no bound to jump to.
    const { input, state, unmount } = mountNumber({ defaultValue: 5 })
    await flush()
    const home = press(input(), 'Home')
    const end = press(input(), 'End')
    await flush()
    expect(home.defaultPrevented).toBe(false)
    expect(end.defaultPrevented).toBe(false)
    expect(state().value()).toBe(5)
    unmount()
  })

  it('preventDefaults the stepping keys so the caret does not jump', async () => {
    const { input, unmount } = mountNumber({ defaultValue: 5, min: 0, max: 10 })
    await flush()
    for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) {
      expect(press(input(), key).defaultPrevented).toBe(true)
    }
    unmount()
  })

  it('ignores keys it does not own', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 5 })
    await flush()
    const ev = press(input(), 'a')
    await flush()
    expect(ev.defaultPrevented).toBe(false)
    expect(state().value()).toBe(5)
    unmount()
  })
})

describe('NumberInputBase — clamping and bounds', () => {
  it('clamps at max and flips canIncrement', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 9, min: 0, max: 10 })
    await flush()
    expect(state().canIncrement()).toBe(true)

    state().increment()
    await flush()
    expect(state().value()).toBe(10)
    expect(state().canIncrement()).toBe(false)
    expect(state().canDecrement()).toBe(true)

    state().increment() // must not overshoot
    await flush()
    expect(state().value()).toBe(10)
    expect(input().getAttribute('aria-valuenow')).toBe('10')
    unmount()
  })

  it('clamps at min and flips canDecrement', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 1, min: 0, max: 10 })
    await flush()
    expect(state().canDecrement()).toBe(true)

    state().decrement()
    await flush()
    expect(state().value()).toBe(0)
    expect(state().canDecrement()).toBe(false)
    expect(state().canIncrement()).toBe(true)

    state().decrement()
    await flush()
    expect(state().value()).toBe(0)
    expect(input().getAttribute('aria-valuenow')).toBe('0')
    unmount()
  })

  it('canIncrement / canDecrement are both true away from the bounds, both false when locked', async () => {
    const open = mountNumber({ defaultValue: 5, min: 0, max: 10 })
    await flush()
    expect(open.state().canIncrement()).toBe(true)
    expect(open.state().canDecrement()).toBe(true)
    open.unmount()

    const disabled = mountNumber({ defaultValue: 5, min: 0, max: 10, disabled: true })
    await flush()
    expect(disabled.state().canIncrement()).toBe(false)
    expect(disabled.state().canDecrement()).toBe(false)
    disabled.unmount()

    const readOnly = mountNumber({ defaultValue: 5, min: 0, max: 10, readOnly: true })
    await flush()
    expect(readOnly.state().canIncrement()).toBe(false)
    expect(readOnly.state().canDecrement()).toBe(false)
    readOnly.unmount()
  })

  it('is unbounded by default (canIncrement/canDecrement stay true)', async () => {
    const { state, unmount } = mountNumber({ defaultValue: 0 })
    await flush()
    expect(state().canIncrement()).toBe(true)
    expect(state().canDecrement()).toBe(true)
    unmount()
  })

  it('clamps an out-of-range value into the ARIA range rather than announcing a lie', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 999, min: 0, max: 10 })
    await flush()
    expect(state().value()).toBe(10)
    expect(input().getAttribute('aria-valuenow')).toBe('10')
    unmount()
  })

  it('does not step when disabled or readOnly', async () => {
    const d = mountNumber({ defaultValue: 5, disabled: true })
    await flush()
    d.state().increment()
    press(d.input(), 'ArrowUp')
    await flush()
    expect(d.state().value()).toBe(5)
    d.unmount()

    const r = mountNumber({ defaultValue: 5, readOnly: true })
    await flush()
    r.state().increment()
    press(r.input(), 'ArrowUp')
    await flush()
    expect(r.state().value()).toBe(5)
    r.unmount()
  })
})

describe('NumberInputBase — float drift', () => {
  it('steps 0.2 → exactly 0.3, not 0.30000000000000004', async () => {
    // Guard the premise: raw IEEE-754 arithmetic really does drift here.
    expect(0.2 + 0.1).not.toBe(0.3)

    const { input, state, unmount } = mountNumber({ defaultValue: 0.2, step: 0.1 })
    await flush()
    state().increment()
    await flush()
    expect(state().value()).toBe(0.3)
    expect(input().getAttribute('aria-valuenow')).toBe('0.3')
    expect(input().value).toBe('0.3')
    unmount()
  })

  it('stays exact across a chain of 0.1 steps', async () => {
    const { state, unmount } = mountNumber({ defaultValue: 0, step: 0.1 })
    await flush()
    for (const expected of [0.1, 0.2, 0.3, 0.4, 0.5]) {
      state().increment()
      await flush()
      expect(state().value()).toBe(expected)
    }
    for (const expected of [0.4, 0.3, 0.2, 0.1, 0]) {
      state().decrement()
      await flush()
      expect(state().value()).toBe(expected)
    }
    unmount()
  })

  it('derives the drift precision from a min that is finer than step', async () => {
    // Grid points are min + k*step → 0.05, 0.15, … so 2 decimals are required
    // even though `step` alone only implies 1.
    const { state, unmount } = mountNumber({ defaultValue: 0.05, min: 0.05, step: 0.1 })
    await flush()
    state().increment()
    await flush()
    expect(state().value()).toBe(0.15)
    unmount()
  })

  it('handles a step whose canonical form is exponential', async () => {
    // String(1e-7) === "1e-7", so a decimal-counter that just splits on "."
    // reports 0 decimals → roundTo(1e-7, 0) → Math.round → 0 → the step becomes
    // a silent no-op. Guards decimalsOf's exponent branch.
    expect(String(1e-7)).toBe('1e-7')
    const { state, unmount } = mountNumber({ defaultValue: 0, step: 1e-7 })
    await flush()
    state().increment()
    await flush()
    expect(state().value()).toBe(1e-7)
    unmount()
  })

  it('snaps an off-grid value onto the step grid when stepping', async () => {
    const { state, unmount } = mountNumber({ defaultValue: 7, min: 0, step: 5 })
    await flush()
    state().increment() // 7 + 5 = 12 → nearest grid point is 10
    await flush()
    expect(state().value()).toBe(10)
    unmount()
  })
})

describe('NumberInputBase — precision', () => {
  it('formats to an explicit precision (trailing zeros kept)', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 1, precision: 2, step: 0.5 })
    await flush()
    expect(input().value).toBe('1.00')
    // aria-valuenow is a <decimal>; the padded display text is not its concern.
    expect(input().getAttribute('aria-valuenow')).toBe('1')

    state().increment()
    await flush()
    expect(state().value()).toBe(1.5)
    expect(input().value).toBe('1.50')
    unmount()
  })

  it('rounds typed text to an explicit precision on commit', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 0, precision: 1 })
    await flush()
    type(input(), '2.46')
    await flush()
    expect(state().value()).toBe(2.5)
    unmount()
  })
})

describe('NumberInputBase — typing', () => {
  it('never lets a non-numeric entry produce NaN, and reverts it on blur', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 5 })
    await flush()

    type(input(), 'abc')
    await flush()
    expect(Number.isNaN(state().value())).toBe(false)
    expect(state().value()).toBe(5)
    expect(input().getAttribute('aria-valuenow')).toBe('5')
    // Free text survives while the field is being edited.
    expect(input().value).toBe('abc')

    blur(input())
    await flush()
    expect(input().value).toBe('5')
    unmount()
  })

  it('holds an unparseable half-typed entry without committing it', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 5 })
    await flush()
    // Number('-') / Number('1e') / Number('1.2.3') are NaN → hold, never commit.
    for (const partial of ['-', '1e', '1.2.3', '+', 'e5']) {
      type(input(), partial)
      await flush()
      expect(Number.isNaN(state().value())).toBe(false)
      expect(state().value()).toBe(5)
      expect(input().value).toBe(partial)
    }
    unmount()
  })

  it('commits a trailing-separator entry, which JS parses ("1." is 1)', async () => {
    // Not garbage: Number('1.') === 1. Committing live is correct — the text is
    // left alone so the user can carry on typing "1.5".
    const { input, state, unmount } = mountNumber({ defaultValue: 5 })
    await flush()
    type(input(), '1.')
    await flush()
    expect(state().value()).toBe(1)
    expect(input().value).toBe('1.')
    type(input(), '1.5')
    await flush()
    expect(state().value()).toBe(1.5)
    unmount()
  })

  it('an emptied field does not become NaN or 0', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 5 })
    await flush()
    type(input(), '')
    await flush()
    expect(state().value()).toBe(5)
    blur(input())
    await flush()
    expect(input().value).toBe('5')
    unmount()
  })

  it('commits a parsed value while typing', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 0, min: 0, max: 100 })
    await flush()
    type(input(), '42')
    await flush()
    expect(state().value()).toBe(42)
    expect(input().getAttribute('aria-valuenow')).toBe('42')
    unmount()
  })

  it('clamps typed text on every change and reformats it on blur', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 0, min: 0, max: 10 })
    await flush()
    type(input(), '15')
    await flush()
    expect(state().value()).toBe(10) // clamped immediately — ARIA can't exceed valuemax
    expect(input().getAttribute('aria-valuenow')).toBe('10')

    blur(input())
    await flush()
    expect(input().value).toBe('10')
    unmount()
  })

  it('reformats a canonically-odd entry on blur', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 0 })
    await flush()
    type(input(), '0015')
    await flush()
    expect(state().value()).toBe(15)
    blur(input())
    await flush()
    expect(input().value).toBe('15')
    unmount()
  })

  it('does not accept typed input when readOnly', async () => {
    const { input, state, unmount } = mountNumber({ defaultValue: 5, readOnly: true })
    await flush()
    type(input(), '9')
    await flush()
    expect(state().value()).toBe(5)
    unmount()
  })
})

describe('NumberInputBase — controlled mode', () => {
  it('reports through onChange and does not fight a parent that ignores it', async () => {
    const seen: number[] = []
    const { input, state, unmount } = mountNumber({
      value: 5,
      onChange: (v: number) => seen.push(v),
      min: 0,
      max: 10,
    })
    await flush()

    state().increment()
    await flush()
    expect(seen).toEqual([6])
    // The parent did not accept it → the primitive must NOT self-advance.
    expect(state().value()).toBe(5)
    expect(input().getAttribute('aria-valuenow')).toBe('5')
    expect(input().value).toBe('5')
    unmount()
  })

  it('follows a controlled parent that accepts the change', async () => {
    // `_rp` is exactly what the compiler emits for `value={sig()}` — makeReactiveProps
    // turns it into a live getter, so this is the real compiled-app shape.
    const parent = signal(5)
    const { input, state, unmount } = mountNumber({
      value: _rp(() => parent()) as unknown as number,
      onChange: (v: number) => parent.set(v),
      min: 0,
      max: 10,
    })
    await flush()
    expect(state().value()).toBe(5)

    state().increment()
    await flush()
    expect(parent()).toBe(6)
    expect(state().value()).toBe(6)
    expect(input().getAttribute('aria-valuenow')).toBe('6')
    expect(input().value).toBe('6')

    // A parent-driven change with no user interaction must also land.
    parent.set(2)
    await flush()
    expect(input().getAttribute('aria-valuenow')).toBe('2')
    expect(input().value).toBe('2')
    unmount()
  })

  it('does not re-emit onChange at a bound', async () => {
    const seen: number[] = []
    const { state, unmount } = mountNumber({
      defaultValue: 10,
      min: 0,
      max: 10,
      onChange: (v: number) => seen.push(v),
    })
    await flush()
    state().increment()
    state().increment()
    await flush()
    expect(seen).toEqual([])
    unmount()
  })
})

describe('NumberInputBase — rest forwarding', () => {
  it('forwards rest onto the directly-rendered input', async () => {
    // A primitive that drops `rest` throws away the consumer's rocketstyle
    // className → the component renders UNSTYLED.
    const { container, unmount } = mountInBrowser(
      h(NumberInputBase as never, {
        class: 'x',
        id: 'direct',
        'data-testid': 'qty',
        defaultValue: 1,
      }),
    )
    await flush()
    const el = container.querySelector('input') as HTMLInputElement
    expect(el.className).toBe('x')
    expect(el.id).toBe('direct')
    expect(el.getAttribute('data-testid')).toBe('qty')
    // …and the primitive's own semantics still win.
    expect(el.getAttribute('role')).toBe('spinbutton')
    expect(el.getAttribute('aria-valuenow')).toBe('1')
    unmount()
  })

  it('the directly-rendered input is fully live (no render-fn required)', async () => {
    const { container, unmount } = mountInBrowser(
      h(NumberInputBase as never, { class: 'x', defaultValue: 5, min: 0, max: 10 }),
    )
    await flush()
    const el = container.querySelector('input') as HTMLInputElement
    press(el, 'ArrowUp')
    await flush()
    expect(el.getAttribute('aria-valuenow')).toBe('6')
    expect(el.value).toBe('6')
    unmount()
  })

  it('overrides a consumer type="number" — the spinbutton design is not opt-out', async () => {
    const { container, unmount } = mountInBrowser(
      h(NumberInputBase as never, { type: 'number', defaultValue: 1 }),
    )
    await flush()
    expect((container.querySelector('input') as HTMLInputElement).getAttribute('type')).toBe('text')
    unmount()
  })
})
