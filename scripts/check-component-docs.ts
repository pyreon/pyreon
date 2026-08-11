#!/usr/bin/env bun
/**
 * A shipped component may not be missing from its README.
 *
 * ## The decay this catches
 *
 * `check-prose-props` asserts prose cannot name a prop that does not exist.
 * This is the inverse, and the more common rot: prose that is silently
 * INCOMPLETE. Nothing fails when you add a component and forget the README —
 * the package builds, the tests pass, the docs are simply missing an entry, and
 * the only way to notice is for someone to go looking for a component they
 * already know exists.
 *
 * Found by audit (2026-08-11): `@pyreon/ui-components` shipped SEVEN exported
 * components with no mention anywhere in its README — `Fieldset`,
 * `PasswordInput`, `RangeSlider`, `Rating`, `RingProgress`, `ScrollArea`,
 * `TagsInput`. The header also claimed "67 components across 10 categories"
 * while its own body listed 14 categories. Both had been wrong for long enough
 * that neither number matched anything.
 *
 * ## Why it checks EXPORTS, not directory names
 *
 * A directory is not a component. `src/components/SimpleGrid/` exports
 * `GridContainer` / `GridRow` / `GridCol` and the name "SimpleGrid" appears
 * nowhere in the public API — documenting it under the directory name would be
 * wrong, and requiring that would force a false entry.
 *
 * So the unit is the EXPORT: for each `export … from './components/<Dir>'` in
 * the package index, at least one of the names that line exports must appear in
 * the README. That handles the re-export case correctly by construction rather
 * than by an exemption list, which is the kind of list that rots on its own.
 *
 * ## Why it is not stricter
 *
 * It requires ONE of a directory's names, not all of them. Sub-components
 * (`AccordionItem`, `MenuItem`, `FieldsetLegend`) are legitimately folded into
 * their parent's entry — the README documents families, and demanding a line
 * per export would push it toward a generated list nobody reads. The claim
 * being made is "this component is discoverable from the README", and one
 * naming satisfies it.
 *
 * Run:
 *   bun run check-component-docs
 *   bun run check-component-docs --json
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '..')

interface Target {
  /** Package directory, relative to the repo root. */
  pkg: string
  /** The index whose exports define the public component surface. */
  index: string
  /** The README that must name them. */
  readme: string
  /**
   * The README section to search.
   *
   * Scoped rather than whole-file: a name that happens to appear in a code
   * sample or an architecture note is not the same as being catalogued, and
   * matching the whole file would let a component "pass" on an incidental
   * mention in an unrelated snippet.
   */
  section: { from: string; to: string }
}

const TARGETS: readonly Target[] = [
  {
    pkg: '@pyreon/ui-components',
    index: 'packages/ui/components/src/index.ts',
    readme: 'packages/ui/components/README.md',
    section: { from: '## Components by category', to: '## Architecture' },
  },
]

/** `export { default as Box } from './components/Box'` → `['Box']`, keyed by dir. */
export function exportsByDirectory(indexSource: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const line = /export\s*\{([^}]*)\}\s*from\s*'\.\/components\/([A-Za-z0-9_-]+)'/g
  for (const match of indexSource.matchAll(line)) {
    const [, clause, dir] = match
    if (!clause || !dir) continue
    const names = clause
      .split(',')
      .map((part) => {
        // `default as Box` / `Container as GridContainer` — the LOCAL name is
        // irrelevant to a reader; the exported name is what they can import.
        const trimmed = part.trim()
        const asMatch = /(?:^|\s)as\s+([A-Za-z0-9_$]+)$/.exec(trimmed)
        return asMatch?.[1] ?? trimmed
      })
      .map((n) => n.replace(/^type\s+/, '').trim())
      .filter((n) => /^[A-Z][A-Za-z0-9_$]*$/.test(n))
    if (names.length > 0) out.set(dir, [...(out.get(dir) ?? []), ...names])
  }
  return out
}

/** Component-shaped names a README section mentions, from its backticked spans. */
export function documentedNames(section: string): Set<string> {
  return new Set(
    [...section.matchAll(/`<?([A-Z][A-Za-z0-9]*)>?`/g)].map((m) => m[1]!),
  )
}

/** Directories whose every exported name is absent from the README. */
export function undocumented(
  byDir: ReadonlyMap<string, string[]>,
  documented: ReadonlySet<string>,
): { dir: string; names: string[] }[] {
  const out: { dir: string; names: string[] }[] = []
  for (const [dir, names] of byDir) {
    if (!names.some((n) => documented.has(n))) out.push({ dir, names })
  }
  return out.sort((a, b) => a.dir.localeCompare(b.dir))
}

/** The `### Category (N)` headings and their claimed counts. */
export function categoryCounts(section: string): { name: string; count: number }[] {
  return [...section.matchAll(/^### (.+?) \((\d+)\)/gm)].map((m) => ({
    name: m[1]!,
    count: Number(m[2]),
  }))
}

/** The "N components across M categories" claim in the README's opening prose. */
export function headerClaim(readme: string): { components: number; categories: number } | undefined {
  const m = /(\d+)\s+rocketstyle components across (\d+) categories/.exec(readme)
  return m ? { components: Number(m[1]), categories: Number(m[2]) } : undefined
}

interface Finding {
  pkg: string
  code: string
  message: string
  fix: string
}

function check(target: Target): Finding[] {
  const findings: Finding[] = []
  const indexSource = readFileSync(resolve(REPO_ROOT, target.index), 'utf8')
  const readme = readFileSync(resolve(REPO_ROOT, target.readme), 'utf8')

  const start = readme.indexOf(target.section.from)
  const end = readme.indexOf(target.section.to)
  if (start === -1 || end === -1 || end < start) {
    findings.push({
      pkg: target.pkg,
      code: 'section-missing',
      message: `${target.readme} has no "${target.section.from}" … "${target.section.to}" section to check`,
      fix: 'Restore the section, or update this gate if the README was deliberately restructured.',
    })
    return findings
  }
  const section = readme.slice(start, end)

  const missing = undocumented(exportsByDirectory(indexSource), documentedNames(section))
  for (const { dir, names } of missing) {
    findings.push({
      pkg: target.pkg,
      code: 'component-undocumented',
      message: `\`${names.join('`, `')}\` (src/components/${dir}) is exported but named nowhere in the README`,
      fix: `Add it under the right "### Category" heading in ${target.readme}, and bump that heading's count.`,
    })
  }

  // The header count is editorial (a category counts FAMILIES, folding
  // sub-components into their parent), so it is not derived from source — but
  // it must agree with the README's own body, which is exact and was not.
  const cats = categoryCounts(section)
  const claim = headerClaim(readme)
  if (claim) {
    const sum = cats.reduce((n, c) => n + c.count, 0)
    if (claim.categories !== cats.length) {
      findings.push({
        pkg: target.pkg,
        code: 'category-count-drift',
        message: `header says ${claim.categories} categories, the body lists ${cats.length}`,
        fix: `Update the opening line of ${target.readme} to "${sum} rocketstyle components across ${cats.length} categories".`,
      })
    }
    if (claim.components !== sum) {
      findings.push({
        pkg: target.pkg,
        code: 'component-count-drift',
        message: `header says ${claim.components} components, the per-category counts sum to ${sum}`,
        fix: `Update the opening line of ${target.readme} to "${sum} rocketstyle components across ${cats.length} categories".`,
      })
    }
  }
  return findings
}

const findings = TARGETS.flatMap(check)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ findings }, null, 2))
} else if (findings.length === 0) {
  const total = TARGETS.reduce(
    (n, t) => n + exportsByDirectory(readFileSync(resolve(REPO_ROOT, t.index), 'utf8')).size,
    0,
  )
  console.log(`✓ Every exported component is named in its README (${total} checked).`)
} else {
  console.error(`✗ ${findings.length} component-doc issue(s):\n`)
  for (const f of findings) {
    console.error(`  [${f.code}] ${f.pkg}`)
    console.error(`    ${f.message}`)
    console.error(`    fix: ${f.fix}\n`)
  }
}

process.exit(findings.length > 0 ? 1 : 0)
