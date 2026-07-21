/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for Table's `striped` / `simple` variants (2026-07-21
 * audit, roadmap B19): both were EMPTY objects — typed-but-unimplemented.
 * Now: default = subtle row dividers (market standard), `simple` = borderless,
 * `striped` = alternating body-row background (+ dividers).
 *
 * Computed-style assertions are real-Chromium-only (happy-dom re-runs this
 * file with no layout/cascade engine) — gated on __vitest_browser__.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'

declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__
import Table from '../components/Table'

const mountTable = (variant: string | undefined, testid: string) =>
  mountInBrowser(
    h(
      PyreonUI,
      { theme },
      h(
        Table as never,
        variant ? { variant, 'data-testid': testid } : { 'data-testid': testid },
        h(
          'tbody',
          {},
          h('tr', {}, h('td', {}, 'r1')),
          h('tr', {}, h('td', {}, 'r2')),
          h('tr', {}, h('td', {}, 'r3')),
        ),
      ),
    ),
  )

describe('Table variants (real Chromium)', () => {
  it.skipIf(!isBrowser)('striped: adjacent body rows have DIFFERENT backgrounds', async () => {
    const { container, unmount } = mountTable('striped', 'tb-striped')
    await flush()
    const rows = container.querySelectorAll('[data-testid="tb-striped"] tbody tr')
    expect(rows.length).toBe(3)
    const bg1 = getComputedStyle(rows[0] as Element).backgroundColor
    const bg2 = getComputedStyle(rows[1] as Element).backgroundColor
    expect(bg2, 'even row must be striped differently from odd').not.toBe(bg1)
    unmount()
  })

  it.skipIf(!isBrowser)('default has row dividers; simple removes them', async () => {
    const a = mountTable(undefined, 'tb-def')
    const b = mountTable('simple', 'tb-simple')
    await flush()
    const defRow = a.container.querySelector('[data-testid="tb-def"] tbody tr') as Element
    const simRow = b.container.querySelector('[data-testid="tb-simple"] tbody tr') as Element
    expect(
      Number.parseFloat(getComputedStyle(defRow).borderBottomWidth),
      'default rows carry a divider',
    ).toBeGreaterThan(0)
    expect(
      Number.parseFloat(getComputedStyle(simRow).borderBottomWidth),
      'simple rows are borderless',
    ).toBe(0)
    a.unmount()
    b.unmount()
  })
})
