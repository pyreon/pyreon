/**
 * The correctness gate for one built, served arm. Used by `gate.ts` (alone, in
 * CI) and by `bench.ts` (before any number is taken from an arm). It records
 * no timing.
 *
 *  1. every direct load (`directLoads()`: the list, a deep-linked detail, the
 *     form, an unknown id, a non-numeric id, an unknown path) renders the
 *     expected DOM in a fresh page;
 *  2. one page runs the scripted session twice (`buildSession(1)`, then
 *     `buildSession(2)`): search, filter, sort, paginate, favourite, open the
 *     detail, unfavourite, come back with the filters and page kept, re-sort
 *     (back to page 1), submit the form
 *     empty, fix it field by field, create a product, find it in the list,
 *     reset. Every expectation is computed from shared/data.ts, so an arm that
 *     skips work, shows a stale value or drops state fails;
 *  3. no uncaught page error and no console error anywhere in it.
 */
import type { Browser, Page } from 'playwright'
import { buildSession, directLoads, runSteps, type Step } from './session'

export const STEP_TIMEOUT_MS = 10_000

export async function gateArm(browser: Browser, base: string): Promise<string[]> {
  const failures: string[] = []
  const watch = (page: Page) => {
    page.on('pageerror', (e) => failures.push(`page error on ${page.url()}: ${e.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') failures.push(`console error on ${page.url()}: ${msg.text()}`)
    })
  }

  for (const load of directLoads()) {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    watch(page)
    try {
      await page.goto(`${base}${load.path}`, { waitUntil: 'load' })
      const steps: Step[] = [{ label: `load ${load.path}`, act: [], expect: load.expect }]
      const r = await page.evaluate(runSteps, { steps, timeoutMs: STEP_TIMEOUT_MS })
      if (r.failure) failures.push(r.failure)
    } catch (e) {
      failures.push(`load ${load.path}: ${String(e)}`)
    } finally {
      await ctx.close()
    }
  }

  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  watch(page)
  try {
    await page.goto(`${base}/products`, { waitUntil: 'load' })
    // Client-side routing is part of the contract: the session must never
    // replace the document. A marker on window survives only if it does not.
    await page.evaluate(() => {
      ;(window as unknown as { __RB_GATE_DOC__: boolean }).__RB_GATE_DOC__ = true
    })
    for (const k of [1, 2]) {
      const r = await page.evaluate(runSteps, {
        steps: buildSession(k),
        timeoutMs: STEP_TIMEOUT_MS,
      })
      if (r.failure) {
        failures.push(`session ${k}: ${r.failure}`)
        break
      }
    }
  } catch (e) {
    // A full page load in the middle of a step (a link the router did not
    // intercept, a form the arm did not prevent) destroys the evaluation context.
    failures.push(`session: ${String(e)}`)
  }
  try {
    // A navigation may still be in flight: retry until a document answers.
    let same: boolean | null = null
    for (let i = 0; i < 20 && same === null; i++) {
      await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {})
      same = await page
        .evaluate(
          () => (window as unknown as { __RB_GATE_DOC__?: boolean }).__RB_GATE_DOC__ === true,
        )
        .catch(() => null)
      if (same === null) await page.waitForTimeout(250)
    }
    if (same !== true) {
      failures.push(
        `the session replaced the document (a full page load, now at ${new URL(page.url()).pathname}): ` +
          'a link or form the router did not intercept',
      )
    }
  } finally {
    await ctx.close()
  }
  return failures
}
