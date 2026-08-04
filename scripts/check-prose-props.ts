#!/usr/bin/env bun
/**
 * Prose may not name a prop that does not exist.
 *
 * ## Why this is the piece that was missing
 *
 * The derived contract (`check-atlas-guide`) covers what CAN be derived:
 * component names, props, legal values. What it structurally cannot derive is
 * SEMANTICS — "X is always horizontal regardless of `direction`", "`block: true`
 * on app roots or Element shrink-wraps". That knowledge is causal, it is about
 * consequences, and nothing reads it out of source.
 *
 * So semantics stay hand-written. The exposure is that hand-written prose is
 * unfalsifiable: rename a prop and `.claude/rules/code-style.md` keeps
 * confidently teaching the old name to every assistant that reads it — which is
 * worse than silence, because it is specific and wrong.
 *
 * This does not try to derive meaning. It asserts the ONE thing that is
 * checkable: every prop name the prose mentions must exist on the real type.
 * Prose can still be wrong about what a prop DOES; it can no longer be wrong
 * about whether it exists, which is the decay mode a rename actually causes.
 *
 * ## Opt-in markers, not guesswork
 *
 * The Element prose is dense with backticks covering three different things —
 * prop names (`contentDirection`), VALUES (`'inline'`, `left|center|right`), and
 * CSS terms (justify-content). Guessing which are props would false-positive
 * constantly, and a gate that cries wolf gets suppressed.
 *
 * So authors mark them, the same opt-in shape `check-doc-examples` uses for
 * `// @check` code blocks:
 *
 *     <!-- @props @pyreon/elements Element: contentDirection, contentAlignX, gap -->
 *
 * Unmarked prose is not checked. Coverage grows as authors add markers, and a
 * marker can never be wrong-by-omission — only wrong-by-naming-a-dead-prop,
 * which is the whole point.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/** Files scanned for `@props` markers. */
const PROSE = ['.claude/rules/code-style.md', 'CLAUDE.md']

/**
 * Where a marked component's props are DECLARED.
 *
 * Explicit rather than resolved, because the mapping is small, stable, and a
 * wrong guess here would fail the gate for a reason that has nothing to do with
 * the prose it is checking.
 */
const PROP_SOURCES: Record<string, string> = {
  '@pyreon/elements Element': 'packages/ui-system/elements/src/Element/types.ts',
}

export interface ProseMarker {
  file: string
  line: number
  component: string
  props: string[]
}

/** Parse `<!-- @props <component>: a, b, c -->` markers out of a markdown file. */
export function parseMarkers(file: string, text: string): ProseMarker[] {
  const out: ProseMarker[] = []
  text.split('\n').forEach((line, i) => {
    const m = /<!--\s*@props\s+([^:]+?):\s*(.+?)\s*-->/.exec(line)
    if (!m) return
    out.push({
      file,
      line: i + 1,
      component: m[1]!.trim(),
      props: m[2]!
        .split(',')
        .map((p) => p.trim().replace(/^`|`$/g, ''))
        .filter(Boolean),
    })
  })
  return out
}

/**
 * Property names declared in a TypeScript interface/type source.
 *
 * A deliberately simple scan rather than the compiler API: these are hand-
 * written prop interfaces, one `name: Type` per line, and pulling in the TS
 * program to read them would cost seconds per run for no extra correctness.
 * Over-collecting is SAFE here — the gate only asserts that a prose name is
 * present, so a few extra names can never produce a false failure.
 */
export function declaredProps(source: string): Set<string> {
  const names = new Set<string>()
  for (const line of source.split('\n')) {
    const m = /^\s{2,}([a-zA-Z][a-zA-Z0-9_]*)\??\s*:/.exec(line)
    if (m) names.add(m[1]!)
  }
  return names
}

function main(): number {
  const markers = PROSE.flatMap((f) => {
    try {
      return parseMarkers(f, readFileSync(join(ROOT, f), 'utf8'))
    } catch {
      return []
    }
  })

  if (markers.length === 0) {
    process.stdout.write('[prose-props] no @props markers found — nothing to check.\n')
    return 0
  }

  const cache = new Map<string, Set<string>>()
  let failed = 0
  let checked = 0

  for (const marker of markers) {
    const sourcePath = PROP_SOURCES[marker.component]
    if (!sourcePath) {
      process.stderr.write(
        `[prose-props] ${marker.file}:${marker.line} marks \`${marker.component}\`, which has no ` +
          `entry in PROP_SOURCES. Add one naming the file that DECLARES those props.\n`,
      )
      failed++
      continue
    }
    let declared = cache.get(sourcePath)
    if (!declared) {
      declared = declaredProps(readFileSync(join(ROOT, sourcePath), 'utf8'))
      cache.set(sourcePath, declared)
    }

    const missing = marker.props.filter((p) => !declared.has(p))
    checked += marker.props.length
    if (missing.length > 0) {
      process.stderr.write(
        `[prose-props] ${marker.file}:${marker.line} — ${marker.component} prose names ` +
          `${missing.length} prop(s) that do not exist: ${missing.join(', ')}\n` +
          `  Declared in ${sourcePath}. Either the prop was renamed and the prose was not ` +
          `updated, or the marker has a typo.\n`,
      )
      failed++
    }
  }

  if (failed === 0) {
    process.stdout.write(
      `[prose-props] ${checked} prop name(s) across ${markers.length} marker(s) all exist.\n`,
    )
  }
  return failed === 0 ? 0 : 1
}

if (import.meta.main) {
  process.exitCode = main()
}
