import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export type BreakpointMap = Record<string, number>

const defaultBreakpoints: BreakpointMap = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
}

function getActive(bps: [string, number][]): string {
  if (typeof window === 'undefined') return bps[0]?.[0] ?? ''
  const w = window.innerWidth
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
  const sorted = Object.entries(breakpoints).sort(([, a], [, b]) => a - b)
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
      if (rafId !== undefined) cancelAnimationFrame(rafId)
    }
  })

  return active
}
