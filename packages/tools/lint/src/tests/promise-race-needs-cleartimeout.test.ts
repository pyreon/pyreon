/**
 * Tests for `pyreon/promise-race-needs-cleartimeout`.
 *
 * Distilled from the post-#725 leak-class sweep across the framework:
 *
 * - #734: `@pyreon/zero` `isr.ts` `revalidate()` 30s setTimeout orphaned
 *   per successful revalidation.
 * - #735: `@pyreon/zero` `ssg-plugin.ts` per-path render + per-locale 404
 *   render, same 30s setTimeout orphan pattern (×2).
 *
 * Every site had the same shape: `await Promise.race([work, new Promise
 * ((_, reject) => setTimeout(reject, MS))])` without `clearTimeout` in a
 * `finally`. The rule catches this BEFORE the leak ships.
 */
import { promiseRaceNeedsCleartimeout } from '../rules/performance/promise-race-needs-cleartimeout'
import { lintFile } from '../runner'

const RULE = 'pyreon/promise-race-needs-cleartimeout'

function lintOne(source: string, filePath = 'src/handler.ts') {
  return lintFile(filePath, source, [promiseRaceNeedsCleartimeout], {
    rules: { [RULE]: 'warn' },
  }).diagnostics.map((d) => d.ruleId)
}

describe('pyreon/promise-race-needs-cleartimeout — FIRES', () => {
  it('canonical leak shape (isr.ts pre-#734)', () => {
    const src = `
async function revalidate() {
  try {
    const res = await Promise.race([
      handler(req),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 30_000)
      ),
    ])
    return res
  } catch {
    /* swallow */
  } finally {
    /* note: no clearTimeout — pre-#734 shape */
    revalidating.delete(key)
  }
}`
    expect(lintOne(src)).toContain(RULE)
  })

  it('try with NO finally block at all', () => {
    const src = `
async function go() {
  try {
    const res = await Promise.race([
      work(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10_000)
      ),
    ])
    return res
  } catch {
    /* nothing */
  }
}`
    expect(lintOne(src)).toContain(RULE)
  })

  it('ssg-plugin shape (renderPath with multi-line setTimeout)', () => {
    const src = `
async function renderOne(p) {
  try {
    const result = await Promise.race([
      renderPath(p),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Prerender timeout for "' + p + '" (30s)')),
          30_000
        )
      ),
    ])
    return result
  } catch (error) {
    errors.push({ path: p, error })
  } finally {
    cleanupTracking(p)
  }
}`
    expect(lintOne(src)).toContain(RULE)
  })
})

describe('pyreon/promise-race-needs-cleartimeout — DOES NOT FIRE', () => {
  it('finally contains clearTimeout — fix applied', () => {
    const src = `
async function revalidate() {
  let timeoutId
  try {
    const res = await Promise.race([
      handler(req),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), 30_000)
      }),
    ])
    return res
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    revalidating.delete(key)
  }
}`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('Promise.race without a setTimeout branch (fetch race, etc.)', () => {
    const src = `
async function firstResponse(urls) {
  try {
    return await Promise.race(urls.map(u => fetch(u)))
  } catch {
    return null
  }
}`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('plain setTimeout outside Promise.race (not a race timeout)', () => {
    const src = `
function debounce(fn, ms) {
  let t
  return () => {
    clearTimeout(t)
    t = setTimeout(fn, ms)
  }
}`
    expect(lintOne(src)).not.toContain(RULE)
  })

  it('Promise.race used as a non-timeout primitive (no try/catch)', () => {
    // Without a wrapping try, the rule does not fire — it only audits
    // try blocks. A bare Promise.race-with-timeout is a code smell but
    // belongs to a separate "you should be in try/finally" rule.
    const src = `
const result = await Promise.race([work(), neverRace()])
return result`
    expect(lintOne(src)).not.toContain(RULE)
  })
})
