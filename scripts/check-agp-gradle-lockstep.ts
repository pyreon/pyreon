#!/usr/bin/env bun
/**
 * check-agp-gradle-lockstep — AGP's minimum Gradle must be <= the pinned one.
 *
 * WHY THIS GATE EXISTS. The Android examples ship no `gradlew` wrapper, so
 * `native-device.yml` downloads a pinned, sha256-verified Gradle distribution
 * itself. That means the AGP version (in `examples/native-*-android/
 * build.gradle.kts`) and the Gradle version (in the workflow) live in DIFFERENT
 * files with nothing connecting them.
 *
 * Raising one without the other fails deep inside the build, ~6 minutes in, on
 * a job that only runs for native-labelled PRs:
 *
 *   Caused by: java.lang.IllegalStateException:
 *   Minimum supported Gradle version is 8.13. Current version is 8.10.2.
 *
 * That is exactly what the 2026-08 stack bump did (AGP 8.7.0 -> 8.13.2 against
 * a Gradle pin still at 8.10.2). The failure is cheap to prevent and expensive
 * to discover, which is the definition of something that should be a gate.
 *
 * The mapping below is AGP's published "minimum Gradle version" table. Add a
 * row when adopting a newer AGP; an AGP with no row is a hard failure rather
 * than a silent pass, because guessing the minimum is how this breaks.
 *
 * It also rejects the `kotlinOptions` DSL, for the same reason in a different
 * file. Kotlin 2.4 turned it from a deprecation into a hard ERROR — "Using
 * 'jvmTarget: String' is an error. Please migrate to the compilerOptions DSL"
 * — and that surfaced only after the Gradle pin was fixed, i.e. as a SECOND
 * ~6-minute round trip on the same PR. Both checks exist so a toolchain bump
 * costs one second instead of one job.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** AGP major.minor -> minimum Gradle. Source: AGP release notes. */
export const AGP_MIN_GRADLE: Record<string, string> = {
  '8.7': '8.9',
  '8.8': '8.10.2',
  '8.9': '8.11.1',
  '8.10': '8.11.1',
  '8.11': '8.13',
  '8.12': '8.13',
  '8.13': '8.13',
  '8.14': '8.14',
}

export function cmpVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

export function minGradleFor(agp: string): string | null {
  const [maj, min] = agp.split('.')
  return AGP_MIN_GRADLE[`${maj}.${min}`] ?? null
}

export function extractAgp(source: string): string | null {
  return /id\("com\.android\.application"\)\s+version\s+"([0-9.]+)"/.exec(source)?.[1] ?? null
}

/**
 * A real `kotlinOptions { ... }` configuration block. Deliberately anchored to
 * the opening brace so the word appearing in a COMMENT (including the one this
 * repo now keeps next to the replacement) does not trip the gate.
 *
 * @internal exported for unit testing
 */
export function usesKotlinOptionsDsl(source: string): boolean {
  return source
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .some((l) => /\bkotlinOptions\s*\{/.test(l))
}

export function extractPinnedGradle(workflow: string): string | null {
  return /GRADLE_VERSION:\s*'([0-9.]+)'/.exec(workflow)?.[1] ?? null
}

function main(): number {
  const root = resolve(import.meta.dirname, '..')
  const wf = join(root, '.github/workflows/native-device.yml')
  const pinned = extractPinnedGradle(readFileSync(wf, 'utf8'))
  if (!pinned) {
    console.error('[check-agp-gradle-lockstep] ✗ no GRADLE_VERSION found in native-device.yml')
    return 1
  }

  const examplesDir = join(root, 'examples')
  const apps = readdirSync(examplesDir).filter(
    (d) => d.startsWith('native-') && d.endsWith('-android'),
  )
  if (apps.length === 0) {
    console.error('[check-agp-gradle-lockstep] ✗ scanned ZERO android examples — the glob is wrong')
    return 1
  }

  const problems: string[] = []
  let sawGradleMismatch = false
  for (const app of apps) {
    const f = join(examplesDir, app, 'build.gradle.kts')
    let src: string
    try {
      src = readFileSync(f, 'utf8')
    } catch {
      continue
    }
    const agp = extractAgp(src)
    if (!agp) continue
    const min = minGradleFor(agp)
    if (min === null) {
      sawGradleMismatch = true
      problems.push(
        `  ${app}: AGP ${agp} has no row in AGP_MIN_GRADLE — add its published minimum Gradle version.`,
      )
      continue
    }
    if (cmpVersions(pinned, min) < 0) {
      sawGradleMismatch = true
      problems.push(
        `  ${app}: AGP ${agp} needs Gradle >= ${min}, but native-device.yml pins ${pinned}.`,
      )
    }
  }

  for (const app of apps) {
    const f = join(examplesDir, app, 'app', 'build.gradle.kts')
    let src: string
    try {
      src = readFileSync(f, 'utf8')
    } catch {
      continue
    }
    if (usesKotlinOptionsDsl(src)) {
      problems.push(
        `  ${app}/app: uses the \`kotlinOptions\` DSL, which is a hard ERROR on Kotlin 2.4+. Use \`kotlin { compilerOptions { jvmTarget = ... } }\` OUTSIDE the android block.`,
      )
    }
  }

  if (problems.length > 0) {
    console.error('[check-agp-gradle-lockstep] ✗ android build config is out of step:')
    console.error(problems.join('\n'))
    // Only print the Gradle remedy when a Gradle mismatch is actually among the
    // problems — each `kotlinOptions` line already carries its own fix, and
    // pointing someone at GRADLE_VERSION for a DSL error sends them to the
    // wrong file.
    if (sawGradleMismatch) {
      console.error('')
      console.error('Fix: raise GRADLE_VERSION (and GRADLE_SHA256, from')
      console.error('services.gradle.org/distributions/gradle-<V>-bin.zip.sha256) in')
      console.error('.github/workflows/native-device.yml.')
    }
    return 1
  }

  console.log(
    `[check-agp-gradle-lockstep] ✓ ${apps.length} android example(s) satisfied by pinned Gradle ${pinned}`,
  )
  return 0
}

if (import.meta.main) process.exit(main())
