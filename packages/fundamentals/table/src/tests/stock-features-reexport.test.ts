// The manifest (and so llms.txt, the MCP reference and the docs) claims the
// package re-exports "all N features" of TanStack Table. The runtime list is
// curated by hand, so the claim and the list could both drift from
// table-core's own `stockFeatures` without anything failing. This pins all
// three to the source of truth.
import { stockFeatures as upstream } from '@tanstack/table-core'
import { describe, expect, it } from 'vitest'
import * as table from '../index'
import manifest from '../manifest'

describe('TanStack stock features', () => {
  const names = Object.keys(upstream)

  it('every stock feature is re-exported from @pyreon/table', () => {
    const missing = names.filter((n) => !(n in table))
    expect(missing).toEqual([])
  })

  it('the manifest states the real feature count', () => {
    const text = JSON.stringify(manifest)
    const claims = [...text.matchAll(/all (\d+) features/g)].map((m) => Number(m[1]))
    expect(claims.length).toBeGreaterThan(0)
    for (const n of claims) expect(n).toBe(names.length)
  })
})
