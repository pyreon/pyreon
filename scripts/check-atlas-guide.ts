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
 * ## Why a CONTRACT digest, and not `toAgentGuide()` or the catalog
 *
 * `atlas scan` emits both an agent guide and a catalog, and neither can be the
 * committed artifact.
 *
 * The catalog is ~1.8 MB of JSON: a real machine surface, but it churns on
 * every scenario and no reviewer can read its diff.
 *
 * The agent guide looked ideal and is disqualified for a subtler reason — it
 * embeds VERIFY VERDICTS. Its `correct:` line is drawn from whichever scenario
 * actually passed, so the file is a function of the mount, not of the contract.
 * Committing it produced a gate that passed locally and failed in CI on one
 * component (`Slider`) purely because a verdict landed differently there. A
 * drift gate whose expected value depends on the machine is a flaky gate, and a
 * flaky gate is a dead one.
 *
 * So this renders its own digest from the graph: names, tags, and every prop
 * with its legal values. Nothing runtime-dependent, nothing verdict-derived.
 *
 *     ## Button [form]
 *     optional: size(small|medium|large), state(primary|secondary|danger|success), …
 *
 * Rename a value and that line changes, so the diff is the finding — and it
 * changes for that reason ONLY.
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
import { diffComponents, renderContract } from './atlas-contract'

/**
 * Packages whose derived contract is committed.
 *
 * Deliberately a short, explicit list rather than every package with an
 * `atlas.config.ts`: the guide is only worth committing where the prop surface
 * is large enough that prose has already failed to keep up with it.
 */
const TRACKED = [{ dir: 'packages/ui/components', guide: 'atlas-contract.md' }]

const ROOT = join(import.meta.dirname, '..')

async function main(): Promise<number> {
  // Imported LAZILY. A static import pulls Atlas's entire type graph into
  // anything that imports this file — including the unit test for the pure
  // renderers below, which then needs `pngjs` types it has no business
  // declaring. Same reasoning Atlas itself uses for Vite.
  const { runScan } = await import('../packages/tools/atlas/src/cli/run')
  const update = process.argv.includes('--update')
  let failed = 0

  for (const { dir, guide } of TRACKED) {
    const pkgDir = join(ROOT, dir)
    const guidePath = join(pkgDir, guide)

    // `write: false` — this owns the file, so the scan must not also write it.
    // Otherwise a verify run would silently "fix" the drift it is checking for,
    // and the gate could never fail.
    const result = await runScan({ cwd: pkgDir, write: false })
    const derived = renderContract(result.graph.list())

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
      writeFileSync(guidePath, derived, 'utf8')
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
    if (committed !== derived) {
      // Name the components whose contract line changed — the diff is the
      // finding, and a bare "out of date" makes the reader go hunting for it.
      const changed = diffComponents(committed, derived)
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

if (import.meta.main) {
  process.exitCode = await main()
}
