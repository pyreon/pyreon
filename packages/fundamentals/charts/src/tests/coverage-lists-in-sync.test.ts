/**
 * A file excluded from node coverage must be measured by the browser gate.
 *
 * `vitest.config.ts` excludes the plot PLATFORM files because they need a real
 * canvas 2D context, and it justifies that by pointing at the browser gate:
 * "an exclusion here is never an unverified promise. Keep the two lists in
 * sync." `vitest.browser.config.ts` repeats it: "a host excluded from node
 * coverage and absent here is measured NOWHERE."
 *
 * Both notes were right about the risk and both were folklore — nothing
 * checked it, and the lists had already drifted: `src/chart-component.tsx`
 * and `src/use-chart.ts` were excluded from node and absent from the browser
 * include, so 512 lines were measured by neither run while both configs
 * carried comments claiming the other one covered them. That is worse than an
 * ordinary gap, because the exclusion comment reads as evidence.
 *
 * This is the check those two comments describe. It is deliberately
 * one-directional: node-excluded MUST be browser-included, while the reverse
 * is fine — a file measured by both runs is merely measured twice, and the
 * browser list legitimately carries entries the node run also covers.
 *
 * Parsing the configs as TEXT rather than importing them is intentional.
 * Importing `vitest.browser.config.ts` pulls in `@vitest/browser-playwright`,
 * which is a browser-only dependency this node suite must not load; and the
 * lists are literal string arrays, so reading them is exact.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PKG_ROOT = join(import.meta.dirname, '../..')

/** The string literals of the first array following `key` in a config file. */
function stringArrayAfter(file: string, key: string): string[] {
  const src = readFileSync(join(PKG_ROOT, file), 'utf-8')
  const start = src.indexOf(key)
  if (start === -1) throw new Error(`${file}: no ${key} found`)
  const open = src.indexOf('[', start)
  const close = src.indexOf(']', open)
  if (open === -1 || close === -1) throw new Error(`${file}: ${key} is not an array literal`)
  return [...src.slice(open, close).matchAll(/'([^']+)'/g)].map((m) => m[1]!)
}

const nodeExcluded = stringArrayAfter('vitest.config.ts', 'coverageExclude:')
const browserIncluded = stringArrayAfter('vitest.browser.config.ts', 'include:')

describe('node coverageExclude ⇄ browser coverage include', () => {
  it('parsed both lists — a silent parse failure would make this vacuous', () => {
    // Without this the whole suite passes when a refactor renames a key and
    // both lists come back empty, which is the shape it exists to prevent.
    expect(nodeExcluded.length, 'node coverageExclude parsed empty').toBeGreaterThan(10)
    expect(browserIncluded.length, 'browser coverage include parsed empty').toBeGreaterThan(10)
  })

  it('measures every node-excluded file in the browser run', () => {
    const nowhere = nodeExcluded.filter((f) => !browserIncluded.includes(f))
    expect(
      nowhere,
      `excluded from node coverage AND absent from the browser coverage include, ` +
        `so measured NOWHERE: ${nowhere.join(', ')}. Either add them to ` +
        `vitest.browser.config.ts's coverage.include, or stop excluding them in ` +
        `vitest.config.ts — the node run may well cover them.`,
    ).toEqual([])
  })

  it('every listed path points at a file that exists', () => {
    // A stale entry is silent in both directions: an exclusion for a deleted
    // file protects nothing, and an include for one measures nothing.
    const { existsSync } = require('node:fs') as typeof import('node:fs')
    const missing = [...new Set([...nodeExcluded, ...browserIncluded])].filter(
      (f) => !f.includes('*') && !existsSync(join(PKG_ROOT, f)),
    )
    expect(missing, `listed in a coverage config but not on disk: ${missing.join(', ')}`).toEqual([])
  })
})
