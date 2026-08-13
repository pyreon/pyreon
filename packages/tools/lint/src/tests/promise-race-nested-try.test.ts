/**
 * An OUTER try/catch wrapping a correctly-guarded inner try/finally was reported
 * as leaking. The rule's header already said nested tries own their own finally
 * requirement and are visited separately — the walk just didn't honour it.
 *
 * This is the shape in runtime-server's Suspense timeout and ssg-plugin's
 * prerender timeout: both hoist the timer id and clear it in `finally`.
 */
import { describe, expect, it } from 'vitest'
import { promiseRaceNeedsCleartimeout } from '../rules/performance/promise-race-needs-cleartimeout'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const RULE_ID = 'pyreon/promise-race-needs-cleartimeout'
const CONFIG: LintConfig = { rules: { [RULE_ID]: 'warn' } }
const lint = (src: string) =>
  lintFile('/abs/src/x.ts', src, [promiseRaceNeedsCleartimeout], CONFIG).diagnostics.filter(
    (d) => d.ruleId === RULE_ID,
  )

const GUARDED_INNER = `
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      result = await Promise.race([
        work(),
        new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('t')), 30) }),
      ])
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }`

describe('promise-race-needs-cleartimeout — nested try', () => {
  it('does NOT fire on a guarded try (control)', () => {
    expect(lint(`async function f() { let result; ${GUARDED_INNER} return result }`)).toHaveLength(0)
  })

  it('does NOT fire when an OUTER try/catch wraps the guarded inner try', () => {
    expect(
      lint(`async function f() {
        let result
        try {${GUARDED_INNER}
        } catch { result = 'err' }
        return result
      }`),
    ).toHaveLength(0)
  })

  it('STILL fires when the race has no clearTimeout anywhere', () => {
    // Guards the skip from being over-broad — a genuinely leaking race in an
    // outer try must still report.
    expect(
      lint(`async function f() {
        try {
          return await Promise.race([
            work(),
            new Promise((_, reject) => { setTimeout(() => reject(new Error('t')), 30) }),
          ])
        } finally { done() }
      }`).length,
    ).toBeGreaterThan(0)
  })
})
