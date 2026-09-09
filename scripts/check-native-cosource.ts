// check-native-cosource — verify CO-LOCATED native runtime sources.
//
// The co-location architecture ships each cross-platform package's native
// runtime beside its `src/`: `@pyreon/<pkg>/native/{swift,kotlin}/` (declared
// via the package.json `pyreon.native` field), aggregated into a native app
// build by `pyreon-native wire`. That means the native code is NO LONGER under
// `@pyreon/native-runtime-*`'s own `src/`, so the runtime packages' own
// `swift test` / `verify-kotlin --service` chains don't cover it — this gate
// does, so a co-located `.swift`/`.kt` can't rot silently.
//
// For each package with a `pyreon.native` field (EXCEPT the base
// `@pyreon/native-*` runtime/router packages, which self-verify via their own
// build/test):
//   - Kotlin: `verify-kotlin.ts --source=<file> --test=<file> --service=<Name>`
//     — reuses the runtime-kotlin stub harness (the `--service` selects the
//     stub bundle by the file's basename); typechecks + smoke-runs.
//   - Swift: `swiftc -typecheck` the source; if a `native/tests/*.swift`
//     exists, compile source+test and run it.
//
// Skips gracefully when a toolchain is absent (CI Linux has kotlinc but no
// SwiftUI SDK). An EMPTY scan is a SKIP + warning, never a silent clean pass.

import { execSync, spawnSync } from 'node:child_process'
import {
  readVerdict,
  verdictKey,
  writeVerdict,
} from '../packages/native/runtime-kotlin/scripts/verdict-cache'
import {
  kotlinOutcomeLabel,
  smokeSkipped,
} from '../packages/native/runtime-kotlin/scripts/smoke-marker'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

interface CoSourcePkg {
  name: string
  dir: string
  swiftDir?: string
  kotlinDir?: string
  testsDir?: string
  // Explicit per-service file GROUPS for a package whose Kotlin runtime is
  // SEVERAL independent services needing mutually-exclusive stubs (storage =
  // one Storage/SecureStorage/Backends common group; hooks = ~21). Each group
  // KEY is the `--service` stub bundle; the value lists the group's `.kt` files
  // (relative to native/kotlin/com/pyreon/runtime). `*Android.kt` files that
  // need the real Android SDK are omitted here — the device gate verifies them.
  // Omitted → whole-dir mode.
  kotlinServices?: Record<string, string[]>
  // Files DELIBERATELY outside the stub harness because they import the real
  // Android SDK (android.webkit, android.hardware, ...) — the device gate
  // verifies those. Declared rather than inferred: an implicit omission and a
  // forgotten one look identical, which is how PyreonWebView.kt went
  // unverified without anyone choosing that.
  kotlinSdkOnly?: string[]
}

function has(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** All `.kt`/`.swift` files under a dir, recursively. */
function filesUnder(dir: string, ext: string): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith(ext)) out.push(p)
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

/** Scan `packages/<cat>/<pkg>/package.json` for a `pyreon.native` field. */
function scanCoSourcePackages(): CoSourcePkg[] {
  const found: CoSourcePkg[] = []
  const pkgRoot = join(ROOT, 'packages')
  for (const cat of readdirSync(pkgRoot)) {
    const catDir = join(pkgRoot, cat)
    if (!statSync(catDir).isDirectory()) continue
    for (const pkg of readdirSync(catDir)) {
      const dir = join(catDir, pkg)
      const manifestPath = join(dir, 'package.json')
      if (!existsSync(manifestPath)) continue
      let manifest: {
        name?: string
        pyreon?: {
          native?: {
            swift?: string
            kotlin?: string
            kotlinServices?: Record<string, string[]>
            kotlinSdkOnly?: string[]
          }
        }
      }
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      } catch {
        continue
      }
      const native = manifest.pyreon?.native
      if (!native) continue
      // The base runtime/router packages self-verify (swift build / the
      // verify-kotlin --service chain); this gate is for FEATURE co-location.
      if ((manifest.name ?? '').startsWith('@pyreon/native-')) continue
      const swiftDir = native.swift ? join(dir, native.swift) : undefined
      const kotlinDir = native.kotlin ? join(dir, native.kotlin) : undefined
      const testsDir = join(dir, 'native', 'tests')
      found.push({
        name: manifest.name ?? pkg,
        dir,
        ...(swiftDir && existsSync(swiftDir) ? { swiftDir } : {}),
        ...(kotlinDir && existsSync(kotlinDir) ? { kotlinDir } : {}),
        ...(existsSync(testsDir) ? { testsDir } : {}),
        ...(native.kotlinServices ? { kotlinServices: native.kotlinServices } : {}),
        ...(native.kotlinSdkOnly ? { kotlinSdkOnly: native.kotlinSdkOnly } : {}),
      })
    }
  }
  return found
}

/** `PyreonToast.kt` → `PyreonToast` (the verify-kotlin --service stub key). */
function serviceName(file: string): string {
  return file.replace(/^.*\//, '').replace(/\.(kt|swift)$/, '')
}

let failures = 0
const pkgs = scanCoSourcePackages()

if (pkgs.length === 0) {
  console.warn('[check-native-cosource] no co-located native packages found (pyreon.native) — SKIP')
  process.exit(0)
}

const kotlinc = has('kotlinc')
const swiftc = has('swiftc')
// On Linux CI `swiftc` EXISTS but the Apple SDK frameworks the co-located
// runtimes import (SwiftUI, Observation) do NOT — a co-located `import SwiftUI`
// file fails to compile there. Swift is verified on a real SDK by the macOS
// "Validate emitted Swift (real-SDK typecheck)" job + the device gate; here we
// only run the Swift half when the full SDK is present (macOS). Probe once.
const swiftFullSdk =
  swiftc &&
  (() => {
    try {
      // Secure temp dir (mkdtemp → unique, 0700, random suffix) rather than a
      // predictable `join(tmpdir(), 'fixed-name')` — the latter is a symlink/race
      // vector (js/insecure-temporary-file).
      const probeDir = mkdtempSync(join(tmpdir(), 'pyreon-swift-probe-'))
      const probe = join(probeDir, 'probe.swift')
      writeFileSync(probe, 'import SwiftUI\nimport Observation\n')
      // `-typecheck`, NOT `-parse`: parse is syntax-only and accepts `import
      // SwiftUI` even when the module is absent (Linux). Typecheck RESOLVES the
      // import, so it fails on Linux and succeeds only with the real SDK (macOS).
      return spawnSync('swiftc', ['-typecheck', probe], { encoding: 'utf8' }).status === 0
    } catch {
      return false
    }
  })()
console.log(
  `[check-native-cosource] ${pkgs.length} co-located package(s); kotlinc=${kotlinc} swiftc=${swiftc} swiftFullSdk=${swiftFullSdk}`,
)

const verifyKotlin = join(
  ROOT,
  'packages',
  'native',
  'runtime-kotlin',
  'scripts',
  'verify-kotlin.ts',
)

// ── Verdict cache ─────────────────────────────────────────────────────────
// A co-source verification is a pure function of (compiler version, the
// harness whose bytes carry the stubs, the exact source + test bytes, the
// mode) — the same contract verify-all.ts and validate-cache.ts document. This
// script used to spawn every compile fresh: 307 s on the Linux lane (Kotlin)
// and 206 s on macOS (Swift) per native PR, both re-deriving verdicts nothing
// had changed. Only OK verdicts are stored (a failure re-runs so its output
// is printed); a missing toolchain never reaches the cache. Honors
// PYREON_VALIDATE_CACHE_DIR / PYREON_VALIDATE_NO_CACHE like its siblings.
const readOr = (f: string): string => {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    return ''
  }
}
const bytesOf = (files: readonly string[]): string =>
  files.map((f) => `${f.slice(ROOT.length)}\0${readOr(f)}`).join('\0')
const toolVersion = (bin: string, flag: string): string => {
  const p = spawnSync(bin, [flag], { encoding: 'utf8' })
  return `${p.stdout ?? ''}${p.stderr ?? ''}`.trim() || 'unknown'
}
const kotlincVersion = kotlinc ? toolVersion('kotlinc', '-version') : ''

/**
 * Can the Kotlin SMOKE actually run here?
 *
 * `verify-kotlin` builds a JAR and runs its `main()` through `java`. With no
 * JDK it degrades to typecheck-only, warns on stdout, and exits 0 — and this
 * script discards a successful child's stdout, so the warning was invisible and
 * the line below reported "(compiled + ran test)" purely because a `*Test.kt`
 * FILE existed. Every Kotlin behaviour assertion in the repo was then
 * typecheck-only on any machine without a JDK, while the log said otherwise.
 * (The @pyreon/flow port shipped a real selectAll/deleteSelected divergence
 * exactly this way.)
 *
 * macOS ships a `/usr/bin/java` stub that satisfies `command -v` and then fails
 * with an install prompt, so the probe has to EXECUTE it, not just find it.
 */
const javaRuns = (() => {
  try {
    return spawnSync('java', ['-version'], { encoding: 'utf8' }).status === 0
  } catch {
    return false
  }
})()

/** A skipped smoke is a broken runner under the same flag the toolchains use. */
const requireNativeValidate = process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1'

const swiftcVersion = swiftc ? toolVersion('swiftc', '--version') : ''
const kotlinHarness = readOr(verifyKotlin)
let cacheHits = 0
/** Run `compute` unless an OK verdict for exactly these inputs is cached; store an OK result. */
function cached(key: string, label: string, compute: () => boolean): boolean {
  if (readVerdict(key)?.ok === true) {
    cacheHits++
    console.log(`  ✓ ${label} (cached verdict)`)
    return true
  }
  const ok = compute()
  if (ok) writeVerdict(key, { ok: true })
  return ok
}

for (const pkg of pkgs) {
  // --- Kotlin ---
  if (pkg.kotlinDir) {
    if (!kotlinc) {
      console.log(`  ${pkg.name} [kotlin]: kotlinc absent — skipped`)
    } else if (pkg.kotlinServices) {
      // PER-SERVICE-GROUP: a package whose Kotlin runtime is SEVERAL independent
      // services, each needing a DIFFERENT stub bundle (two `package
      // android.content` stubs can't concatenate — they redeclare `Context`).
      // Compile each declared group's files together with its own `--service`;
      // `--files` SUPPRESSES the monolith companion append. Every group `.kt`
      // whose `<Basename>Test.kt` exists RUNS its smoke test (each test re-uses
      // the same compiled group); a group with no tests typecheck-only's.
      // A group file may reference a framework-BASE runtime that STAYS in the
      // monolith (a shared persistence/codec primitive like
      // PyreonStorageBackends or PyreonJson) via a `@base/<File>.kt` prefix —
      // the co-located runtime compiles against it but does not own it.
      const baseRuntimeDir = join(
        ROOT,
        'packages',
        'native',
        'runtime-kotlin',
        'src',
        'main',
        'kotlin',
        'com',
        'pyreon',
        'runtime',
      )
      const resolveGroupFile = (f: string): string =>
        f.startsWith('@base/')
          ? join(baseRuntimeDir, f.slice('@base/'.length))
          : join(pkg.kotlinDir!, 'com', 'pyreon', 'runtime', f)
      const ktTests = pkg.testsDir ? filesUnder(pkg.testsDir, '.kt') : []

      // COMPLETENESS, the direction this gate was missing. It already fails on
      // a DECLARED file that does not exist; without the mirror, a file that
      // exists but is declared NOWHERE is silently never verified — and a
      // hand-maintained list beside a real directory drifts by construction.
      // Every `.kt` must be in a group or in kotlinSdkOnly; neither is a pass.
      const runtimeDir = join(pkg.kotlinDir!, 'com', 'pyreon', 'runtime')
      const declared = new Set(
        Object.values(pkg.kotlinServices)
          .flat()
          .filter((f) => !f.startsWith('@base/')),
      )
      for (const f of pkg.kotlinSdkOnly ?? []) declared.add(f)
      const unlisted = filesUnder(runtimeDir, '.kt')
        .map((f) => f.slice(runtimeDir.length + 1))
        .filter((f) => !declared.has(f))
        .sort()
      if (unlisted.length > 0) {
        failures++
        console.error(
          `  ✗ ${pkg.name} [kotlin]: ${unlisted.length} runtime file(s) are in no service group and not declared SDK-only, so nothing verifies them:\n    ${unlisted.join('\n    ')}\n` +
            `    fix: add each to pyreon.native.kotlinServices (stub-verifiable) or pyreon.native.kotlinSdkOnly (imports the real Android SDK; the device gate covers it).`,
        )
      }

      for (const [svc, files] of Object.entries(pkg.kotlinServices)) {
        const abs = files.map(resolveGroupFile)
        const missing = abs.filter((f) => !existsSync(f))
        if (missing.length > 0) {
          failures++
          console.error(
            `  ✗ ${pkg.name} [kotlin ${svc}]: declared file(s) not found:\n    ${missing.join('\n    ')}`,
          )
          continue
        }
        // Tests whose base (minus "Test") matches a group file's base.
        const groupBases = new Set(files.map((f) => f.replace(/^@base\//, '').replace(/\.kt$/, '')))
        const tests = ktTests.filter((t) => {
          const base = t.replace(/^.*\//, '').replace(/Test\.kt$/, '')
          return t.endsWith('Test.kt') && groupBases.has(base)
        })
        const runs =
          tests.length > 0
            ? tests.map((t) => ({ label: t.replace(/^.*\//, ''), extra: [`--test=${t}`] }))
            : [{ label: 'typecheck-only', extra: ['--typecheck-only'] }]
        for (const run of runs) {
          const args = [verifyKotlin, `--files=${abs.join(',')}`, `--service=${svc}`, ...run.extra]
          const typecheckOnly = run.extra.includes('--typecheck-only')
          const testFile = run.extra.find((e) => e.startsWith('--test='))?.slice('--test='.length)
          const key = verdictKey({
            compilerVersion: kotlincVersion,
            harness: kotlinHarness,
            source: bytesOf(abs),
            test: testFile ? bytesOf([testFile]) : '',
            typecheckOnly,
            // A typecheck-only outcome must never be REPLAYED as a behaviour
            // pass: without this the same key covers both, so one JDK-less run
            // caches an "ok" that every later run (JDK or not) reuses.
            smokeRuns: typecheckOnly ? false : javaRuns,
          })
          const ok = cached(key, `${pkg.name} [kotlin ${svc} · ${run.label}]`, () => {
            const r = spawnSync('bun', args, { encoding: 'utf8' })
            if (r.status !== 0) {
              console.error(
                `  ✗ ${pkg.name} [kotlin ${svc} · ${run.label}]:\n${r.stdout}\n${r.stderr}`,
              )
              return false
            }
            const skipped = !typecheckOnly && smokeSkipped(r.stdout ?? '')
            if (skipped && requireNativeValidate) {
              console.error(
                `  ✗ ${pkg.name} [kotlin ${svc} · ${run.label}]: the behaviour test only TYPECHECKED — no JDK on PATH, and PYREON_REQUIRE_NATIVE_VALIDATE=1.\n${r.stdout}`,
              )
              return false
            }
            console.log(
              `  ✓ ${pkg.name} [kotlin ${svc} · ${run.label}] (${files.length} file(s))` +
                (skipped ? ' ⚠ typecheck-only — smoke SKIPPED, no JDK' : ''),
            )
            return true
          })
          if (!ok) failures++
        }
      }
    } else {
      // WHOLE-DIR: a single-concept runtime (or interdependent files sharing ONE
      // stub bundle — PyreonForm + PyreonFieldArray). `--service` (from the
      // primary runtime's basename) selects the stub bundle.
      const ktFiles = filesUnder(pkg.kotlinDir, '.kt')
      const svc = serviceName(ktFiles[0] ?? `${pkg.name}.kt`)
      const test = pkg.testsDir
        ? filesUnder(pkg.testsDir, '.kt').find((f) => f.endsWith('Test.kt'))
        : undefined
      const args = [verifyKotlin, `--source-dir=${pkg.kotlinDir}`, `--service=${svc}`]
      if (test) args.push(`--test=${test}`)
      else args.push('--typecheck-only')
      const key = verdictKey({
        compilerVersion: kotlincVersion,
        harness: kotlinHarness,
        source: bytesOf(ktFiles),
        test: test ? bytesOf([test]) : '',
        typecheckOnly: !test,
        // See the sibling branch: a typecheck-only outcome and a real
        // behaviour pass must not share a cache key.
        smokeRuns: test ? javaRuns : false,
      })
      const ok = cached(key, `${pkg.name} [kotlin]`, () => {
        const r = spawnSync('bun', args, { encoding: 'utf8' })
        if (r.status !== 0) {
          console.error(`  ✗ ${pkg.name} [kotlin]:\n${r.stdout}\n${r.stderr}`)
          return false
        }
        const skipped = Boolean(test) && smokeSkipped(r.stdout ?? '')
        if (skipped && requireNativeValidate) {
          console.error(
            `  ✗ ${pkg.name} [kotlin]: the behaviour test only TYPECHECKED — no JDK on PATH, and PYREON_REQUIRE_NATIVE_VALIDATE=1.\n${r.stdout}`,
          )
          return false
        }
        // Report what HAPPENED, not what the file layout implies. The old line
        // said "compiled + ran test" whenever a `*Test.kt` existed, whether or
        // not a JVM was there to run it.
        console.log(
          `  ✓ ${pkg.name} [kotlin]` +
            kotlinOutcomeLabel({ hasTest: Boolean(test), smokeSkipped: skipped }),
        )
        return true
      })
      if (!ok) failures++
    }
  }

  // --- Swift ---
  if (pkg.swiftDir) {
    if (!swiftFullSdk) {
      console.log(
        `  ${pkg.name} [swift]: SKIPPED — full Swift SDK (SwiftUI/Observation) absent here; the macOS \`validate-swift-typecheck\` job runs this script with the real SDK`,
      )
    } else {
      const srcFiles = filesUnder(pkg.swiftDir, '.swift')
      const testFiles = pkg.testsDir ? filesUnder(pkg.testsDir, '.swift') : []
      // Typecheck the source alone; if a test exists, compile source+test and RUN it.
      const swiftKey = verdictKey({
        kind: 'swift-cosource',
        compilerVersion: swiftcVersion,
        harness: '',
        source: bytesOf(srcFiles),
        test: bytesOf(testFiles),
        typecheckOnly: testFiles.length === 0,
      })
      if (readVerdict(swiftKey)?.ok === true) {
        cacheHits++
        console.log(`  ✓ ${pkg.name} [swift] (cached verdict)`)
      } else if (testFiles.length > 0) {
        const bin = join('/tmp', `pyreon-cosource-${pkg.name.replace(/[^a-z0-9]/gi, '_')}`)
        // `-parse-as-library`: the test file provides `@main` (top-level
        // statements are illegal when compiling multiple files); the source
        // files are plain library types.
        const compile = spawnSync(
          'swiftc',
          ['-parse-as-library', ...srcFiles, ...testFiles, '-o', bin],
          { encoding: 'utf8' },
        )
        if (compile.status !== 0) {
          failures++
          console.error(`  ✗ ${pkg.name} [swift] compile:\n${compile.stderr}`)
        } else {
          const run = spawnSync(bin, [], { encoding: 'utf8' })
          if (run.status !== 0) {
            failures++
            console.error(`  ✗ ${pkg.name} [swift] test run:\n${run.stdout}\n${run.stderr}`)
          } else {
            console.log(`  ✓ ${pkg.name} [swift] (compiled + ran tests)`)
            writeVerdict(swiftKey, { ok: true })
          }
        }
      } else {
        const r = spawnSync('swiftc', ['-typecheck', ...srcFiles], { encoding: 'utf8' })
        if (r.status !== 0) {
          failures++
          console.error(`  ✗ ${pkg.name} [swift] typecheck:\n${r.stderr}`)
        } else {
          console.log(`  ✓ ${pkg.name} [swift] (typecheck)`)
          writeVerdict(swiftKey, { ok: true })
        }
      }
    }
  }
}

if (failures > 0) {
  console.error(`[check-native-cosource] ${failures} failure(s)`)
  process.exit(1)
}
console.log(
  `[check-native-cosource] ✓ all co-located native sources verified (${cacheHits} cached verdict(s))`,
)
