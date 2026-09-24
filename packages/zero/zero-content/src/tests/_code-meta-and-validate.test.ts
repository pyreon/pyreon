/**
 * Code-fence metadata parsing, and the unknown-component diagnostic.
 *
 * **Fence meta.** ```` ```ts {1,3-5} title="x.ts" ```` is authored by
 * hand in every code sample on the site, so it meets more malformed
 * input than anything else in the pipeline. Every failure is silent: a
 * dropped range highlights the wrong lines, a mis-parsed `title` puts
 * the filename in the wrong place, and an over-eager unknown-token
 * warning fires on every tab of every `:::code-group` until authors stop
 * reading warnings entirely.
 *
 * The `[npm]` stripping is there for exactly that reason — code-group
 * tabs carry a bracketed label — and it has to happen BEFORE the
 * `{…}` range scan, or a label containing a brace is read as a range.
 *
 * **Component validation.** An unknown component in MDX renders as
 * nothing; the page builds and a section is simply missing. The
 * suggestion is what turns that into a fixable message, and its
 * ordering has to be deterministic — two candidates at the same edit
 * distance must resolve the same way on every machine, or the build
 * output differs between a developer's laptop and CI.
 */
import { describe, expect, it } from 'vitest'
import { parseCodeFenceMeta } from '../pipeline/code-meta'
import {
  BUILT_IN_COMPONENTS, formatValidationError, validateComponentRefs,
} from '../mdx-scan/validate'

describe('highlight ranges', () => {
  it('reads a single line, a list and a range', () => {
    // The control.
    expect(parseCodeFenceMeta('{3}').highlightLines).toEqual([3])
    expect(parseCodeFenceMeta('{1,3}').highlightLines).toEqual([1, 3])
    expect(parseCodeFenceMeta('{2-4}').highlightLines).toEqual([2, 3, 4])
  })

  it('folds SEVERAL groups, which is what mid-edit formatting produces', () => {
    expect(parseCodeFenceMeta('{1} {3-4}').highlightLines).toEqual([1, 3, 4])
  })

  it('ignores an empty token rather than emitting NaN', () => {
    // `{1,,3}` — a stray comma. `parseInt('')` is NaN, and a NaN line
    // number highlights nothing while silently entering the list.
    const out = parseCodeFenceMeta('{1,,3}').highlightLines
    expect(out).toEqual([1, 3])
    expect(out.every(Number.isFinite)).toBe(true)
  })

  it('rejects a non-numeric or out-of-range value', () => {
    // Line 0 does not exist, and a reversed range would loop backwards
    // forever if it were not rejected.
    expect(parseCodeFenceMeta('{abc}').highlightLines).toEqual([])
    expect(parseCodeFenceMeta('{0}').highlightLines).toEqual([])
    expect(parseCodeFenceMeta('{5-2}').highlightLines).toEqual([])
    expect(parseCodeFenceMeta('{-}').highlightLines).toEqual([])
  })

  it('returns nothing for absent meta', () => {
    for (const m of [null, undefined, '']) {
      expect(parseCodeFenceMeta(m).highlightLines, String(m)).toEqual([])
    }
  })
})

describe('key=value pairs', () => {
  it('reads a filename in either quote style', () => {
    expect(parseCodeFenceMeta('title="app.ts"').filename).toBe('app.ts')
    expect(parseCodeFenceMeta("filename='app.ts'").filename).toBe('app.ts')
  })

  it('accepts an EMPTY quoted value without reporting it unknown', () => {
    // `title=""` is an author clearing the label, not a mistake.
    const out = parseCodeFenceMeta('title=""')
    expect(out.filename).toBe('')
    expect(out.unknown).toEqual([])
  })

  it('reports an unrecognised key as unknown, with its value', () => {
    // The message has to name what was written or the author cannot
    // find it in a long fence.
    expect(parseCodeFenceMeta('caption="hi"').unknown).toEqual(['caption=hi'])
  })

  it('reads a filename alongside a range', () => {
    const out = parseCodeFenceMeta('{2-3} title="a.ts"')
    expect(out.highlightLines).toEqual([2, 3])
    expect(out.filename).toBe('a.ts')
    expect(out.unknown).toEqual([])
  })
})

describe('a bracketed code-group label is stripped, not warned about', () => {
  it('ignores [npm] and friends', () => {
    // Every tab of every `:::code-group` carries one. Warning on them
    // trains authors to ignore fence warnings entirely.
    for (const meta of ['[npm]', '[pnpm]', '[bun add]']) {
      expect(parseCodeFenceMeta(meta).unknown, meta).toEqual([])
    }
  })

  it('strips the label BEFORE scanning ranges', () => {
    // A label containing a brace would otherwise be read as a range.
    const out = parseCodeFenceMeta('[a{1}b] {3}')
    expect(out.highlightLines).toEqual([3])
  })

  it('keeps a real range that follows a label', () => {
    const out = parseCodeFenceMeta('[npm] {1-2} title="x"')
    expect(out.highlightLines).toEqual([1, 2])
    expect(out.filename).toBe('x')
    expect(out.unknown).toEqual([])
  })
})

describe('an unknown component gets a deterministic suggestion', () => {
  // The context takes THREE name sources — the `src/mdx/` scan, the
  // file's own hoisted imports, and the built-ins — plus the referenced
  // names, in one object.
  const validate = (
    referencedNames: string[],
    scannedNames: string[] = ['Tabs', 'Callout', 'CodeBlock', 'Example'],
  ) => validateComponentRefs({ scannedNames, hoistedNames: [], referencedNames })

  it('suggests the nearest known name', () => {
    // The control. An unknown component renders as NOTHING — the page
    // builds and a section is simply missing — so the message is the
    // only signal there is.
    const issues = validate(['Tab']).issues
    expect(issues[0]!.suggestion).toBe('Tabs')
  })

  it('reports no issue for a name that IS known', () => {
    expect(validate(['Tabs']).issues).toEqual([])
  })

  it('reports no suggestion for something unrelated', () => {
    // Suggesting `Tabs` for `Zzz` is worse than silence: the author
    // believes it.
    const issues = validate(['Zzzqqq']).issues
    expect(issues).toHaveLength(1)
    expect(issues[0]!.suggestion).toBeNull()
  })

  it('breaks a distance TIE alphabetically, not by input order', () => {
    // Otherwise the same source produces a different message depending
    // on how the known-component list happened to be built — a build
    // that differs between a laptop and CI.
    const a = validate(['Xabs'], ['Tabs', 'Babs'])
    const b = validate(['Xabs'], ['Babs', 'Tabs'])
    expect(a.issues[0]!.suggestion).toBe(b.issues[0]!.suggestion)
    expect(a.issues[0]!.suggestion).toBe('Babs')
  })

  it('lists every candidate within the distance bound', () => {
    // Built-ins are candidates too — `Math` is also within three edits
    // of `Xabs` — so assert the PROPERTY rather than a fixed list, which
    // would break every time a built-in is added.
    const issue = validate(['Xabs'], ['Tabs', 'Babs', 'Zzzzzzz']).issues[0]!
    expect(issue.candidates).toContain('Babs')
    expect(issue.candidates).toContain('Tabs')
    expect(issue.candidates, 'nothing beyond the bound').not.toContain('Zzzzzzz')
    expect(issue.candidates[0], 'still ordered nearest-then-alphabetical').toBe('Babs')
  })

  it('formats a message naming the file, the component and the suggestion', () => {
    const msg = formatValidationError(validate(['Tab']), 'docs/a.md')
    expect(msg).toContain('docs/a.md')
    expect(msg).toContain('<Tab />')
    expect(msg).toContain('Did you mean <Tabs />')
  })

  it('formats a message with no suggestion to offer', () => {
    // The message must still be useful — it points at where components
    // come from rather than trailing off.
    const msg = formatValidationError(validate(['Zzzqqq']), 'docs/a.md')
    expect(msg).toContain('<Zzzqqq />')
    expect(msg).toContain('No close match')
    expect(msg).not.toContain('null')
  })

  it('formats to EMPTY when nothing is wrong', () => {
    // A non-empty string here would surface as a warning on every clean
    // build.
    expect(formatValidationError(validate(['Tabs']), 'docs/a.md')).toBe('')
  })

  it('resolves a component from the file own HOISTED imports', () => {
    // A page that imports its own component. Reporting it unknown makes
    // the escape hatch unusable.
    expect(validateComponentRefs({
      scannedNames: [], hoistedNames: ['MyChart'], referencedNames: ['MyChart'],
    }).issues).toEqual([])
  })

  it('resolves a BUILT-IN without any scan', () => {
    expect(validateComponentRefs({
      scannedNames: [], hoistedNames: [], referencedNames: [BUILT_IN_COMPONENTS[0]!],
    }).issues).toEqual([])
  })
})
