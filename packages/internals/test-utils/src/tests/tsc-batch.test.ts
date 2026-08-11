// The in-process typechecker behind `check-manifest-examples`.
//
// The gate synthesizes ~770 snippet files and checks them against every
// `@pyreon/*` package's `src/`. It used to do that by spawning `bunx tsc` four
// times — once to probe exports, then once per round of its syntax-exclusion
// loop — and each spawn rebuilt a complete program: 3,191 files parsed, bound
// and checked, for a verdict derived entirely from the ~770 snippets. That made
// one gate 74% of the warm `validate-fast` wall.
//
// Two properties do the work, and both are the kind that decay silently, so
// they are asserted here rather than left to a comment:
//
//   1. **The workspace is parsed once.** Reuse depends on the compiler host
//      handing back identical `SourceFile` objects across rounds. Drop the
//      cache and everything still PASSES — just three times slower, with
//      nothing to notice it. `filesParsed` makes that observable.
//   2. **Only the scoped files are checked.** A diagnostic belongs to exactly
//      one file, so scoping cannot change a verdict for a file the caller
//      classifies; it only decides which files are worth asking about. The
//      test pins that a diagnostic OUTSIDE the scope is genuinely absent while
//      the same diagnostic INSIDE it is reported.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveOptions, TscBatch } from '../../../../../scripts/tsc-batch'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tsc-batch-'))
  dirs.push(dir)
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
  return dir
}

const OPTIONS = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: false,
    noImplicitAny: false,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  },
}

function batchFor(dir: string): TscBatch {
  return new TscBatch({ dir, options: resolveOptions(OPTIONS, dir) })
}

describe('resolveOptions', () => {
  it('converts string enums to the numeric flags the compiler API needs', () => {
    const opts = resolveOptions(OPTIONS, '/tmp')
    // A raw cast would leave `module` as the string "ESNext" and the compiler
    // would silently fall back to a different module system — the failure mode
    // is a WRONG verdict, not a crash, so this is worth pinning.
    expect(typeof opts.module).toBe('number')
    expect(typeof opts.target).toBe('number')
  })

  it('throws on invalid options rather than checking under the wrong config', () => {
    expect(() => resolveOptions({ compilerOptions: { target: 'NotAReal' } }, '/tmp')).toThrow(
      /\[tsc-batch\]/,
    )
  })
})

describe('TscBatch — diagnostics', () => {
  it('reports code, message and 1-based location for a scoped file', () => {
    const dir = fixture({ 'a.ts': 'const n: number = "no"\n' })
    const { diagnostics } = batchFor(dir).check([join(dir, 'a.ts')], () => true)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({ file: 'a.ts', code: 2322 })
    // tsc prints `(line,col)` 1-based; the gates key their output on that shape.
    expect(diagnostics[0]!.loc).toBe('(1,7)')
    expect(diagnostics[0]!.message).toMatch(/not assignable/)
  })

  it('is clean when the scoped files are clean', () => {
    const dir = fixture({ 'a.ts': 'export const n: number = 1\n' })
    expect(batchFor(dir).check([join(dir, 'a.ts')], () => true).errorCount).toBe(0)
  })

  it('reports SYNTAX errors, which the exclusion loop keys on', () => {
    const dir = fixture({ 'a.ts': 'const = = =\n' })
    const { diagnostics } = batchFor(dir).check([join(dir, 'a.ts')], () => true)
    // The gate's `isSyntaxCategory` treats 1000–1999 as parse/grammar.
    expect(diagnostics.some((d) => d.code >= 1000 && d.code < 2000)).toBe(true)
  })
})

describe('TscBatch — scoping', () => {
  it('omits diagnostics from files outside the scope, and keeps them inside it', () => {
    const dir = fixture({
      'keep.ts': 'const a: number = "bad"\n',
      'ignore.ts': 'const b: number = "bad"\n',
    })
    const roots = [join(dir, 'keep.ts'), join(dir, 'ignore.ts')]

    const scoped = batchFor(dir).check(roots, (f) => f.endsWith('keep.ts'))
    expect(scoped.diagnostics.map((d) => d.file)).toEqual(['keep.ts'])

    // Same program, wider scope — proves the omission above is the SCOPE and
    // not the file being error-free. Without this pair, a scope predicate that
    // silently matched nothing would read as "everything is clean".
    const wide = batchFor(dir).check(roots, () => true)
    expect(new Set(wide.diagnostics.map((d) => d.file))).toEqual(new Set(['keep.ts', 'ignore.ts']))
  })
})

describe('TscBatch — program reuse', () => {
  it('parses each file once across rounds, then reuses it', () => {
    const dir = fixture({
      'shared.ts': 'export const v = 1\n',
      'a.ts': 'import { v } from "./shared"\nexport const a = v\n',
      'b.ts': 'import { v } from "./shared"\nexport const b = v\n',
    })
    const batch = batchFor(dir)

    batch.check([join(dir, 'a.ts'), join(dir, 'b.ts')], () => true)
    const afterFirst = batch.filesParsed
    expect(afterFirst).toBeGreaterThan(0)

    // Round two drops a root — exactly the exclusion loop's shape. Nothing on
    // disk changed, so nothing may be re-read. This is the assertion that fails
    // if the SourceFile cache is removed: the gate would still pass, just at
    // three times the cost, which is precisely the decay it cannot self-report.
    batch.check([join(dir, 'a.ts')], () => true)
    expect(batch.filesParsed).toBe(afterFirst)
  })

  it('still reports correct diagnostics on a reused program', () => {
    const dir = fixture({
      'good.ts': 'export const g = 1\n',
      'bad.ts': 'export const b: number = "no"\n',
    })
    const batch = batchFor(dir)
    const roots = [join(dir, 'good.ts'), join(dir, 'bad.ts')]

    expect(batch.check(roots, () => true).errorCount).toBe(1)
    // Reuse must not carry a stale verdict forward: drop the broken file and
    // the error has to disappear, not persist from the cached program.
    expect(batch.check([join(dir, 'good.ts')], () => true).errorCount).toBe(0)
    // …and re-adding it brings the error back.
    expect(batch.check(roots, () => true).errorCount).toBe(1)
  })
})
