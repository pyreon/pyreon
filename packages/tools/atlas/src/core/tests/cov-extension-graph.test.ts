/**
 * Two small shape-guards whose remaining arms are the ones a real typo hits.
 *
 * `validateExtension` exists because a malformed entry MOUNTS as a component
 * and takes every scenario down with it — the most expensive possible failure
 * from the cheapest possible typo. Each rejected shape below is one a config
 * author actually writes.
 *
 * The graph's qualifier escalation is the other half: a component with no
 * source on record cannot be told apart from its namesakes, and the documented
 * answer there is the last-wins fallback — NOT a fabricated qualifier, which
 * would key a component under a name nothing else can look up.
 */
import { describe, expect, it } from 'vitest'
import { validateExtension, validateExtensions } from '../extension'
import { createCatalogGraph } from '../graph'
import { componentKey } from '../identity'
import type { ComponentIntelligence } from '../types'

describe('validateExtension — the non-object shapes', () => {
  it('rejects NULL, which `typeof` alone calls an object', () => {
    // `typeof null === 'object'`. Without the explicit null arm this would be
    // read for a `.name` and throw inside the validator itself.
    expect(validateExtension(null, 0)).toContain('must be an object')
  })

  it('rejects an ARRAY — a list of extensions passed where one was expected', () => {
    // The copy-paste shape: `extensions: [[a, b]]`. An array has no `name`, so
    // without this arm the message would be about a missing name rather than
    // about the nesting that caused it.
    expect(validateExtension([{ name: 'a', setup: () => {} }], 2)).toContain(
      '`extensions[2]` must be an object',
    )
  })

  it('rejects a primitive', () => {
    expect(validateExtension('theme', 0)).toContain('must be an object')
    expect(validateExtension(undefined, 0)).toContain('must be an object')
  })

  it('rejects an EMPTY name as firmly as a missing one', () => {
    // An empty string passes `typeof === 'string'`, and an extension named ''
    // is unattributable in every message that follows.
    expect(validateExtension({ name: '', setup: () => {} }, 0)).toContain('non-empty string')
  })

  it('rejects a non-function `setup`, naming the extension', () => {
    // The sibling of the `wrap` arm. Calling a non-function setup throws
    // inside the workbench boot, far from the config line that caused it.
    const problem = validateExtension({ name: 'theme', setup: { run: true } }, 1)
    expect(problem).toContain('`setup` must be a function')
    expect(problem, 'and say WHICH extension').toContain('theme')
  })

  it('accepts an extension carrying BOTH hooks', () => {
    expect(validateExtension({ name: 'both', wrap: () => null, setup: () => {} }, 0)).toBeUndefined()
  })
})

describe('validateExtensions — the list', () => {
  it('reports the FIRST bad entry and stops, rather than a wall of problems', () => {
    // One malformed entry usually explains the rest.
    const problem = validateExtensions([
      { name: 'ok', setup: () => {} },
      null,
      { name: 'also bad' },
    ])
    expect(problem).toContain('`extensions[1]`')
  })
})

describe('the graph qualifier — when there is nothing to qualify WITH', () => {
  const comp = (name: string, source?: string): ComponentIntelligence =>
    ({
      name,
      controls: [],
      axes: [],
      scenarios: [],
      tags: [],
      ...(source ? { source } : {}),
    }) as ComponentIntelligence

  it('falls back to last-wins for a namesake with NO source on record', () => {
    // Two `Glyph`s already split into qualified keys, so the bare key is not
    // free. A third with no source has no directory and no filename to
    // escalate with — inventing one would key it under a name nothing can
    // look up, so the documented last-wins fallback stands.
    const graph = createCatalogGraph([
      comp('Glyph', 'g/A.tsx'),
      comp('Glyph', 'g/B.tsx'),
      comp('Glyph'),
    ])
    const keys = graph.list().map((c) => componentKey(c))
    expect(keys.sort(), 'the unqualifiable one keeps the bare key').toEqual([
      'Glyph',
      'Glyph@A',
      'Glyph@B',
    ])
    expect(graph.size(), 'and none of the three was dropped').toBe(3)
  })

  it('keeps last-wins for two SOURCELESS namesakes, as it always has', () => {
    // Genuinely nothing to tell them apart. Two entries under one key would be
    // impossible; a fabricated qualifier would be worse than collapsing.
    const graph = createCatalogGraph([comp('Icon'), comp('Icon')])
    expect(graph.size()).toBe(1)
  })
})

describe('the filename qualifier of last resort', () => {
  it('has NOTHING to offer for a source with no filename at all', async () => {
    // A root-ish path. Returning an empty qualifier would key a component as
    // `Name@` — a key nothing can look up, and one that would then collide
    // with the next sourceless namesake exactly as the bare key did.
    const { fileQualifierFor, pathQualifierFor } = await import('../identity')
    expect(fileQualifierFor('/')).toBeUndefined()
    expect(fileQualifierFor('//')).toBeUndefined()
    expect(pathQualifierFor('/'), 'and the directory has none either').toBeUndefined()
  })

  it('refuses `index` — it names the DIRECTORY, not the component', async () => {
    const { fileQualifierFor } = await import('../identity')
    expect(fileQualifierFor('ui/button/index.tsx')).toBeUndefined()
    expect(fileQualifierFor('ui/button/Button.tsx')).toBe('Button')
  })
})
