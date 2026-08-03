#!/usr/bin/env bun
/**
 * check-ios-signing-policy — a workflow step that RUNS an iOS app must not
 * disable code signing.
 *
 * ## The bug class
 *
 * `CODE_SIGNING_ALLOWED=NO` is the reflex for simulator builds: a simulator
 * needs no provisioning profile, so turning signing off is free. For
 * `xcodebuild build` that reasoning is sound — the app is never launched, and
 * nothing asks it for an entitlement.
 *
 * For `xcodebuild test` it is wrong, and wrong in a way that produces a
 * local-pass/CI-fail split. An UNSIGNED app carries no signature entitlements,
 * and the simulator's securityd DENIES `SecItemAdd` for it — so anything the
 * app does through the Keychain fails ONLY in CI, where the flag is set.
 * Locally, `xcodebuild test` ad-hoc signs by default and everything passes.
 *
 * This already happened once and was fixed on ONE step, with a comment
 * explaining the reasoning. That left four other `xcodebuild test` steps
 * carrying the flag — latent, because none of their suites touched the
 * Keychain yet. The moment a session-rehydration test landed in the finance
 * app, it failed in CI and passed on every developer machine.
 *
 * A fix applied to one call site is folklore. This makes it policy.
 *
 * ## The rule
 *
 *   xcodebuild build … CODE_SIGNING_ALLOWED=NO   ← allowed (never launches)
 *   xcodebuild test  … CODE_SIGNING_ALLOWED=NO   ← rejected (runs the app)
 *
 * Ad-hoc signing costs nothing on a bare runner, so there is no reason to
 * carry the flag on a step that runs anything.
 *
 * ## The second half
 *
 * Dropping the flag is necessary but not sufficient: securityd also wants the
 * app to HAVE an entitlements blob, and xcodegen's `entitlements:` key alone
 * does not embed one under ad-hoc signing — only the explicit
 * `CODE_SIGN_ENTITLEMENTS` build setting does (verified: `codesign -d
 * --entitlements :-` read an empty dict on an app that had the key).
 *
 * So every `native-*-ios` example must set it, uniformly, whether or not its
 * CURRENT tests touch the Keychain. That uniformity IS the fix: the first time
 * round, one example was corrected and four were left a single test away from
 * the same CI-only failure.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOWS = join(REPO_ROOT, '.github', 'workflows')

export type Violation = { file: string; line: number; snippet: string }
export type EntitlementGap = { project: string }

/**
 * Find `xcodebuild test` invocations that carry `CODE_SIGNING_ALLOWED=NO`.
 *
 * Scans line-by-line: entering an invocation on `xcodebuild test` and leaving
 * it at the first line that does not continue the shell command (no trailing
 * backslash on the previous line). That is enough for the multi-line
 * `xcodebuild … \` shape every step here uses, and it deliberately does NOT
 * try to parse YAML — the flag is a shell argument, not a YAML key.
 */
export function findSigningViolations(source: string, file = ''): Violation[] {
  const lines = source.split('\n')
  const out: Violation[] = []
  let inTestInvocation = false

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (/\bxcodebuild\s+test\b/.test(line)) {
      inTestInvocation = true
      continue
    }
    if (!inTestInvocation) continue

    if (/CODE_SIGNING_ALLOWED\s*=\s*NO/.test(line)) {
      out.push({ file, line: i + 1, snippet: line.trim() })
    }
    // The invocation ends at the first line whose PREDECESSOR did not continue.
    if (!lines[i - 1]!.trimEnd().endsWith('\\')) inTestInvocation = false
  }
  return out
}

/**
 * Every iOS example project must set `CODE_SIGN_ENTITLEMENTS`. Returns the
 * ones that do not.
 */
export function findEntitlementGaps(
  projects: { path: string; source: string }[],
): EntitlementGap[] {
  return projects
    .filter(({ source }) => !/^\s*CODE_SIGN_ENTITLEMENTS\s*:/m.test(source))
    .map(({ path }) => ({ project: path }))
}

function iosProjects(): { path: string; source: string }[] {
  const examples = join(REPO_ROOT, 'examples')
  if (!existsSync(examples)) return []
  const out: { path: string; source: string }[] = []
  for (const dir of readdirSync(examples)) {
    if (!/^native-.*-ios$/.test(dir)) continue
    const yml = join(examples, dir, 'project.yml')
    if (!existsSync(yml)) continue
    out.push({ path: `examples/${dir}/project.yml`, source: readFileSync(yml, 'utf8') })
  }
  return out
}

function main(): number {
  if (!existsSync(WORKFLOWS)) {
    console.error('✗ check-ios-signing-policy: no .github/workflows directory')
    return 1
  }

  const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))
  const violations: Violation[] = []
  let scannedInvocations = 0

  for (const f of files) {
    const src = readFileSync(join(WORKFLOWS, f), 'utf8')
    scannedInvocations += (src.match(/\bxcodebuild\s+test\b/g) ?? []).length
    violations.push(...findSigningViolations(src, `.github/workflows/${f}`))
  }

  // An empty scan is a skip wearing a pass. If the repo stops running
  // `xcodebuild test` in CI at all this gate protects nothing, and that should
  // be a loud change rather than a silent green.
  if (scannedInvocations === 0) {
    console.error(
      '✗ check-ios-signing-policy: found NO `xcodebuild test` invocation in any\n' +
        '  workflow. Either the iOS device gates were removed (make that explicit)\n' +
        '  or this scanner stopped matching them and is protecting nothing.',
    )
    return 1
  }

  const projects = iosProjects()
  const gaps = findEntitlementGaps(projects)
  if (projects.length === 0) {
    console.error(
      '✗ check-ios-signing-policy: found NO native-*-ios example project.yml.\n' +
        '  Either the iOS examples were removed (make that explicit) or this\n' +
        '  scanner stopped finding them and is protecting nothing.',
    )
    return 1
  }

  if (violations.length === 0 && gaps.length === 0) {
    console.log(
      `✓ check-ios-signing-policy: ${scannedInvocations} \`xcodebuild test\` invocation(s) sign their app; ` +
        `${projects.length} iOS example(s) set CODE_SIGN_ENTITLEMENTS`,
    )
    return 0
  }

  if (gaps.length > 0) {
    console.error(
      '✗ check-ios-signing-policy: iOS example does not set CODE_SIGN_ENTITLEMENTS\n',
    )
    for (const g of gaps) console.error(`  ${g.project}`)
    console.error(
      '\n  xcodegen\'s `entitlements:` key alone does NOT embed an entitlements blob\n' +
        '  under ad-hoc simulator signing — only the explicit build setting does — and\n' +
        '  securityd denies SecItemAdd to an app without one, so any Keychain use\n' +
        '  fails ONLY in CI. Set it on EVERY iOS example, not just the ones whose\n' +
        '  tests happen to touch the Keychain today.\n',
    )
    if (violations.length === 0) return 1
  }

  console.error(
    '✗ check-ios-signing-policy: `xcodebuild test` must not set CODE_SIGNING_ALLOWED=NO\n',
  )
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}   ${v.snippet}`)
  }
  console.error(
    '\n  An UNSIGNED simulator app carries no signature entitlements, and securityd\n' +
      '  DENIES SecItemAdd for it — so any Keychain use fails ONLY in CI, while\n' +
      '  `xcodebuild test` ad-hoc signs by default on a developer machine and passes.\n' +
      '  Ad-hoc signing is free on a bare runner: delete the flag. It remains correct\n' +
      '  on `xcodebuild build` steps, which never launch the app.',
  )
  return 1
}

if (import.meta.main) process.exit(main())

export { main as checkIosSigningPolicy }
