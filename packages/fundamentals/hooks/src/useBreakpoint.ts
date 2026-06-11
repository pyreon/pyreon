import { onMount } from '@pyreon/core'
import { isServer, signal } from '@pyreon/reactivity'

export type BreakpointMap = Record<string, number>

const defaultBreakpoints: BreakpointMap = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
}

function getActive(bps: [string, number][]): string {
  /* v8 ignore next — SSR/isServer guard; tests always run with happy-dom */
  if (isServer) return bps[0]?.[0] ?? ''
  const w = window.innerWidth
  /* v8 ignore next — defensive empty-bps fallback; bps is built from a typed BreakpointMap */
  let result = bps[0]?.[0] ?? ''
  for (const [name, min] of bps) {
    if (w >= min) result = name
    else break
  }
  return result
}

/**
 * Return the currently active breakpoint name as a reactive signal.
 */
export function useBreakpoint(breakpoints: BreakpointMap = defaultBreakpoints): () => string {
  // Build the [name, min] tuples directly from a for-in scan instead of
  // `Object.entries(...).sort(...)`. Skips the intermediate entries
  // tuple-array allocation. Fires once per useBreakpoint call (per
  // component mount that uses it). Ported from vitus-labs `4549648a`;
  // measured upstream: +80.3% on 5-breakpoint input.
  const sorted: [string, number][] = []
  for (const name in breakpoints) {
    const value = breakpoints[name]
    /* v8 ignore next — defensive typeof check; type system constrains breakpoint values to numbers */
    if (typeof value === 'number') sorted.push([name, value])
  }
  sorted.sort(([, a], [, b]) => a - b)
  const active = signal(getActive(sorted))

  // Listener defined inside onMount so its `requestAnimationFrame` /
  // `cancelAnimationFrame` references are co-located with their
  // browser-only registration. Cleanup returns from `onMount`.
  onMount(() => {
    let rafId: number | undefined
    const onResize = () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const next = getActive(sorted)
        if (next !== active.peek()) active.set(next)
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      /* v8 ignore next — defensive cleanup guard; rafId state at unmount is unmount-time dependent */
      if (rafId !== undefined) cancelAnimationFrame(rafId)
    }
  })

  return active
}
