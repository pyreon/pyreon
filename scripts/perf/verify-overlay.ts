#!/usr/bin/env bun
/**
 * Standalone verifier for the overlay in a REAL Chromium (not happy-dom).
 *
 * Boots perf-dashboard's dev server, opens it in headless Chromium, calls
 * `perfHarness.overlay()` via the page's global, and asserts:
 *   - The shadow-root host element is attached to document.body
 *   - The overlay's <style> + table are inside the shadow root
 *   - The filter chips are rendered
 *   - Counter rows render with real counter data
 *   - Clicking the reset button clears the rows
 *   - Ctrl+Shift+P toggles visibility
 *
 * This is the missing real-browser proof — the in-package overlay tests
 * run under happy-dom, which doesn't catch things like shadow-DOM CSS
 * bleed, real keyboard-event bubbling, or actual CSS layout.
 *
 * Run with:  bun run scripts/perf/verify-overlay.ts
 * Exits 0 on success, non-zero with a clear message otherwise.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'
import { startServer as startViteServer } from './server'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')
const APP = 'perf-dashboard'

async function assert(cond: unknown, message: string): Promise<void> {
  if (!cond) throw new Error(`assertion failed: ${message}`)
  process.stderr.write(`  ✓ ${message}\n`)
}

async function main() {
  const server = await startViteServer({ repoRoot: REPO_ROOT, app: APP, mode: 'dev' })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto(server.url, { waitUntil: 'networkidle', timeout: 15_000 })

    // Harness should be installed (main.tsx calls install() in dev).
    const installed = await page.evaluate(() =>
      typeof (window as { __pyreon_perf__?: unknown }).__pyreon_perf__ !== 'undefined',
    )
    await assert(installed, 'window.__pyreon_perf__ installed by main.tsx')

    // Mount the overlay. perfHarness.overlay() returns an OverlayHandle.
    await page.evaluate(() => {
      const w = window as {
        __pyreon_perf__: { overlay: () => unknown }
      }
      w.__pyreon_perf__.overlay()
    })

    // Host + shadow root attached?
    const hostPresent = await page.evaluate(() => {
      const host = document.querySelector('[data-pyreon-perf-overlay-host]')
      return host !== null && host.shadowRoot !== null
    })
    await assert(hostPresent, 'overlay host + shadow root attached to document.body')

    // Rows rendered with real counter data?
    interface RowProbe {
      count: number
      hasStyler: boolean
      hasRuntime: boolean
    }
    const rowProbe = await page.evaluate((): RowProbe => {
      const host = document.querySelector('[data-pyreon-perf-overlay-host]') as HTMLElement
      const root = (host.shadowRoot as ShadowRoot)
      const rows = Array.from(root.querySelectorAll('tbody tr'))
      const names = rows.map((r) => r.querySelector('.name')?.textContent ?? '')
      return {
        count: rows.length,
        hasStyler: names.some((n) => n.startsWith('styler.')),
        hasRuntime: names.some((n) => n.startsWith('runtime.')),
      }
    })
    await assert(rowProbe.count > 0, `overlay renders ${rowProbe.count} rows of real counter data`)
    await assert(rowProbe.hasStyler, 'at least one styler.* counter visible')
    await assert(rowProbe.hasRuntime, 'at least one runtime.* counter visible')

    // Filter chips rendered?
    const chipCount = await page.evaluate(() => {
      const host = document.querySelector('[data-pyreon-perf-overlay-host]') as HTMLElement
      return (host.shadowRoot as ShadowRoot).querySelectorAll('.chip').length
    })
    await assert(chipCount >= 6, `filter chips rendered (${chipCount} chips)`)

    // Reset button clears rows.
    await page.evaluate(() => {
      const host = document.querySelector('[data-pyreon-perf-overlay-host]') as HTMLElement
      ;((host.shadowRoot as ShadowRoot).querySelector('.btn-reset') as HTMLButtonElement).click()
    })
    await page.waitForTimeout(100) // let rAF tick
    const rowsAfterReset = await page.evaluate(() => {
      const host = document.querySelector('[data-pyreon-perf-overlay-host]') as HTMLElement
      return (host.shadowRoot as ShadowRoot).querySelectorAll('tbody tr').length
    })
    await assert(rowsAfterReset === 0, `reset button cleared rows (now ${rowsAfterReset})`)

    // Ctrl+Shift+P toggles visibility.
    await page.keyboard.press('Control+Shift+P')
    await page.waitForTimeout(100)
    const hiddenAfterKey = await page.evaluate(() => {
      const host = document.querySelector('[data-pyreon-perf-overlay-host]') as HTMLElement
      const panel = (host.shadowRoot as ShadowRoot).querySelector('.panel') as HTMLElement
      return panel.style.display === 'none'
    })
    await assert(hiddenAfterKey, 'Ctrl+Shift+P hides the panel')

    await page.keyboard.press('Control+Shift+P')
    await page.waitForTimeout(100)
    const shownAgain = await page.evaluate(() => {
      const host = document.querySelector('[data-pyreon-perf-overlay-host]') as HTMLElement
      const panel = (host.shadowRoot as ShadowRoot).querySelector('.panel') as HTMLElement
      return panel.style.display !== 'none'
    })
    await assert(shownAgain, 'Ctrl+Shift+P shows the panel again')

    process.stderr.write('\n[verify-overlay] all checks passed ✓\n')
  } catch (err) {
    process.stderr.write(`\n[verify-overlay] FAILED: ${String(err)}\n`)
    await browser.close()
    await server.stop()
    process.exit(1)
  }

  await browser.close()
  await server.stop()
}

main().catch((err) => {
  console.error(String(err))
  process.exit(1)
})
