/**
 * Gate: a gated example's HARDCODED Gradle srcDirs must match what
 * `pyreon-native wire` resolves from its declared dependencies.
 *
 * WHY THIS EXISTS. The CLI resolves native co-source by walking an app's
 * dependencies transitively — that is the mechanism a scaffolded consumer app
 * uses, and it is correct. The repo's own examples instead hardcode a
 * `srcDir(...)` list, so the two can disagree, and when they do it is the
 * example that is wrong:
 *
 *   - Adding a package to an example's source and its package.json, but not to
 *     the Gradle list, fails a real `gradle assembleDebug` with an unresolved
 *     reference — which no stub, unit test or coverage check can see. That
 *     happened for real with PyreonSizedMap and PyreonCrdtDoc, ~50 minutes into
 *     CI, and again on the iOS side.
 *   - The consumer path (`wire`) is exercised by NO gate at all, so the
 *     mechanism users actually depend on ships unproven. This gate runs it on
 *     every check, which is the cheapest way to keep it honest.
 *
 * The comparison is by PACKAGE NAME, not by path: the example's paths are
 * repo-relative and the CLI's are absolute node_modules paths, and neither is
 * more correct than the other — what matters is that the same SET of packages
 * is wired.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO = resolve(new URL('..', import.meta.url).pathname)

/** `srcDir("…/@pyreon/x/native/kotlin")` / `…/packages/<cat>/x/native/kotlin` → `x`. */
export function packagesInGradle(gradle: string): Set<string> {
  const out = new Set<string>()
  for (const m of gradle.matchAll(/srcDir\("([^"]+)"\)/g)) {
    const p = m[1] ?? ''
    // The two base runtimes are wired by path shape, not as feature packages.
    if (p.includes('native/runtime-kotlin') || p.includes('native/router-kotlin')) continue
    const hit = /\/([^/]+)\/native\/kotlin/.exec(p)
    if (hit?.[1]) out.add(hit[1])
  }
  return out
}

/** Absolute `…/node_modules/@pyreon/x/native/kotlin` → `x`. */
export function packagesInWiring(dirs: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const d of dirs) {
    const hit = /@pyreon\/([^/]+)\/native\/kotlin/.exec(d)
    if (hit?.[1]) out.add(hit[1])
  }
  return out
}

/**
 * How many `@pyreon/*` dependencies the shared example DECLARES. Used only to
 * tell an under-installed checkout apart from real drift: `wireApp` resolves
 * through node_modules, so a missing install makes it return a subset and the
 * drift report inverts — it blames the Gradle file for wiring that is correct.
 */
export function declaredPyreonDeps(pkgJsonPath: string): number {
  try {
    const pj = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>
    }
    return Object.keys(pj.dependencies ?? {}).filter((d) => d.startsWith('@pyreon/')).length
  } catch {
    return 0
  }
}

export interface DriftFinding {
  example: string
  missingFromGradle: string[]
  extraInGradle: string[]
}

/** Pure comparison, so the interesting half is unit-testable without fs. */
export function compareSets(
  example: string,
  gradle: Set<string>,
  wired: Set<string>,
): DriftFinding | null {
  const missingFromGradle = [...wired].filter((p) => !gradle.has(p)).sort()
  const extraInGradle = [...gradle].filter((p) => !wired.has(p)).sort()
  if (missingFromGradle.length === 0 && extraInGradle.length === 0) return null
  return { example, missingFromGradle, extraInGradle }
}

async function main(): Promise<number> {
  const { wireApp } = await import('../packages/native/cli/src/wire')
  const findings: DriftFinding[] = []
  let checked = 0

  for (const pair of [
    { android: 'native-tasks-android', shared: 'native-tasks' },
    { android: 'native-finance-android', shared: 'native-finance' },
  ]) {
    const gradlePath = join(REPO, 'examples', pair.android, 'app/build.gradle.kts')
    const sharedDir = join(REPO, 'examples', pair.shared)
    if (!existsSync(gradlePath) || !existsSync(sharedDir)) continue
    checked += 1
    const gradle = packagesInGradle(readFileSync(gradlePath, 'utf8'))
    const wired = packagesInWiring(wireApp(sharedDir).androidSrcDirs)
    // `wireApp` resolves through the example's node_modules, so an
    // UNDER-INSTALLED checkout makes it return a subset — and the drift report
    // below then reads as "the app no longer declares these; drop the srcDir",
    // which is the opposite of the truth and would have someone delete working
    // wiring. Ask whether the shared example declares more `@pyreon/*` deps
    // than the resolver could reach; if so, the answer is an install, not a
    // drift.
    const declared = declaredPyreonDeps(join(sharedDir, 'package.json'))
    if (declared > 0 && wired.size === 0) {
      console.error(
        `[check-native-srcdirs-drift] ✗ ${pair.shared} declares ${declared} @pyreon/* ` +
          `dependencies but \`wire\` resolved NONE of them — this checkout is not ` +
          `installed. Run \`bun install\`. (In CI this means the install step did not ` +
          `run for this job; the Gradle srcDirs are not the problem.)`,
      )
      return 1
    }
    const finding = compareSets(pair.android, gradle, wired)
    if (finding) findings.push(finding)
  }

  // An empty scan is a SKIP masquerading as a pass — the failure mode this
  // repo has hit before with file-scanning gates.
  if (checked === 0) {
    console.error('[check-native-srcdirs-drift] ✗ no example pairs found — the gate measured nothing')
    return 1
  }

  if (findings.length > 0) {
    console.error('[check-native-srcdirs-drift] ✗ hardcoded Gradle srcDirs disagree with `pyreon-native wire`:\n')
    for (const f of findings) {
      console.error(`  ${f.example}`)
      if (f.missingFromGradle.length > 0) {
        console.error(`    MISSING from build.gradle.kts: ${f.missingFromGradle.join(', ')}`)
        console.error(`      → a real gradle build fails with an unresolved reference; add a srcDir for each.`)
      }
      if (f.extraInGradle.length > 0) {
        console.error(`    EXTRA in build.gradle.kts: ${f.extraInGradle.join(', ')}`)
        console.error(`      → the app no longer declares these; drop the srcDir or add the dependency.`)
      }
    }
    return 1
  }

  console.log(
    `[check-native-srcdirs-drift] ✓ ${checked} example(s): hardcoded srcDirs match what \`wire\` resolves`,
  )
  return 0
}

if (import.meta.main) process.exit(await main())
