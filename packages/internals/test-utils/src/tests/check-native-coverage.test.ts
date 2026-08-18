// check-native-coverage — the app-runtime multiplatform FINISH-LINE gate.
//
// Unit coverage for its PURE policy (classification + summary + registry
// invariants). The pure functions are called DIRECTLY with synthetic inputs —
// no subprocess fork, no `transform(...)` run (that is the gate's integration
// job) — see .claude/rules/anti-patterns.md "Subprocess testing as a default".

import { describe, expect, it } from 'vitest'
import {
  classifyEntry,
  REGISTRY,
  summarize,
  validateRegistry,
  WARN_ALLOWLIST,
  type EntryResult,
  type RegistryEntry,
  type SnippetOutcome,
} from '../../../../../scripts/check-native-coverage'

const zeroWarn = (name: string): SnippetOutcome => ({ name, warnings: 0, messages: [] })
const warns = (name: string, n = 1): SnippetOutcome => ({
  name,
  warnings: n,
  messages: ['X has no native lowering'],
})

describe('classifyEntry — pmtc-lowers', () => {
  const entry: RegistryEntry = { name: '@x/a', mechanism: 'pmtc-lowers', rationale: 'r', snippet: 's' }

  it('crosses when the snippet emits zero warnings', () => {
    const r = classifyEntry(entry, zeroWarn('@x/a'), undefined)
    expect(r.status).toBe('crosses')
    expect(r.detail).toContain('lowers clean through PMTC')
  })

  it('is a REGRESSION when the snippet starts warning (and is not allowlisted)', () => {
    const r = classifyEntry(entry, warns('@x/a'), undefined)
    expect(r.status).toBe('regression')
    expect(r.detail).toContain('warning')
  })
})

describe('classifyEntry — native-container', () => {
  const withSnippet: RegistryEntry = {
    name: '@x/store',
    mechanism: 'native-container',
    rationale: 'r',
    requiresCoSource: true,
    snippet: 's',
  }
  const coSourceOnly: RegistryEntry = {
    name: '@x/table',
    mechanism: 'native-container',
    rationale: 'r',
    requiresCoSource: true,
  }

  it('crosses when co-source is present AND the snippet is clean', () => {
    const r = classifyEntry(withSnippet, zeroWarn('@x/store'), true)
    expect(r.status).toBe('crosses')
    expect(r.detail).toContain('native runtime ships + authoring lowers clean')
  })

  it('crosses on co-source alone when there is no snippet', () => {
    const r = classifyEntry(coSourceOnly, undefined, true)
    expect(r.status).toBe('crosses')
    expect(r.detail).toContain('native runtime ships')
  })

  it('is a REGRESSION when the co-source vanished', () => {
    const r = classifyEntry(coSourceOnly, undefined, false)
    expect(r.status).toBe('regression')
    expect(r.detail).toContain('co-source')
  })

  it('is a REGRESSION when the bonus snippet warns even if co-source is fine', () => {
    const r = classifyEntry(withSnippet, warns('@x/store'), true)
    expect(r.status).toBe('regression')
  })
})

describe('classifyEntry — web-first', () => {
  const entry: RegistryEntry = {
    name: '@x/charts',
    mechanism: 'web-first',
    rationale: 'rich widget',
    snippet: 's',
  }

  it('is a tracked GAP (never a failure), even when its snippet warns', () => {
    const r = classifyEntry(entry, warns('@x/charts', 3), undefined)
    expect(r.status).toBe('gap')
    expect(r.detail).toContain('web-first')
  })

  it('stays a GAP but hints reclassification when the snippet stops warning', () => {
    const r = classifyEntry(entry, zeroWarn('@x/charts'), undefined)
    expect(r.status).toBe('gap')
    expect(r.detail).toContain('reclassif')
  })

  it('is a GAP with no snippet at all', () => {
    const noSnippet: RegistryEntry = {
      name: '@x/dnd',
      mechanism: 'web-first',
      rationale: 'pointer-driven',
    }
    expect(classifyEntry(noSnippet, undefined, undefined).status).toBe('gap')
  })
})

describe('summarize', () => {
  it('counts crossings, gaps and regressions and lists them', () => {
    const results: EntryResult[] = [
      { name: '@x/a', mechanism: 'pmtc-lowers', status: 'crosses', detail: 'ok' },
      { name: '@x/b', mechanism: 'native-container', status: 'crosses', detail: 'ok' },
      { name: '@x/c', mechanism: 'web-first', status: 'gap', detail: 'arc open' },
      { name: '@x/d', mechanism: 'pmtc-lowers', status: 'regression', detail: 'warns' },
    ]
    const s = summarize(results)
    expect(s.total).toBe(4)
    expect(s.crossing).toBe(2)
    expect(s.gaps).toBe(1)
    expect(s.regressions).toBe(1)
    expect(s.openGaps).toEqual(['@x/c — arc open'])
    expect(s.regressed).toEqual(['@x/d — warns'])
  })
})

describe('validateRegistry — invariants', () => {
  it('the REAL registry is internally consistent', () => {
    expect(validateRegistry(REGISTRY)).toEqual([])
  })

  it('flags a native-container entry that forgot requiresCoSource', () => {
    const errs = validateRegistry([
      { name: '@x/a', mechanism: 'native-container', rationale: 'r' },
    ])
    expect(errs.some((e) => e.includes('requiresCoSource'))).toBe(true)
  })

  it('flags a web-first entry that wrongly requires co-source', () => {
    const errs = validateRegistry([
      { name: '@x/a', mechanism: 'web-first', rationale: 'r', requiresCoSource: true },
    ])
    expect(errs.some((e) => e.includes('web-first'))).toBe(true)
  })

  it('flags a pmtc-lowers entry with no snippet (its crossing proof)', () => {
    const errs = validateRegistry([{ name: '@x/a', mechanism: 'pmtc-lowers', rationale: 'r' }])
    expect(errs.some((e) => e.includes('snippet'))).toBe(true)
  })

  it('flags a duplicate registry entry', () => {
    const errs = validateRegistry([
      { name: '@x/a', mechanism: 'pmtc-lowers', rationale: 'r', snippet: 's' },
      { name: '@x/a', mechanism: 'pmtc-lowers', rationale: 'r', snippet: 's' },
    ])
    expect(errs.some((e) => e.includes('duplicate'))).toBe(true)
  })
})

describe('the real REGISTRY', () => {
  it('carries the shared + service-backend tiers plus the partial set (37 packages)', () => {
    expect(REGISTRY.length).toBe(37)
  })

  it('starts with an EMPTY warn-allowlist — the ratchet is at its tightest', () => {
    expect(Object.keys(WARN_ALLOWLIST)).toEqual([])
  })

  it('every native-container entry requires co-source; every web-first entry does not', () => {
    for (const e of REGISTRY) {
      if (e.mechanism === 'native-container') expect(e.requiresCoSource).toBe(true)
      if (e.mechanism === 'web-first') expect(e.requiresCoSource).toBeUndefined()
    }
  })
})
