// Assert every Kotlin runtime source is actually handed to a gate.
//
// ## Why this gate exists
//
// `verify-kotlin.ts` checks ONE service at a time — `--service=<Name>` compiles
// `<Name>.kt` alone against per-service stubs. That narrowness is deliberate
// (it is how a module gets type-checked with no Android SDK), and the sibling
// `check-duplicate-declarations.ts` already covers the cross-file question it
// cannot answer.
//
// But the SET of services is a hand-written list, repeated across three
// package.json scripts. A hand-maintained input list fails in a specific and
// silent way: it is wrong exactly when a file is ADDED — the moment it has
// something new to check. Nothing tells you. The new file simply is not
// compiled, and every gate stays green.
//
// This is not hypothetical. The router package had the same shape as a
// hardcoded six-file array; the seventh file (`PyreonDeepLink.kt`) was excluded
// the day it was added. That one happened to be LOUD, because an existing file
// referenced the new class and kotlinc then failed on an unresolved reference —
// a red CI run that read as a product bug. Had the new file merely existed
// without being referenced, it would have gone unchecked in silence. That
// silent half is what this gate closes: a scan of the runtime package found six
// sources that no `--service=` invocation had ever named.
//
// ## Why a coverage assertion rather than globbing the sources
//
// Globbing is right for the router, whose files compile together against one
// stub set. It is wrong here: these services compile SEPARATELY on purpose,
// against stubs that deliberately disagree (several declare their own minimal
// `android.content.Context` with just the members that module touches, because
// a superset stub masks real breakage). Compiling them as one set would force
// the stubs to merge and weaken the gates that already work.
//
// So the list stays — and this asserts it is COMPLETE. Milliseconds, no
// toolchain.
//
// ## The exempt list is a ratchet
//
// A source that genuinely cannot be checked yet goes in EXEMPT with a reason,
// which makes the remaining gap enumerable instead of invisible. The list may
// only shrink: an entry that no longer needs exempting (or that names a file
// which no longer exists) FAILS, so it cannot quietly outlive its reason.
//
// Exit 0 when every source is covered or knowingly exempt; exit 1 listing each
// uncovered file.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = join(HERE, '..')
const SOURCE_DIR = join(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime')

/**
 * Sources that no gate compiles yet, each with the reason. Shrink this; never
 * grow it to silence a finding. Both entries below reference Android SDK
 * surface that has no stub in `verify-kotlin.ts` yet — they ARE compiled by the
 * real `gradle assembleDebug` in the device workflow (which builds the whole
 * source set), so they are not unchecked in absolute terms, only absent from
 * the fast gate. Writing the stubs is the follow-up that removes them.
 */
export const EXEMPT: Record<string, string> = {
  PyreonAssets: 'needs android.util.Log + androidx.compose.ui.text.font stubs',
  PyreonWebView: 'needs android.os.Handler/Looper + android.webkit stubs',
}

/**
 * Every service the package's scripts hand to `verify-kotlin.ts`.
 *
 * A segment invoking the script with no `--service=` flag runs the script's own
 * default, so that default is read from the script source rather than assumed —
 * a hardcoded 'PyreonStorage' here would silently drift if the default changed,
 * which is the very failure mode this file exists to prevent. Pure —
 * unit-tested.
 */
export function coveredServices(packageJsonText: string, verifyScriptText: string): Set<string> {
  const defaultMatch = /\?\?\s*'([A-Za-z0-9_]+)'/.exec(verifyScriptText)
  const defaultService = defaultMatch?.[1]
  const covered = new Set<string>()

  // Shell segments, so a bare invocation is distinguishable from a flagged one.
  for (const segment of packageJsonText.split('&&')) {
    if (!segment.includes('verify-kotlin.ts')) continue
    const flag = /--service=([A-Za-z0-9_]+)/.exec(segment)
    if (flag) covered.add(flag[1]!)
    else if (defaultService) covered.add(defaultService)
  }
  return covered
}

/** Sources present on disk, by base name (`PyreonFetch.kt` -> `PyreonFetch`). */
export function sourceNames(files: string[]): string[] {
  return files
    .filter((f) => f.endsWith('.kt'))
    .map((f) => f.slice(0, -'.kt'.length))
    .sort()
}

export interface CoverageResult {
  uncovered: string[]
  staleExempt: string[]
}

/**
 * A source is a finding when no invocation names it and it is not exempt.
 * An EXEMPT entry is stale when its file is gone, or when it is now covered —
 * both mean the entry outlived its reason. Pure — unit-tested.
 */
export function findCoverageGaps(
  sources: string[],
  covered: Set<string>,
  exempt: Record<string, string>,
): CoverageResult {
  const present = new Set(sources)
  return {
    uncovered: sources.filter((s) => !covered.has(s) && !(s in exempt)).sort(),
    staleExempt: Object.keys(exempt)
      .filter((e) => !present.has(e) || covered.has(e))
      .sort(),
  }
}

// ─── main ─────────────────────────────────────────────────────────────────

const packageJsonText = readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')
const verifyScriptText = readFileSync(join(HERE, 'verify-kotlin.ts'), 'utf8')
const sources = sourceNames(readdirSync(SOURCE_DIR))

// An empty scan is a broken gate, never a vacuous pass.
if (sources.length === 0) {
  console.error(`[check-service-coverage] FAILED — no .kt sources found under ${SOURCE_DIR}`)
  process.exit(1)
}

const covered = coveredServices(packageJsonText, verifyScriptText)
const { uncovered, staleExempt } = findCoverageGaps(sources, covered, EXEMPT)

if (uncovered.length > 0 || staleExempt.length > 0) {
  if (uncovered.length > 0) {
    console.error(
      `[check-service-coverage] FAILED — ${uncovered.length} source(s) never handed to verify-kotlin.ts:`,
    )
    for (const name of uncovered) console.error(`  ${name}.kt`)
    console.error(
      '\nAdd `&& bun scripts/verify-kotlin.ts --service=<Name> --typecheck-only` to the',
    )
    console.error(
      'build/test/typecheck scripts. If it cannot compile against stubs yet, add it to',
    )
    console.error('EXEMPT in this file WITH the reason — never leave it silently unchecked.')
  }
  if (staleExempt.length > 0) {
    console.error(
      `\n[check-service-coverage] FAILED — ${staleExempt.length} EXEMPT entry(ies) outlived their reason:`,
    )
    for (const name of staleExempt) {
      console.error(`  ${name} — ${covered.has(name) ? 'now covered' : 'file no longer exists'}`)
    }
    console.error('\nRemove them from EXEMPT. The list may only shrink.')
  }
  process.exit(1)
}

const exemptCount = Object.keys(EXEMPT).length
console.log(
  `[check-service-coverage] ✓ ${sources.length - exemptCount}/${sources.length} sources gated` +
    (exemptCount > 0 ? ` (${exemptCount} exempt: ${Object.keys(EXEMPT).join(', ')})` : ''),
)
