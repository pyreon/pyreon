/**
 * Warm-mount counters for two ui-system cache levers (load-independent):
 *
 * 1. A fresh `<PyreonUI>` with the SAME raw theme object (one per SSR request,
 *    or a remount) reuses the enriched theme (`enrichTheme` identity memo), so
 *    every theme-keyed style cache below it hits: the second provider's
 *    subtree runs ZERO `styler.resolve` and ZERO `unistyle.styles`. (Once the
 *    styler's `$element` cache is keyed on the theme, this spec also depends
 *    on the enrichTheme memo; the rocketstyle-level lock is
 *    `rocketstyle/src/__tests__/stable-theme-across-providers.test.ts`.)
 * 2. `Text` interns its `$text` bundle (`internTextBundle`), so a warm Text
 *    mount hits the styler class cache instead of re-running the CSS pipeline.
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { PyreonUI } from '@pyreon/ui-core'
import { afterEach, describe, expect, it } from 'vitest'
import { Element } from '../Element'
import { Text } from '../Text'

type CountSink = ((name: string, n?: number) => void) | undefined
const g = globalThis as { __pyreon_count__?: CountSink }

const counting = (): { counts: Record<string, number>; reset: () => void; restore: () => void } => {
  const counts: Record<string, number> = {}
  const prev = g.__pyreon_count__
  g.__pyreon_count__ = (name, n = 1) => {
    counts[name] = (counts[name] ?? 0) + n
  }
  return {
    counts,
    reset: () => {
      for (const k of Object.keys(counts)) delete counts[k]
    },
    restore: () => {
      g.__pyreon_count__ = prev
    },
  }
}

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})
const mountOnce = (vnode: ReturnType<typeof h>): void => {
  cleanups.push(mountReactive(vnode).cleanup)
}

const theme = { rootSize: 16, breakpoints: { xs: 0, sm: 576, md: 768 } }
const page = () =>
  h(
    PyreonUI as never,
    { theme },
    h(Element as never, { tag: 'section', block: true, gap: 8, content: 'body' }),
    h(Text as never, { paragraph: true }, 'hello'),
  )

describe('stable enriched theme — a second <PyreonUI> is fully warm', () => {
  it('the second provider mount with the same theme object resolves nothing', () => {
    const c = counting()
    try {
      mountOnce(page())
      expect(c.counts['styler.resolve'] ?? 0).toBeGreaterThan(0) // cold
      c.reset()

      mountOnce(page())
      expect(c.counts['styler.resolve'] ?? 0).toBe(0)
      expect(c.counts['unistyle.styles'] ?? 0).toBe(0)
    } finally {
      c.restore()
    }
  })
})

describe('Text — warm mounts hit the class cache', () => {
  const warmResolves = (props: Record<string, unknown>): { cold: number; warm: number } => {
    const c = counting()
    try {
      const themeObj = { rootSize: 16 }
      mountOnce(h(PyreonUI as never, { theme: themeObj }, h(Text as never, props, 'cold')))
      const cold = c.counts['styler.resolve'] ?? 0
      c.reset()
      const texts = Array.from({ length: 20 }, (_, i) => h(Text as never, props, `t${i}`))
      mountOnce(h(PyreonUI as never, { theme: themeObj }, ...texts))
      expect(c.counts['styler.elClassCache.hit'] ?? 0).toBeGreaterThanOrEqual(20)
      return { cold, warm: c.counts['styler.resolve'] ?? 0 }
    } finally {
      c.restore()
    }
  }

  it('no css: 20 warm Text mounts resolve nothing', () => {
    // (The cold count may already be 0: an earlier test resolved the shared
    // no-css bundle.)
    const { warm } = warmResolves({})
    expect(warm).toBe(0)
  })

  it('a static string css is interned too: 20 warm mounts resolve nothing', () => {
    const { cold, warm } = warmResolves({ css: 'letter-spacing: 1px;' })
    expect(cold).toBeGreaterThan(0)
    expect(warm).toBe(0)
  })
})
