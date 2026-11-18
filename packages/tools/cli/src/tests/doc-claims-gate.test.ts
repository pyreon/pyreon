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

/**
 * The six claim sites that carry the hook count, all claiming `n` — TWO of
 * them (the prose line and the "full surface" table-count line) live in the
 * SAME README, which is exactly the shape that let one drift while the
 * other stayed correct (see `hookClaimsStaleTableCount` below).
 */
const hookClaims = (n: number): Record<string, string> => ({
  'packages/fundamentals/hooks/README.md':
    `# hooks\n\n${n} signal-based reactive utilities\n\n${n} hooks across 7 categories.\n`,
  'packages/fundamentals/hooks/src/manifest.ts':
    `export default { summary: '${n} signal-based hooks: useHover, …',\n` +
    `  description: 'Signal-based hooks for Pyreon — ${n} reactive primitives' }\n`,
  'docs/src/content/docs/index.md': `| ${n} signal-based hooks for common UI patterns |\n`,
  'README.md': `| ${n} hooks — useHover, useToggle |\n`,
})

/**
 * The exact real-world shape that shipped: the prose line ("N signal-based
 * reactive utilities") is correct, but the table-count line a few lines
 * below it ("M hooks across 7 categories.") is stale. One claim site
 * catching drift does NOT mean its neighbour in the same file does.
 */
const hookClaimsStaleTableCount = (correct: number, stale: number): Record<string, string> => ({
  ...hookClaims(correct),
  'packages/fundamentals/hooks/README.md':
    `# hooks\n\n${correct} signal-based reactive utilities\n\n${stale} hooks across 7 categories.\n`,
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
    build({ 'AGENTS.md': 'the docs cover every package\n' })
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

  it('catches a stale TABLE-count line even when the prose line above it is correct', () => {
    // The real shape that shipped: `packages/fundamentals/hooks/README.md`
    // carries the count TWICE — once in the opening prose ("65
    // signal-based reactive utilities"), once a few lines further down in
    // "## The full surface" ("N hooks across 7 categories."). Only the
    // first was a guarded claim site, so it caught drift while the second
    // silently rotted to a wrong number right next to a correct one. This
    // asserts BOTH are now independently checked against the same file.
    build({
      'packages/fundamentals/hooks/src/index.ts': hooksIndex('useHover', 'useToggle', 'useDebounce'),
      ...hookClaimsStaleTableCount(3, 2),
    })
    return run().then((r) => {
      const drift = forCheck(r, 'hook-count').filter((f) => f.code.endsWith('-drift'))
      expect(drift.length, 'the prose line is fine; only the table line should drift').toBe(1)
      expect(drift[0]?.location?.relPath).toBe('packages/fundamentals/hooks/README.md')
      expect(drift[0]?.message).toContain('claims 2')
      expect(drift[0]?.message).toContain('actual 3')
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

  it('rejects a hedge in wording no explicit rejector names (#4315)', () => {
    // The document-primitives manifest kept "14+ output formats" against a
    // real 20 because its rejector only knew "N+ formats" and its pattern
    // only "N formats"; the README's "14+ formats" was not a claim site at
    // all. Every claim now refuses its own "N+" form.
    const formats = Array.from({ length: 20 }, (_, i) => `  | 'f${i}'`).join('\n')
    build({
      'packages/fundamentals/document/src/types.ts': `export type OutputFormat =\n${formats}\n\nexport interface X {}\n`,
      'packages/ui-system/document-primitives/src/manifest.ts':
        `export default { tagline: 'export to 20 formats', description: 'exports to 14+ output formats (PDF, …)' }\n`,
      'packages/ui-system/document-primitives/README.md': `# document-primitives\n\nexport to 14+ formats.\n`,
    })

    return run().then((r) => {
      const hedged = forCheck(r, 'doc-format-count').filter((f) => f.code.endsWith('-hedged'))
      expect(hedged.map((f) => f.location?.relPath).sort()).toEqual([
        'packages/ui-system/document-primitives/README.md',
        'packages/ui-system/document-primitives/src/manifest.ts',
      ])
      expect(hedged[0]?.fix).toContain('20')
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
      'AGENTS.md': `Pyreon-specific linter — 3 rules, 1 categories\n`,
    })
    return run().then((r) => {
      const drift = forCheck(r, 'lint-rule-count').filter(
        (f) => f.code.endsWith('-drift') && f.location?.relPath === 'AGENTS.md',
      )
      expect(drift, 'three rules, three claimed').toEqual([])
    })
  })
})

describe('the scaffolder prompt carries the lint rule count', () => {
  // `create-pyreon-app` asked "Include @pyreon/lint? (59 Pyreon-specific
  // rules)" in 0.53.0 while the registry held 133: the prompt was not a
  // claim surface, so nothing compared it.
  const rules = (n: number): string =>
    `export const allRules: Rule[] = [\n${Array.from({ length: n }, (_, i) => `  rule${i},`).join('\n')}\n]\n`
  const prompt = (n: number): string =>
    `const value = await p.confirm({\n  message: 'Include @pyreon/lint? (${n} Pyreon-specific rules)',\n})\n`
  const PROMPTS = 'packages/zero/create-zero/src/prompts.ts'

  it('reports a stale prompt count with both numbers', () => {
    build({ 'packages/tools/lint/src/rules/index.ts': rules(4), [PROMPTS]: prompt(3) })
    return run().then((r) => {
      const drift = forCheck(r, 'lint-rule-count').filter(
        (f) => f.code.endsWith('-drift') && f.location?.relPath === PROMPTS,
      )
      expect(drift.length).toBe(1)
      expect(drift[0]?.message).toContain('claims 3')
      expect(drift[0]?.message).toContain('actual 4')
    })
  })

  it('stays quiet when the prompt matches the registry', () => {
    build({ 'packages/tools/lint/src/rules/index.ts': rules(4), [PROMPTS]: prompt(4) })
    return run().then((r) => {
      expect(forCheck(r, 'lint-rule-count').filter((f) => f.location?.relPath === PROMPTS)).toEqual([])
    })
  })
})

describe('a source of truth the counter cannot read counts ZERO, not a crash', () => {
  // Each counter parses one declaration out of a source file. When the file
  // exists but the declaration was renamed or reshaped, the counter must
  // return 0 (every claim then drifts, loudly) rather than throw and take the
  // doctor run down, or keep a number it can no longer derive. The well-formed
  // control proves the same fixture is read when the shape is right.
  const actualOf = (r: GateResult, id: string): string | undefined =>
    forCheck(r, id)
      .map((f) => /Actual: (\d+)\.|actual (\d+)/.exec(f.message))
      .map((m) => m?.[1] ?? m?.[2])
      .find((n) => n !== undefined)

  const cases: Array<[string, string, string, string]> = [
    [
      'lint-rule-count',
      'packages/tools/lint/src/rules/index.ts',
      'export const rules = [a, b]\n',
      'export const allRules: Rule[] = [\n  a,\n  b,\n]\n',
    ],
    [
      'detector-code-count',
      'packages/core/compiler/src/pyreon-intercept.ts',
      'export type PyreonCode = string\n',
      "export type PyreonDiagnosticCode =\n  | 'one'\n  | 'two'\n",
    ],
    [
      'react-detector-code-count',
      'packages/core/compiler/src/react-intercept.ts',
      'export type ReactCode = string\n',
      "export type ReactDiagnosticCode =\n  | 'one'\n  | 'two'\n",
    ],
    [
      'doc-format-count',
      'packages/fundamentals/document/src/types.ts',
      'export type Format = string\n',
      "export type OutputFormat = 'pdf' | 'docx'\n\nexport type X = 1\n",
    ],
    [
      'canonical-primitive-count',
      'packages/native/compiler/src/canonical-primitives.ts',
      'export const PRIMITIVES = []\n',
      "export const CANONICAL_PRIMITIVES = new Set([\n  'Stack',\n  'Text',\n])\n",
    ],
  ]

  for (const [id, file, unreadable, readable] of cases) {
    it(`${id}: reads 0 from an unrecognised ${file.split('/').pop()}, 2 from the real shape`, async () => {
      build({ [file]: unreadable })
      expect(actualOf(await run(), id)).toBe('0')
      rmSync(root, { recursive: true, force: true })
      root = mkdtempSync(join(tmpdir(), 'pyreon-docclaims-'))
      build({ [file]: readable })
      expect(actualOf(await run(), id)).toBe('2')
    })
  }

  it('counts packages and manifests past a stray FILE in packages/', async () => {
    build({
      'packages/README.md': '# packages\n',
      'packages/tools/a/package.json': '{"name":"@pyreon/a"}\n',
      'packages/tools/a/src/manifest.ts': 'export default {}\n',
      'packages/tools/b/package.json': '{"name":"@pyreon/b"}\n',
    })
    const r = await run()
    expect(actualOf(r, 'package-count')).toBe('2')
    expect(actualOf(r, 'manifest-count')).toBe('1')
  })
})

describe('the marketing site carries the lint counts', () => {
  // pyreon.dev said "133 lint rules in 25 categories" while the registry held
  // 140 in 26: its content files (synced from the 09-site staging set) were
  // not claim surfaces, so two rule additions passed without touching them.
  const rules = (n: number): string =>
    `export const allRules: Rule[] = [\n${Array.from({ length: n }, (_, i) => `  rule${i},`).join('\n')}\n]\n`
  const category = (name: string): string => `export default { meta: { category: '${name}' } }\n`
  const HOME = 'docs/src/site/content/_home.json'
  const home = (n: number, cats: number): string =>
    `{\n "items": [\n    {\n     "name": "${n} lint rules",\n     "text": "In ${cats} categories, from props to SSR."\n    }\n ]\n}\n`
  const repo = (claimed: number, claimedCats: number): Record<string, string> => ({
    'packages/tools/lint/src/rules/index.ts': rules(4),
    'packages/tools/lint/src/rules/jsx/a.ts': category('jsx'),
    'packages/tools/lint/src/rules/style/b.ts': category('style'),
    [HOME]: home(claimed, claimedCats),
  })
  const onHome = (r: GateResult, id: string): Finding[] =>
    forCheck(r, id).filter((f) => f.code.endsWith('-drift') && f.location?.relPath === HOME)

  it('reports a stale site rule count and category count', () => {
    build(repo(3, 1))
    return run().then((r) => {
      expect(onHome(r, 'lint-rule-count').map((f) => f.message)).toEqual([
        `lint rule count: ${HOME} claims 3, actual 4.`,
      ])
      expect(onHome(r, 'lint-category-count').length).toBe(1)
    })
  })

  it('stays quiet when the site matches the registry', () => {
    build(repo(4, 2))
    return run().then((r) => {
      expect(onHome(r, 'lint-rule-count')).toEqual([])
      expect(onHome(r, 'lint-category-count')).toEqual([])
    })
  })

  it('reports a stale count in a blog post and in the share-image alt text', () => {
    // The blog posts and the /docs/cli share image said 133 after the
    // registry reached 140; they were not claim surfaces either.
    const POST = 'docs/src/content/blog/a-framework-your-ai-assistant-cant-misuse.md'
    const OG = 'docs/src/site/content/_docs-og.json'
    build({
      ...repo(4, 2),
      [POST]: 'is the broader rule set: 3 rules in 1 categories, from reactivity to SSR.\n',
      [OG]: '{ "alt": "next to 4 lint rules", "again": "next to 3 lint rules" }\n',
    })

    return run().then((r) => {
      const drift = (id: string, file: string): string[] =>
        forCheck(r, id)
          .filter((f) => f.code.endsWith('-drift') && f.location?.relPath === file)
          .map((f) => f.message)
      expect(drift('lint-rule-count', POST)).toEqual([`lint rule count: ${POST} claims 3, actual 4.`])
      expect(drift('lint-category-count', POST)).toEqual([`lint category count: ${POST} claims 1, actual 2.`])
      expect(drift('lint-rule-count', OG)).toEqual([
        `lint rule count: ${OG} claims 3 (one of 2 occurrences), actual 4.`,
      ])
    })
  })
})

describe('the marketing site carries the product count, the anti-pattern total and the package count', () => {
  // pyreon.dev said "40 products" in six files after the forty-first page was added, "522" anti-patterns
  // against a catalog past 560, and its package count was typed into five files by hand.
  const SITE = 'docs/src/site/content'
  const index = (n: number): string => `{ "order": [${Array.from({ length: n }, (_, i) => `"p${i}"`).join(', ')}] }\n`
  const catalog = (n: number): string => `# Anti-patterns\n\n## Reactivity\n\n${Array.from({ length: n }, (_, i) => `- **Mistake ${i}** is wrong.\n`).join('')}`
  const files = (over: Record<string, string> = {}): Record<string, string> => ({
    [`${SITE}/products/_index.json`]: index(3),
    [`${SITE}/_home.json`]: '{ "title": "3 products. One version.", "label": "See all 3 products", "text": "80 packages, one version" }\n',
    [`${SITE}/_nav.json`]: '{ "a": { "label": "All 3 products" }, "b": { "label": "All 3 products" } }\n',
    '.agents/rules/anti-patterns.md': catalog(5),
    [`${SITE}/products/ai.json`]: '{ "text": "catalog (5 entries on main)" }\n',
    [`${SITE}/_counts.json`]: '{ "packages": 80 }\n',
    ...over,
  })
  const drift = (r: GateResult, id: string, file: string): string[] =>
    forCheck(r, id)
      .filter((f) => f.code.endsWith('-drift') && f.location?.relPath === file)
      .map((f) => f.message)

  it('stays quiet when every statement matches its source', async () => {
    build(files())
    const r = await run()
    for (const id of ['site-product-count', 'site-anti-pattern-count', 'site-package-count']) {
      expect(forCheck(r, id).filter((f) => f.code.endsWith('-drift'))).toEqual([])
    }
  })

  it('reports a product count that was not bumped in every file, and names the one occurrence', async () => {
    build(files({ [`${SITE}/_home.json`]: '{ "title": "2 products. One version.", "label": "See all 3 products", "text": "80 packages, one version" }\n', [`${SITE}/_nav.json`]: '{ "a": { "label": "All 3 products" }, "b": { "label": "All 2 products" } }\n' }))
    const r = await run()
    expect(drift(r, 'site-product-count', `${SITE}/_home.json`)).toEqual([`site product count: ${SITE}/_home.json claims 2, actual 3.`])
    expect(drift(r, 'site-product-count', `${SITE}/_nav.json`)).toEqual([`site product count: ${SITE}/_nav.json claims 2 (one of 2 occurrences), actual 3.`])
  })

  it('reports an anti-pattern total that no longer matches the catalog', async () => {
    build(files({ '.agents/rules/anti-patterns.md': catalog(7) }))
    const r = await run()
    expect(drift(r, 'site-anti-pattern-count', `${SITE}/products/ai.json`)).toEqual([`site anti-pattern total: ${SITE}/products/ai.json claims 5, actual 7.`])
  })

  it('reports a blog post whose package count was not moved with the constant', async () => {
    const POST = 'docs/src/content/blog/introducing-pyreon.md'
    build(files({ [POST]: '77 published packages, all versioned together:\n' }))
    expect(drift(await run(), 'site-package-count', POST)).toEqual([`site package count (the content set constant): ${POST} claims 77, actual 80.`])
  })

  it('checks the package count against the constant, not against the repository', async () => {
    // The site says 80 on purpose, ahead of npm: two published packages here, and 80 is still right.
    build(files({ 'packages/a/package.json': '{ "name": "@pyreon/a" }\n', 'packages/b/package.json': '{ "name": "@pyreon/b" }\n' }))
    expect(drift(await run(), 'site-package-count', `${SITE}/_home.json`)).toEqual([])
    // Changing the decision without changing the files is the drift.
    build(files({ [`${SITE}/_counts.json`]: '{ "packages": 81 }\n' }))
    expect(drift(await run(), 'site-package-count', `${SITE}/_home.json`)).toEqual([`site package count (the content set constant): ${SITE}/_home.json claims 80, actual 81.`])
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
      '.agents/rules/anti-patterns.md': `flags 3 of the patterns below statically\n`,
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
      '.agents/rules/anti-patterns.md': `flags 3 of the patterns below statically\n`,
    })
    return run().then((r) => {
      const drift = forCheck(r, 'detector-code-count').filter((f) => f.code.endsWith('-drift'))
      expect(drift.length).toBeGreaterThan(0)
      expect(drift[0]?.message).toContain('actual 4')
    })
  })

  it('counts the React detector codes out of their union too (#4304)', () => {
    build({
      'packages/core/compiler/src/react-intercept.ts':
        `export type ReactDiagnosticCode =\n  | 'use-state'\n  | 'array-map-jsx'\n\nexport const x = 1\n`,
      'packages/core/compiler/src/manifest.ts': `'"coming from React" mistakes — 3 codes today: …'\n`,
    })
    return run().then((r) => {
      const drift = forCheck(r, 'react-detector-code-count').filter((f) => f.code.endsWith('-drift'))
      expect(drift.length).toBe(1)
      expect(drift[0]?.message).toContain('actual 2')
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
      'AGENTS.md': `Pyreon-specific linter — 3 rules, 2 categories\n`,
    })
    return run().then((r) => {
      const drift = forCheck(r, 'lint-category-count').filter(
        (f) => f.code.endsWith('-drift') && f.location?.relPath === 'AGENTS.md',
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
      'AGENTS.md': `Pyreon-specific linter — 1 rules, 1 categories\n`,
    })
    return run().then((r) => {
      expect(
        forCheck(r, 'lint-category-count').filter(
          (f) => f.code.endsWith('-drift') && f.location?.relPath === 'AGENTS.md',
        ),
      ).toEqual([])
    })
  })
})

describe('doc page count', () => {
  it('does not count blog posts as doc pages', () => {
    // A blog post lands every week; counting it turned the AGENTS.md
    // "N doc pages" claim red on every post PR.
    build({
      'AGENTS.md': 'the docs site — 2 doc pages covering all packages\n',
      'docs/README.md': '# docs\n',
      'docs/src/content/docs/a.md': '# a\n',
      'docs/src/content/blog/first-post.md': '# post\n',
      'docs/src/content/blog/second-post.md': '# post\n',
    })
    return run().then((r) => {
      expect(forCheck(r, 'doc-count'), 'README + a.md = 2; posts excluded').toEqual([])
    })
  })
})

describe('canonical primitive count', () => {
  /** The compiler's `CANONICAL_PRIMITIVES` Set with the given members. */
  const canonical = (...names: string[]): string =>
    `export const CANONICAL_PRIMITIVES = new Set([\n${names.map((n) => `  '${n}',`).join('\n')}\n])\n`

  /**
   * The shape that shipped: the primitives page's body said "22 canonical
   * primitives" (a checked phrase) while its frontmatter said "21 primitives
   * plus Transition…" — no "canonical", so no anchor matched it, and it stayed
   * 21 after `<Select>` made the set 22. multiplatform.md's "all N canonical
   * primitives" was likewise outside the "the N canonical primitives" anchor.
   */
  const pages = (frontmatter: number, body: number): Record<string, string> => ({
    'packages/native/compiler/src/canonical-primitives.ts': canonical('Stack', 'Text', 'Select'),
    'docs/src/content/docs/primitives.md':
      `---\ndescription: 'The vocabulary — ${frontmatter} primitives plus Transition.'\n---\n\nThe first groups are the **${body} canonical primitives**.\n`,
    'docs/src/content/docs/multiplatform.md': `Web runtime — all ${body} canonical primitives plus Transition.\n`,
  })

  const driftIn = (r: GateResult, relPath: string): Finding[] =>
    forCheck(r, 'canonical-primitive-count').filter(
      (f) => f.code.endsWith('-drift') && f.location?.relPath === relPath,
    )

  it('checks a count phrased without "canonical" (the primitives page frontmatter)', () => {
    build(pages(2, 3))
    return run().then((r) => {
      const drift = driftIn(r, 'docs/src/content/docs/primitives.md')
      expect(drift.length).toBe(1)
      expect(drift[0]?.message).toContain('claims 2')
      expect(drift[0]?.message).toContain('actual 3')
    })
  })

  it('checks "all N canonical primitives" in multiplatform.md', () => {
    build(pages(3, 2))
    return run().then((r) => {
      expect(driftIn(r, 'docs/src/content/docs/multiplatform.md').length).toBe(1)
    })
  })

  it('stays quiet when every phrasing carries the real count', () => {
    build(pages(3, 3))
    return run().then((r) => {
      expect(driftIn(r, 'docs/src/content/docs/primitives.md')).toEqual([])
      expect(driftIn(r, 'docs/src/content/docs/multiplatform.md')).toEqual([])
    })
  })
})
