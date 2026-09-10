/**
 * The doc-claims gate: does a number written in prose still match the
 * source it describes?
 *
 * Every count in this repo's docs — hooks, lint rules, detector codes,
 * published packages — is a claim that rots the moment someone adds one
 * more of the thing. The gate exists because a stale count is the most
 * corrosive kind of documentation error: it is specific, it is
 * confident, and nothing about reading it suggests checking.
 *
 * So the failure to guard against here is a gate that reports CLEAN
 * against a drifted claim. Three ways that has actually happened:
 *
 *  - the published npm description said "56 rules" against an actual 98,
 *    because that one claim surface was not in the list at all;
 *  - a count repeated five times in one file was bumped in four of them,
 *    and a first-match check passed;
 *  - a pattern written with a real em dash matched nothing in a
 *    `package.json` that stored the same character as `—`, so the
 *    claim degraded to an advisory pattern-miss and a genuinely stale
 *    number sat unreported on main.
 *
 * Each of those is a spec below. The gate is driven end to end over a
 * synthetic repo, because the counters and the comparison are only
 * meaningful together: a counter that returns the right number for a
 * claim the gate never reads is not protecting anything.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runDocClaimsGate } from '../doctor/gates/doc-claims'
import type { Finding, GateResult } from '../doctor/types'

let root: string

/** Marks the tree as the Pyreon monorepo — the gate's own run condition. */
const MARKER = 'scripts/check-doc-claims.ts'

const put = (rel: string, body: string): void => {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

const build = (files: Record<string, string>): void => {
  put(MARKER, '// marker\n')
  for (const [rel, body] of Object.entries(files)) put(rel, body)
}

const run = (): Promise<GateResult> => runDocClaimsGate({ cwd: root })

const codes = (r: GateResult, suffix: string): Finding[] =>
  r.findings.filter((f) => f.code.endsWith(suffix))

const forCheck = (r: GateResult, id: string): Finding[] =>
  r.findings.filter((f) => f.code.startsWith(`doc-claims/${id}-`))

/** A hooks barrel exporting exactly the given names. */
const hooksIndex = (...names: string[]): string =>
  `${names.map((n) => `export { ${n} } from './${n}'`).join('\n')}\n`

/** The five files that carry the hook count, all claiming `n`. */
const hookClaims = (n: number): Record<string, string> => ({
  'packages/fundamentals/hooks/README.md': `# hooks\n\n${n} signal-based reactive utilities\n`,
  'packages/fundamentals/hooks/src/manifest.ts':
    `export default { summary: '${n} signal-based hooks: useHover, …',\n` +
    `  description: 'Signal-based hooks for Pyreon — ${n} reactive primitives' }\n`,
  'docs/src/content/docs/index.md': `| ${n} signal-based hooks for common UI patterns |\n`,
  'README.md': `| ${n} hooks — useHover, useToggle |\n`,
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-docclaims-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('the gate only runs where its claims exist', () => {
  it('SKIPS a tree that is not the Pyreon monorepo', () => {
    // The claim files include a plain `README.md` and `CLAUDE.md`, which
    // most consumer projects have. Running there floods the
    // documentation category with file-missing errors for paths that
    // project never had, and drags an otherwise-clean app to a C.
    mkdirSync(join(root, 'src'), { recursive: true })
    return run().then((r) => {
      expect(r.meta.skipped).toBe(true)
      expect(r.meta.scanned).toBe(0)
      expect(r.findings, 'and reports nothing at all').toEqual([])
      expect(r.meta.skipReason, 'and says why').toContain('check-doc-claims.ts')
    })
  })

  it('RUNS once the marker is present', () => {
    // The control. Without it every "the gate reports X" assertion below
    // would also pass against a gate that always skips.
    build({})
    return run().then((r) => {
      expect(r.meta.skipped).toBeFalsy()
      expect(r.meta.scanned, 'and counts the claims it looked at').toBeGreaterThan(0)
    })
  })
})

describe('a claim that no longer exists is reported, not ignored', () => {
  it('reports a MISSING claim file as an error, with the actual count', () => {
    // A doc that was deleted or moved takes its claim out of the gate's
    // reach. Passing on that is how a whole surface stops being checked.
    build({})
    return run().then((r) => {
      const missing = codes(r, '-file-missing')
      expect(missing.length).toBeGreaterThan(0)
      expect(missing[0]?.severity).toBe('error')
      expect(missing[0]?.message).toContain('Actual:')
    })
  })

  it('reports a REPHRASED claim as a warning, not an error', () => {
    // The file is there and the pattern is not. That is a lost anchor,
    // not a lie — an error here would make every legitimate rewording a
    // build failure, which is how a gate gets bypassed.
    build({ 'CLAUDE.md': 'the docs cover every package\n' })
    return run().then((r) => {
      const miss = forCheck(r, 'doc-count').filter((f) => f.code.endsWith('-pattern-miss'))
      expect(miss.length).toBe(1)
      expect(miss[0]?.severity).toBe('warning')
      expect(miss[0]?.message).toContain('rephrased')
    })
  })
})

describe('a drifted number is reported, and a correct one is not', () => {
  it('stays QUIET when every claim matches the source', () => {
    // The direction that matters most: a gate that fires on correct docs
    // gets bypassed, and the bypass costs the real detections too.
    build({
      'packages/fundamentals/hooks/src/index.ts': hooksIndex('useHover', 'useToggle', 'useDebounce'),
      ...hookClaims(3),
    })
    return run().then((r) => {
      expect(forCheck(r, 'hook-count'), 'three exports, three claimed').toEqual([])
    })
  })

  it('reports drift and names BOTH numbers', () => {
    // "the count is wrong" without the two numbers leaves the reader to
    // go count by hand, which is the work the gate was meant to do.
    build({
      'packages/fundamentals/hooks/src/index.ts': hooksIndex('useHover', 'useToggle', 'useDebounce'),
      ...hookClaims(2),
    })
    return run().then((r) => {
      const drift = forCheck(r, 'hook-count').filter((f) => f.code.endsWith('-drift'))
      expect(drift.length).toBeGreaterThan(0)
      expect(drift[0]?.severity).toBe('error')
      expect(drift[0]?.message).toContain('claims 2')
      expect(drift[0]?.message).toContain('actual 3')
      expect(drift[0]?.fix, 'and say what to write instead').toContain('3')
    })
  })

  it('counts a name exported TWICE once', () => {
    // A barrel that re-exports a hook under two paths still ships one
    // hook. Counting the lines rather than the names inflates the number
    // the docs are then forced to match.
    build({
      'packages/fundamentals/hooks/src/index.ts':
        `export { useHover } from './useHover'\nexport { useHover } from './compat/useHover'\nexport { useToggle } from './useToggle'\n`,
      ...hookClaims(2),
    })
    return run().then((r) => {
      expect(forCheck(r, 'hook-count')).toEqual([])
    })
  })

  it('counts a DEFAULT re-export as a hook', () => {
    // `export { default as useX }` is the other spelling in that barrel;
    // missing it undercounts and forces the docs to a wrong number.
    build({
      'packages/fundamentals/hooks/src/index.ts':
        `export { useHover } from './useHover'\nexport { default as useToggle } from './useToggle'\n`,
      ...hookClaims(2),
    })
    return run().then((r) => {
      expect(forCheck(r, 'hook-count')).toEqual([])
    })
  })

  it('reads ZERO when the source of truth is gone, rather than throwing', () => {
    // A gate that crashes on a missing anchor takes the whole doctor run
    // with it. Zero is loud — every claim then drifts — which is the
    // right direction to fail in.
    build({ ...hookClaims(3) })
    return run().then((r) => {
      const drift = forCheck(r, 'hook-count').filter((f) => f.code.endsWith('-drift'))
      expect(drift.length).toBeGreaterThan(0)
      expect(drift[0]?.message).toContain('actual 0')
    })
  })
})

describe('a hedged count is refused outright', () => {
  it('rejects "N+" even though the number itself is right', () => {
    // "33+ hooks" is unfalsifiable: it stays true forever and tells the
    // reader nothing. The repo's rule is an exact number, and the gate
    // is what makes the rule real.
    build({
      'packages/fundamentals/hooks/src/index.ts': hooksIndex('useHover', 'useToggle', 'useDebounce'),
      ...hookClaims(3),
      'README.md': `| 3+ hooks — useHover, useToggle |\n`,
    })
    return run().then((r) => {
      const hedged = forCheck(r, 'hook-count').filter((f) => f.code.endsWith('-hedged'))
      expect(hedged.length).toBe(1)
      expect(hedged[0]?.severity).toBe('error')
      expect(hedged[0]?.fix, 'and name the exact number to use').toContain('3')
    })
  })

  it('does not also report drift for the same claim', () => {
    // One problem, one finding. Reporting the hedge AND a drift for the
    // hedged text doubles the noise for a single edit.
    build({
      'packages/fundamentals/hooks/src/index.ts': hooksIndex('useHover'),
      ...hookClaims(1),
      'README.md': `| 1+ hooks — useHover, useToggle |\n`,
    })
    return run().then((r) => {
      const readme = forCheck(r, 'hook-count').filter((f) => f.location?.relPath === 'README.md')
      expect(readme.length).toBe(1)
      expect(readme[0]?.code).toContain('hedged')
    })
  })
})

describe('a count repeated in one file must agree everywhere', () => {
  const rulesIndex = (n: number): string =>
    `import type { Rule } from '../types'\n\nexport const allRules: Rule[] = [\n` +
    `${Array.from({ length: n }, (_, i) => `  rule${i},`).join('\n')}\n]\n`

  it('reports the ONE occurrence that was not bumped', () => {
    // The documented failure: a count carried five times in one file,
    // four of them updated. A first-match check passes, and the file now
    // says two different things about the same number.
    build({
      'packages/tools/lint/src/rules/index.ts': rulesIndex(3),
      'packages/tools/lint/src/manifest.ts':
        `// 3 rules across 2 categories\nconst a = '3 rules total'\nconst b = '2 rules across 2 categories'\n`,
    })
    return run().then((r) => {
      const drift = forCheck(r, 'lint-rule-count').filter(
        (f) => f.code.endsWith('-drift') && f.location?.relPath?.endsWith('manifest.ts'),
      )
      expect(drift.length, 'the stale occurrence must be reported').toBe(1)
      expect(drift[0]?.message, 'and be placed among its siblings').toContain('of 3 occurrences')
    })
  })

  it('stays quiet when every occurrence agrees', () => {
    build({
      'packages/tools/lint/src/rules/index.ts': rulesIndex(3),
      'packages/tools/lint/src/manifest.ts':
        `// 3 rules across 2 categories\nconst a = '3 rules total'\n`,
    })
    return run().then((r) => {
      const drift = forCheck(r, 'lint-rule-count').filter(
        (f) => f.code.endsWith('-drift') && f.location?.relPath?.endsWith('manifest.ts'),
      )
      expect(drift).toEqual([])
    })
  })

  it('warns when the repeated claim is gone entirely', () => {
    build({
      'packages/tools/lint/src/rules/index.ts': rulesIndex(3),
      'packages/tools/lint/src/manifest.ts': `const a = 'nothing numeric here'\n`,
    })
    return run().then((r) => {
      const miss = forCheck(r, 'lint-rule-count').filter(
        (f) => f.code.endsWith('-pattern-miss') && f.location?.relPath?.endsWith('manifest.ts'),
      )
      expect(miss.length).toBe(1)
      expect(miss[0]?.severity).toBe('warning')
    })
  })

  it('skips the category headers when counting the rule list', () => {
    // The array carries `// Category (n)` comments and blank lines
    // between groups. Counting those as rules inflates the number the
    // docs are then forced to match — and the inflation grows with every
    // new category, so it never looks like an off-by-one.
    build({
      'packages/tools/lint/src/rules/index.ts':
        `export const allRules: Rule[] = [\n` +
        `  // Reactivity (2)\n  a,\n  b,\n\n  // SSR (1)\n  c,\n]\n`,
      'CLAUDE.md': `Pyreon-specific linter — 3 rules, 1 categories\n`,
    })
    return run().then((r) => {
      const drift = forCheck(r, 'lint-rule-count').filter(
        (f) => f.code.endsWith('-drift') && f.location?.relPath === 'CLAUDE.md',
      )
      expect(drift, 'three rules, three claimed').toEqual([])
    })
  })
})

describe('a JSON claim is read as the reader sees it', () => {
  // `package.json` may store any character as a `\uXXXX` escape, and
  // `changeset version` re-serialises the file on every release — so a
  // pattern containing a real em dash matched the working copy and
  // stopped matching after a release. A gate whose verdict depends on
  // which tool last wrote the file is checking the serialiser, not the
  // claim.
  const rulesIndex = `export const allRules: Rule[] = [\n  a,\n  b,\n]\n`

  it('matches a claim whose em dash is stored ESCAPED', () => {
    build({
      'packages/tools/lint/src/rules/index.ts': rulesIndex,
      'packages/tools/lint/package.json':
        `{"description":"Pyreon-specific linter \\u2014 2 rules"}\n`,
    })
    return run().then((r) => {
      const pkg = forCheck(r, 'lint-rule-count').filter(
        (f) => f.location?.relPath?.endsWith('package.json'),
      )
      expect(pkg, 'the escaped form must read as the same claim').toEqual([])
    })
  })

  it('reports drift through the escape, rather than losing the claim', () => {
    // The half that proves the decode did not simply swallow the file:
    // a wrong number behind the escape must still be caught.
    build({
      'packages/tools/lint/src/rules/index.ts': rulesIndex,
      'packages/tools/lint/package.json':
        `{"description":"Pyreon-specific linter \\u2014 9 rules"}\n`,
    })
    return run().then((r) => {
      const drift = forCheck(r, 'lint-rule-count').filter(
        (f) => f.code.endsWith('-drift') && f.location?.relPath?.endsWith('package.json'),
      )
      expect(drift.length).toBe(1)
      expect(drift[0]?.message).toContain('claims 9')
    })
  })

  it('matches a claim whose em dash is stored LITERALLY', () => {
    // Both spellings are legal JSON for the same string, and both are in
    // the wild depending on which tool wrote the file last.
    build({
      'packages/tools/lint/src/rules/index.ts': rulesIndex,
      'packages/tools/lint/package.json':
        `{"description":"Pyreon-specific linter — 2 rules"}\n`,
    })
    return run().then((r) => {
      const pkg = forCheck(r, 'lint-rule-count').filter(
        (f) => f.location?.relPath?.endsWith('package.json'),
      )
      expect(pkg).toEqual([])
    })
  })
})

describe('the counters read the source, not a cached build', () => {
  it('counts detector codes out of the union declaration', () => {
    // Text-parsed on purpose: importing the package resolves through
    // bun's module cache, which in a fresh worktree points at a stale
    // published snapshot. A gate that asserts against a stale cache is
    // worse than no gate — it certifies the wrong number as fresh.
    build({
      'packages/core/compiler/src/pyreon-intercept.ts':
        `export type PyreonDiagnosticCode =\n  | 'for-missing-by'\n  | 'props-destructured'\n  | 'empty-theme'\n\nexport const x = 1\n`,
      '.claude/rules/anti-patterns.md': `flags 3 of the patterns below statically\n`,
    })
    return run().then((r) => {
      const drift = forCheck(r, 'detector-code-count').filter((f) => f.code.endsWith('-drift'))
      expect(drift).toEqual([])
    })
  })

  it('reports drift when the union grows and the prose does not', () => {
    // The whole reason the counter exists: adding a detector is exactly
    // when the number in the docs goes stale.
    build({
      'packages/core/compiler/src/pyreon-intercept.ts':
        `export type PyreonDiagnosticCode =\n  | 'a-b'\n  | 'c-d'\n  | 'e-f'\n  | 'g-h'\n\nexport const x = 1\n`,
      '.claude/rules/anti-patterns.md': `flags 3 of the patterns below statically\n`,
    })
    return run().then((r) => {
      const drift = forCheck(r, 'detector-code-count').filter((f) => f.code.endsWith('-drift'))
      expect(drift.length).toBeGreaterThan(0)
      expect(drift[0]?.message).toContain('actual 4')
    })
  })

  it('counts lint categories by DIRECTORY content, not by directory name', () => {
    // The category a rule declares is what the docs count; a folder that
    // holds no rule declaring one must not add to the total.
    build({
      'packages/tools/lint/src/rules/reactivity/a.ts': `export const a = { category: 'reactivity' }\n`,
      'packages/tools/lint/src/rules/reactivity/b.ts': `export const b = { category: 'reactivity' }\n`,
      'packages/tools/lint/src/rules/ssr/c.ts': `export const c = { category: 'ssr' }\n`,
      'packages/tools/lint/src/rules/helpers/README.md': `not a rule\n`,
      'packages/tools/lint/src/rules/index.ts': `export const allRules: Rule[] = [\n  a,\n  b,\n  c,\n]\n`,
      'CLAUDE.md': `Pyreon-specific linter — 3 rules, 2 categories\n`,
    })
    return run().then((r) => {
      const drift = forCheck(r, 'lint-category-count').filter(
        (f) => f.code.endsWith('-drift') && f.location?.relPath === 'CLAUDE.md',
      )
      expect(drift, 'two declared categories, two claimed').toEqual([])
    })
  })

  it('ignores a stray FILE sitting beside the category directories', () => {
    // `rules/index.ts` is a file in that directory. Treating it as a
    // category — or throwing on the stat — breaks the count.
    build({
      'packages/tools/lint/src/rules/reactivity/a.ts': `export const a = { category: 'reactivity' }\n`,
      'packages/tools/lint/src/rules/index.ts': `export const allRules: Rule[] = [\n  a,\n]\n`,
      'packages/tools/lint/src/rules/types.ts': `export type Rule = unknown\n`,
      'CLAUDE.md': `Pyreon-specific linter — 1 rules, 1 categories\n`,
    })
    return run().then((r) => {
      expect(
        forCheck(r, 'lint-category-count').filter(
          (f) => f.code.endsWith('-drift') && f.location?.relPath === 'CLAUDE.md',
        ),
      ).toEqual([])
    })
  })
})
