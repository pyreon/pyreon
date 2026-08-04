#!/usr/bin/env bun
/**
 * Keep the AI-facing component contract in sync with the components.
 *
 * ## The problem this closes
 *
 * `@pyreon/ui-components` is the largest prop surface in the repo — 108
 * components, 67 of them rocketstyle chains — and until now none of it was
 * machine-readable. Its contract lived in prose (`CLAUDE.md`,
 * `.claude/rules/code-style.md`), which is what an AI assistant reads and what
 * nothing verifies. Rename a dimension value and the prose keeps confidently
 * teaching the old one.
 *
 * That is not hypothetical for this library. `Element`'s layout props are
 * deliberately near-homographs — `direction` vs `contentDirection`, `alignX`
 * vs `contentAlignX`, one governing the SLOT axis and one the CONTENT axis —
 * and a `Button` carries both in a single `.attrs()`. Prose is the worst
 * possible medium for a distinction like that.
 *
 * ## Why the guide, and not the catalog
 *
 * `atlas scan` emits both. The catalog is ~1.8 MB of JSON — a real machine
 * surface, but it churns on every scenario and no reviewer can read its diff.
 * The agent guide is ~9.5 KB of exactly the thing that must not drift:
 *
 *     ## Button [form]
 *     optional: state(primary|secondary|danger|success), size(small|medium|large), …
 *     correct: {"state":"primary","size":"small","variant":"solid"}
 *
 * One line per component, listing every legal value, with a VERIFIED example.
 * Rename a value and that line changes, so the diff is the finding.
 *
 * ## Semi-automatic, deliberately
 *
 * Nothing here authors documentation — the guide is DERIVED by running the
 * rocketstyle chains against a real theme, which is the only way to know values
 * that live inside `.states((t) => …)` callbacks. The human step is one command
 * (`--update`) and reviewing the diff, which is the same contract `gen-docs`
 * already uses for manifests.
 *
 * Usage:
 *   bun scripts/check-atlas-guide.ts            # verify (CI + validate-fast)
 *   bun scripts/check-atlas-guide.ts --update   # regenerate after a real change
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runScan } from '../packages/tools/atlas/src/cli/run'

/**
 * Packages whose derived contract is committed.
 *
 * Deliberately a short, explicit list rather than every package with an
 * `atlas.config.ts`: the guide is only worth committing where the prop surface
 * is large enough that prose has already failed to keep up with it.
 */
const TRACKED = [{ dir: 'packages/ui/components', guide: 'atlas-agent-guide.md' }]

const ROOT = join(import.meta.dirname, '..')

async function main(): Promise<number> {
  const update = process.argv.includes('--update')
  let failed = 0

  for (const { dir, guide } of TRACKED) {
    const pkgDir = join(ROOT, dir)
    const guidePath = join(pkgDir, guide)

    // `write: false` — this owns the file, so the scan must not also write it.
    // Otherwise a verify run would silently "fix" the drift it is checking for,
    // and the gate could never fail.
    const result = await runScan({ cwd: pkgDir, write: false })

    // A scan that found almost nothing is a BROKEN scan, not an empty package,
    // and writing its guide would erase the real contract. This package has 108
    // components; the failure mode that produced 7 (an unresolvable import, so
    // every rocketstyle chain failed to load) is exactly what this guards.
    if (result.components < 50) {
      process.stderr.write(
        `[atlas-guide] ${dir}: scan found only ${result.components} component(s) — refusing to ` +
          `trust that. This package has ~108; a collapse like this means the scan could not LOAD ` +
          `the modules, not that the components are gone.\n` +
          (result.loadErrors?.length
            ? `  ${result.loadErrors.length} file(s) failed to load, e.g. ${result.loadErrors[0]!.message}\n`
            : `  Run \`atlas scan\` in ${dir} to see what it reported.\n`),
      )
      failed++
      continue
    }

    if (update) {
      writeFileSync(guidePath, result.guide, 'utf8')
      process.stdout.write(
        `[atlas-guide] ${dir}: wrote ${guide} (${result.components} components)\n`,
      )
      continue
    }

    if (!existsSync(guidePath)) {
      process.stderr.write(
        `[atlas-guide] ${dir}: ${guide} is missing. Run \`bun run atlas-guide --update\`.\n`,
      )
      failed++
      continue
    }

    const committed = readFileSync(guidePath, 'utf8')
    if (committed !== result.guide) {
      // Name the components whose contract line changed — the diff is the
      // finding, and a bare "out of date" makes the reader go hunting for it.
      const changed = diffComponents(committed, result.guide)
      process.stderr.write(
        `[atlas-guide] ${dir}: ${guide} is out of date — the components changed and the ` +
          `AI-facing contract did not.\n` +
          (changed.length > 0
            ? `  changed: ${changed.slice(0, 8).join(', ')}${changed.length > 8 ? ` … +${changed.length - 8}` : ''}\n`
            : '') +
          `  Run \`bun run atlas-guide --update\` and review the diff.\n`,
      )
      failed++
    }
  }

  if (failed === 0 && !update) {
    process.stdout.write(`[atlas-guide] ${TRACKED.length} package(s) in sync.\n`)
  }
  return failed === 0 ? 0 : 1
}

/** Component headings whose block differs between two guides. */
export function diffComponents(before: string, after: string): string[] {
  const blocks = (text: string): Map<string, string> => {
    const out = new Map<string, string>()
    let name = ''
    let body: string[] = []
    for (const line of text.split('\n')) {
      const heading = /^## (\S+)/.exec(line)
      if (heading) {
        if (name) out.set(name, body.join('\n'))
        name = heading[1]!
        body = []
      } else if (name) {
        body.push(line)
      }
    }
    if (name) out.set(name, body.join('\n'))
    return out
  }
  const a = blocks(before)
  const b = blocks(after)
  const names = new Set([...a.keys(), ...b.keys()])
  return [...names].filter((n) => a.get(n) !== b.get(n)).sort()
}

if (import.meta.main) {
  process.exitCode = await main()
}
