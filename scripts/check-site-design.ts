#!/usr/bin/env bun
/**
 * Site design ratchet — pyreon.dev (`docs/src/**`) may only move TOWARDS its
 * design system. Counts per (file, rule), frozen in
 * `scripts/site-design-baseline.json`: a count may go down, never up, and a
 * file not in the baseline must have none.
 *
 *   literal/{color,space,radius,font-size,shadow,z-index,media}
 *       a hand-written design value instead of a token from `site/theme.ts`
 *   kit/styled-outside, kit/extend-css
 *       a styled component (or `extendCss`) defined outside `site/kit/`
 *   kit/duplicate-name     a styled-component name defined twice
 *   kit/imports-app        the kit importing pages, shell, demos, blog, docs
 *   kit/internal-import    a page importing kit machinery (`bases`, `site-css`) or a kit subfolder's file
 *   kit/island-styling-runtime
 *       an island (outside `site/demos/`) whose module pulls the styling runtime into the browser
 *   kit/gallery-missing    a kit component that `/brand/kit` does not show
 *   a11y/focus-missing     an interactive styled component with no focus style
 *   a11y/motion-unguarded  motion in a file that never handles reduced motion
 *
 * Out of scope: the token sources (`site/theme.ts`, `site/theme-vars.ts`, the
 * legacy `styles/tokens.css`), synced content, tests and the live examples.
 * The contract and how to clear each rule: `.agents/guides/ui-system/site-design-system.md`.
 *
 * Usage:
 *   bun scripts/check-site-design.ts                   # gate (validate-fast, Fast Gates)
 *   bun scripts/check-site-design.ts --list <rule>     # every finding of a rule, with lines
 *   bun scripts/check-site-design.ts --update          # tighten the baseline (refuses to raise)
 *   bun scripts/check-site-design.ts --update --allow-raise
 *        # only for renamed or moved files: their findings reappear under a new path
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareReadable, type PerFileCounts, type PerFileRatchet, readReadableBaseline, updatePerFile } from './check-readable-ratchet'
import { blankComments } from './site-design/lex'
import { scanLiterals } from './site-design/literals'
import { scanStructure, SRC, type SourceFile } from './site-design/structure'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
export const BASELINE_PATH = join(SCRIPT_DIR, 'site-design-baseline.json')

/** Token sources and synced data: the places raw values are SUPPOSED to live. */
export const EXCLUDED_FILES = [`${SRC}/site/theme.ts`, `${SRC}/site/theme-vars.ts`, `${SRC}/styles/tokens.css`]
const EXCLUDED_DIRS = new Set(['content', 'tests', '__tests__', 'examples', 'node_modules', 'media'])

export interface DesignFinding {
  file: string
  line: number
  rule: string
  detail: string
}

/** Rule prefix → what to do. Printed first, before the files. */
export const FIX: Record<string, string> = {
  literal:
    'Read the value from a token in docs/src/site/theme.ts (space, radius, text, leading, tracking, shadow, z, media, color); in a plain stylesheet use var(--s-…) for scales and var(--c-…) / var(--dx-…) for colours. No token fits? Add one to theme.ts in the same PR.',
  'kit/styled-outside':
    'Define the component in docs/src/site/kit/ (one file per family), show it on /brand/kit, and import it; pages compose kit components and do not style.',
  'kit/extend-css': 'Give the kit component a variant (rocketstyle dimension) instead of patching it with extendCss in a page.',
  'kit/duplicate-name': 'Reuse the existing component of that name, or rename yours (family first: NoteCaption, not HomeNote).',
  'kit/imports-app': 'The kit must not import the app around it (pages, shell, demos, blog, docs): pass the data in as props.',
  'kit/internal-import': 'Import a kit component, not kit/bases or kit/site-css (a styled definition belongs in the kit), and import a kit subfolder through its index.',
  'kit/island-styling-runtime':
    'Keep the styling runtime (~25 KB gzip) out of the island: render plain markup with class names from kit/classes.ts, styled in kit/site-css.ts. Product demos (site/demos/) are the exception.',
  'kit/gallery-missing': 'Show the component on /brand/kit (docs/src/site/pages/KitGallery.tsx), in every variant and state.',
  'a11y/focus-missing': 'Give the interactive component a visible focus style: `focus: focusRing(m)` in its .theme().',
  'a11y/motion-unguarded':
    'Put the transition or animation behind reduced motion: `${reducedMotion} { … none }` (theme.ts) or `@media (prefers-reduced-motion: no-preference)`.',
}

const fixFor = (rule: string): string => FIX[rule] ?? FIX[rule.split('/')[0] as string] ?? ''

const RATCHET: PerFileRatchet = {
  label: 'Site design ratchet',
  description:
    'Site design ratchet — design findings per (file, rule) in docs/src may only DECREASE, and a file not listed here must have none. ' +
    'Checked by `bun scripts/check-site-design.ts` (validate-fast + Fast Gates). Rules and fixes: .agents/guides/ui-system/site-design-system.md. ' +
    'Tighten with `--update`; never raise a count to absorb a finding.',
  updateCommand: 'bun scripts/check-site-design.ts --update',
  fixHint: [],
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!EXCLUDED_DIRS.has(name)) walk(full, out)
    } else if (/\.(tsx?|css)$/.test(name) && !/\.(test|spec|check)\.tsx?$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
}

/** Every in-scope source file of the site, comment-blanked. */
export function loadSources(root: string = REPO_ROOT): SourceFile[] {
  const abs: string[] = []
  walk(join(root, SRC), abs)
  return abs
    .map((f) => relative(root, f).split('\\').join('/'))
    .filter((p) => !EXCLUDED_FILES.includes(p))
    .sort()
    .map((path) => ({ path, text: blankComments(readFileSync(join(root, path), 'utf8'), path.endsWith('.css')) }))
}

/** All findings of the site: literals per file plus the structural rules. */
export function scan(files: readonly SourceFile[]): DesignFinding[] {
  const literals = files.flatMap((f) => scanLiterals(f.text).map((x) => ({ file: f.path, ...x })))
  return [...literals, ...scanStructure(files)]
}

export function countFindings(findings: readonly DesignFinding[]): PerFileCounts {
  const out: PerFileCounts = {}
  for (const f of findings) {
    const perFile = (out[f.file] ??= {})
    perFile[f.rule] = (perFile[f.rule] ?? 0) + 1
  }
  return out
}

/** Print what to do, then where. `true` when nothing grew. */
export function report(findings: readonly DesignFinding[], baseline: PerFileCounts, log = console): boolean {
  const { regressions, improvements } = compareReadable(countFindings(findings), baseline)
  const total = findings.length
  if (regressions.length === 0) {
    const fewer = improvements.reduce((a, x) => a + (x.baseline - x.current), 0)
    log.log(`✓ Site design ratchet — ${total} finding(s), no file above its baseline${fewer > 0 ? `; ${fewer} fewer than the baseline (tighten: ${RATCHET.updateCommand})` : ''}.`)
    return true
  }
  log.error(`✗ Site design ratchet — ${regressions.length} (file, rule) count(s) grew. What to do:`)
  for (const rule of [...new Set(regressions.map((r) => r.rule))].sort()) log.error(`  ${rule}: ${fixFor(rule)}`)
  log.error('\nWhere (every finding of each grown (file, rule); the new one is among them):')
  for (const r of regressions) {
    log.error(`  ${r.file}  ${r.rule}: ${r.baseline} → ${r.current}`)
    for (const f of findings.filter((x) => x.file === r.file && x.rule === r.rule).slice(0, 12)) log.error(`    :${f.line}  ${f.detail}`)
  }
  log.error('\nThe baseline only moves DOWN; never raise it to absorb a finding. Contract: .agents/guides/ui-system/site-design-system.md')
  return false
}

function main(): number {
  const args = process.argv.slice(2)
  const findings = scan(loadSources())
  const listIdx = args.indexOf('--list')
  if (listIdx >= 0) {
    const rule = args[listIdx + 1] ?? ''
    for (const f of findings.filter((x) => x.rule === rule || x.rule.startsWith(`${rule}/`))) console.log(`${f.file}:${f.line}  ${f.rule}  ${f.detail}`)
    return 0
  }
  if (args.includes('--update')) return updatePerFile(countFindings(findings), BASELINE_PATH, RATCHET, args.includes('--allow-raise')) ? 0 : 1
  const baseline = readReadableBaseline(BASELINE_PATH)
  if (!baseline) {
    console.error(`✗ ${BASELINE_PATH} not found. Seed it with \`${RATCHET.updateCommand}\`.`)
    return 1
  }
  return report(findings, baseline.files) ? 0 : 1
}

if (import.meta.main) process.exit(main())
