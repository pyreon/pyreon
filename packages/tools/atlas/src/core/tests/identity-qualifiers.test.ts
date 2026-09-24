/**
 * The two qualifiers that keep same-named components apart, and the
 * escalation between them.
 *
 * `identity.test.ts` covers `componentKey` and `resolveComponent`.
 * `pathQualifierFor` and `fileQualifierFor` — the functions that DECIDE a
 * key when two components share a name — had none, which is the wrong half
 * to leave open: a qualifier that returns `undefined` when it should not
 * makes the graph fall through to "keep the last", and a component vanishes
 * from the catalog with no error. That is the exact silent drop this module
 * exists to prevent, and its docstring records it happening for real: 1042
 * components lost on one monorepo, and 994 of 995 generated icons lost even
 * after directory qualification, because they all sat in one directory.
 *
 * The ORDER is the interesting part and it is not arbitrary. Directory is
 * tried first because `Button/index.tsx` and `Button.tsx` are the same
 * component to a reader, and leading with the filename would split a
 * component from itself. Filename is the fallback for exactly the case the
 * directory cannot answer.
 */
import { describe, expect, it } from 'vitest'
import { createCatalogGraph } from '../graph'
import { componentKey, fileQualifierFor, pathQualifierFor } from '../identity'
import type { ComponentIntelligence } from '../types'

describe('pathQualifierFor takes the DIRECTORY, never the filename', () => {
  it('returns the directory path', () => {
    expect(pathQualifierFor('src/ui/Button.tsx')).toBe('src/ui')
  })

  it('gives `Button/index.tsx` and `Button.tsx` DIFFERENT directories', () => {
    // The pair the ordering exists for. `Button/index.tsx` lives in
    // `ui/Button`, `Button.tsx` in `ui` — so the directory does tell these
    // apart, which is correct: they are different files. What must not
    // happen is the FILENAME being used first, which would split a
    // component from a rename of itself.
    expect(pathQualifierFor('ui/Button/index.tsx')).toBe('ui/Button')
    expect(pathQualifierFor('ui/Button.tsx')).toBe('ui')
  })

  it('returns undefined for a file at the scan root', () => {
    // No directory to qualify with — the graph must then escalate rather
    // than qualify with an empty string, which would produce the key
    // `Name@` and read as a bug in the output.
    expect(pathQualifierFor('Button.tsx')).toBeUndefined()
  })

  it('returns undefined for no source at all', () => {
    expect(pathQualifierFor(undefined)).toBeUndefined()
  })

  it('handles Windows separators', () => {
    // Scan results carry whatever the platform's path module produced.
    expect(pathQualifierFor('src\\ui\\Button.tsx')).toBe('src/ui')
  })

  it('ignores empty segments from leading or doubled separators', () => {
    // A doubled separator would otherwise produce `src//ui`, and two
    // spellings of one directory are two identities.
    expect(pathQualifierFor('/src//ui/Button.tsx')).toBe('src/ui')
  })
})

describe('fileQualifierFor is the qualifier of last resort', () => {
  it('returns the filename stem', () => {
    expect(fileQualifierFor('generated/Glyph.tsx')).toBe('Glyph')
  })

  it('returns undefined for `index`, which names the DIRECTORY', () => {
    // An `index` stem carries no information the directory did not already
    // carry, so using it would qualify two components with the same value
    // and the graph would still drop one.
    expect(fileQualifierFor('ui/Button/index.tsx')).toBeUndefined()
    expect(fileQualifierFor('index.ts')).toBeUndefined()
  })

  it('strips every extension the scanner emits', () => {
    for (const ext of ['ts', 'tsx', 'js', 'jsx']) {
      expect(fileQualifierFor(`a/Glyph.${ext}`), ext).toBe('Glyph')
    }
  })

  it('leaves an unknown extension alone rather than truncating at the dot', () => {
    // Truncating at any dot would turn `Button.stories` into `Button` and
    // collide it with the component it documents.
    expect(fileQualifierFor('a/Button.stories.tsx')).toBe('Button.stories')
  })

  it('returns undefined for no source', () => {
    expect(fileQualifierFor(undefined)).toBeUndefined()
  })
})

describe('the graph escalates directory → filename', () => {
  const comp = (name: string, source: string): ComponentIntelligence =>
    ({ name, source, props: [], scenarios: [] }) as unknown as ComponentIntelligence

  const keysOf = (list: ComponentIntelligence[]): string[] =>
    createCatalogGraph(list).list().map(componentKey).sort()

  it('keeps two same-named components in DIFFERENT directories', () => {
    // The ordinary monorepo shape — a per-page `MainFilter`.
    expect(keysOf([comp('Filter', 'pages/a/Filter.tsx'), comp('Filter', 'pages/b/Filter.tsx')])).toEqual([
      'Filter@pages/a',
      'Filter@pages/b',
    ])
  })

  it('keeps 3 same-named components in ONE directory, via the filename', () => {
    // The generated-icon case. Directory qualification alone returns the
    // same value for all three, so without the filename fallback two of
    // them are dropped — silently, which is how 994 icons went missing.
    const keys = keysOf([
      comp('Glyph', 'generated/Add.tsx'),
      comp('Glyph', 'generated/Remove.tsx'),
      comp('Glyph', 'generated/Edit.tsx'),
    ])
    expect(keys, 'all three must survive').toHaveLength(3)
    expect(keys).toEqual(['Glyph@Add', 'Glyph@Edit', 'Glyph@Remove'])
  })

  it('qualifies EVERY sibling, including an odd one out', () => {
    // The escalation deletes the bare key and re-inserts both sides
    // qualified, which left that key vacant for the NEXT arrival to claim.
    // With an odd count one component therefore kept an unqualified key:
    // five produced `Glyph`, `Glyph@A`, `Glyph@B`, `Glyph@C`, `Glyph@D`.
    const keys = keysOf(['A', 'B', 'C', 'D', 'E'].map((n) => comp('Glyph', `g/${n}.tsx`)))
    expect(keys).toEqual(['Glyph@A', 'Glyph@B', 'Glyph@C', 'Glyph@D', 'Glyph@E'])
    expect(keys, 'no sibling may keep the bare key').not.toContain('Glyph')
  })

  it('an ambiguous bare name resolves to UNDEFINED, not to the odd one out', () => {
    // The consequence, and the reason it mattered. `resolveComponent`
    // matches an exact KEY before it considers ambiguity, so a sibling
    // holding the bare key made `get('Glyph')` return it silently —
    // exactly the "pick one and say nothing" this module exists to stop.
    const graph = createCatalogGraph(
      ['A', 'B', 'C', 'D', 'E'].map((n) => comp('Glyph', `g/${n}.tsx`)),
    )
    expect(graph.get('Glyph'), 'five candidates must not resolve to one').toBeUndefined()
  })

  it('still REPLACES a true duplicate — same name, same source', () => {
    // The control. If everything were qualified, a re-scan of the same file
    // would double every component in the catalog.
    const keys = keysOf([comp('Button', 'ui/Button.tsx'), comp('Button', 'ui/Button.tsx')])
    expect(keys).toEqual(['Button'])
  })

  it('falls back to keep-the-last when NOTHING can tell them apart', () => {
    // Two root-level files cannot both be `index`, so this needs sources
    // that differ yet yield no qualifier on either pass. Documented
    // behaviour rather than a silent drop nobody chose.
    const keys = keysOf([comp('X', 'index.tsx'), comp('X', 'index.ts')])
    expect(keys, 'one key, deliberately').toEqual(['X'])
  })
})
