// @vitest-environment node
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { sheet } from '@pyreon/styler'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ParamGrid } from './style-modifier.fixture'

/**
 * `.params()` through the real `h()` and the server renderer: the mapped
 * slice lands in the component's own rocketstyle class (responsive values as
 * media rules), the param never reaches the HTML, and equal values share one
 * memo entry and one class.
 */
const counts: Record<string, number> = {}
const sink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

beforeEach(() => {
  sheet.reset()
  for (const k of Object.keys(counts)) delete counts[k]
  sink.__pyreon_count__ = (name, n = 1) => {
    counts[name] = (counts[name] ?? 0) + n
  }
})

afterEach(() => {
  delete sink.__pyreon_count__
})

const render = async (...nodes: unknown[]) => renderToString(h(PyreonUI, { theme }, ...(nodes as never[])))
const rsClasses = (html: string) => [...html.matchAll(/class="pyr-[a-z0-9]+ (pyr-[a-z0-9]+)"/g)].map((m) => m[1])

const css = () => {
  const tag = sheet.getStyleTag()
  return tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</style>'))
}

describe('.params() (SSR, real h())', () => {
  it('renders the mapped value, per breakpoint, in the rocketstyle class; no DOM attribute', async () => {
    const html = await render(h(ParamGrid, { id: 'g', columns: [1, null, 3], gapPx: { md: 12 } }))
    const [cls] = rsClasses(html)
    const out = css()
    expect(out).toContain(`.${cls}{display: grid; grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 0.25rem;`)
    expect(out).toContain(
      `@layer rocketstyle{@media only screen and (min-width: 48em){.${cls}{grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem;}}}`,
    )
    expect(html).not.toMatch(/columns=|gapPx=|gappx=/i)
  })

  it('1,000 instances with equal values: one class, one theme resolution', async () => {
    const nodes = Array.from({ length: 1000 }, () => h(ParamGrid, { columns: { xs: 1, md: 3 } }))
    const html = await render(...nodes)
    expect(new Set(rsClasses(html)).size).toBe(1)
    expect(counts['rocketstyle.getTheme']).toBe(1)
    expect(counts['rocketstyle.dimensionMemo.hit']).toBeGreaterThanOrEqual(999)
  })

  it('1,000 distinct values: 1,000 classes, and the memo stays bounded (the first value is evicted)', async () => {
    const nodes = Array.from({ length: 1000 }, (_, i) => h(ParamGrid, { gapPx: i }))
    const html = await render(...nodes)
    expect(new Set(rsClasses(html)).size).toBe(1000)
    expect(counts['rocketstyle.getTheme']).toBe(1000)
    // The per-theme memo is an LRU of 128: value 0 was evicted, value 999 was not.
    const before = counts['rocketstyle.getTheme'] ?? 0
    await render(h(ParamGrid, { gapPx: 999 }))
    expect(counts['rocketstyle.getTheme']).toBe(before)
    await render(h(ParamGrid, { gapPx: 0 }))
    expect(counts['rocketstyle.getTheme']).toBe(before + 1)
  })
})
