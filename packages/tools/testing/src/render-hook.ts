/**
 * `renderHook(hook, { initialProps })` — run a Pyreon hook inside a probe
 * component and expose its return via `result.current`.
 *
 * SEMANTIC NOTE (differs from `@testing-library/react`'s renderHook by
 * design): Pyreon components — and hooks — run ONCE. The hook is invoked a
 * single time in the probe's setup; it is NOT re-invoked on `rerender`.
 * Instead the hook receives its props as a REACTIVE accessor (`() => props`),
 * and `rerender(next)` updates the backing signal — so a hook that reads
 * `props()` inside a `computed`/`effect` sees the new value through Pyreon's
 * fine-grained reactivity, exactly as it would in a real app. `result.current`
 * is a live getter, so if the hook returns signals/accessors, reading it after
 * a state change reflects the update.
 */
import { signal } from '@pyreon/reactivity'
import { render } from './render'

export interface RenderHookOptions<Props> {
  initialProps?: Props
}

export interface RenderHookResult<Result, Props> {
  /** Live getter for the hook's return value. */
  result: { readonly current: Result }
  /** Update the reactive props the hook was given; the hook is NOT re-invoked. */
  rerender: (props: Props) => void
  /** Unmount the probe component. */
  unmount: () => void
}

export function renderHook<Result, Props = undefined>(
  hook: (props: () => Props) => Result,
  options: RenderHookOptions<Props> = {},
): RenderHookResult<Result, Props> {
  const props = signal(options.initialProps as Props)
  let current!: Result

  function Probe() {
    current = hook(() => props())
    return null
  }

  const { unmount } = render(Probe as unknown as () => null)

  return {
    result: {
      get current() {
        return current
      },
    },
    rerender: (next: Props) => props.set(next),
    unmount,
  }
}
