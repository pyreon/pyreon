import { runUntracked } from '@pyreon/reactivity'
import type { TransitionCallbacks } from './types'

/**
 * Read a prop from its HOLDER at the moment of USE — never once at setup.
 *
 * This is the general form of the rule `showAccessorFrom` applies to one prop.
 * The compiler emits `timeout={ms}` / `onEnter={handler}` / `enter={cls}` in
 * member position as an `_rp` thunk that `makeReactiveProps` installs as a
 * GETTER on `props`; a component that destructures it, or copies it into a
 * config object at setup, fires that getter once and keeps the first value
 * forever. Nothing about the compiler's emission is specific to `show` — every
 * sibling prop carries the identical freeze, which is what this module closes.
 *
 * **Why UNTRACKED, and why that is the whole design.** `show` and everything
 * else are read under OPPOSITE tracking rules, and getting this backwards is a
 * worse bug than the freeze:
 *
 * - `show` is the state machine's INPUT. `showAccessorFrom` reads it TRACKED,
 *   because `watch(showAcc, …)` must re-run when it changes — that is how a
 *   flip starts an animation.
 * - Everything else is CONFIGURATION consumed *during* a cycle: the class list
 *   `applyEnter` adds, the shorthand `setTransition` writes, the deadline
 *   `useAnimationEnd` arms, the callback the stage watcher invokes. Those reads
 *   happen INSIDE `watch` callbacks, and `watch` runs its callback in the
 *   effect's tracking scope (`reactivity/src/watch.ts` — `callback(...)` is
 *   called from inside `effect(...)`). A tracked read there would subscribe the
 *   stage watcher to the config signal, so changing an easing string mid-flight
 *   would re-enter the watch callback and RESTART the animation — re-firing
 *   `onEnter`, re-adding `enterFrom`. That is not "live", it is a feedback loop.
 *
 * So the contract is: *the current value at the moment we use it, never a
 * dependency on it*. `runUntracked` is what buys the second half.
 *
 * The reads are cheap by construction — one untrack frame per animation phase
 * transition, not per frame and not per render.
 */
export const readLive = <T>(holder: object, key: string): T | undefined =>
  runUntracked(() => (holder as Record<string, unknown>)[key]) as T | undefined

/**
 * Read all four transition callbacks off a live holder in ONE untrack frame.
 *
 * A stale callback is the sharpest member of this class: it is invoked long
 * after setup (on a stage change, or on `transitionend` seconds later), so a
 * frozen one calls into the closure the parent had at mount — reading state
 * that has since moved, or writing to a store the parent has already replaced.
 * Unlike a frozen class name it produces no visual clue at all.
 */
export const readCallbacks = (holder: object): Partial<TransitionCallbacks> =>
  runUntracked(() => {
    const h = holder as Partial<TransitionCallbacks>
    return {
      onEnter: h.onEnter,
      onAfterEnter: h.onAfterEnter,
      onLeave: h.onLeave,
      onAfterLeave: h.onAfterLeave,
    }
  })

/**
 * Resolve a value that may arrive as a plain value or as an accessor.
 *
 * The internal renderers receive config from `createKineticComponent`, which
 * forwards an ACCESSOR for the props that must stay live (`timeout`,
 * `transition`, `unmount`) so the renderer can re-read them at its own point of
 * use. A plain value still works — the chain config (`.config({ timeout })`)
 * supplies those, and it is genuinely static.
 */
export const resolveLive = <T>(value: T | (() => T) | undefined): T | undefined =>
  typeof value === 'function' ? runUntracked(value as () => T) : value

/**
 * `readLive` + `resolveLive` in one untrack frame — for a prop whose declared
 * type admits BOTH a value and an accessor (`timeout`, and `show` via
 * `showAccessorFrom`).
 *
 * Kept separate from `readLive` rather than folded into it, because the
 * distinction is real: a CALLBACK prop's current value IS a function, and
 * auto-resolving there would invoke the handler at read time instead of
 * returning it. `readLive` therefore never resolves; this does.
 */
export const readLiveValue = <T>(holder: object, key: string): T | undefined =>
  runUntracked(() => {
    const v = (holder as Record<string, unknown>)[key]
    return (typeof v === 'function' ? (v as () => T)() : v) as T | undefined
  })

/**
 * Can this prop's value change after setup?
 *
 * True when the holder carries a GETTER for the key (what `makeReactiveProps`
 * installs for a compiler `_rp` thunk) or when the value is an accessor
 * function. Both are the shapes `readLive` / `readLiveValue` exist to serve.
 *
 * This exists so liveness can be paid for only where it is possible. Making a
 * `<Show>` fallback an accessor turns it into a nested reactive boundary — its
 * own `renderEffect`, `mountReactive`, comment marker and closure — per hidden
 * element; on a stagger with N hidden rows that is N of them, and for the
 * default static `unmount` every one of them exists to recompute a constant.
 * A static prop keeps the plain value and the boundary is never created.
 */
export const isDynamicProp = (holder: object, key: string): boolean =>
  Object.getOwnPropertyDescriptor(holder, key)?.get !== undefined ||
  typeof (holder as Record<string, unknown>)[key] === 'function'
