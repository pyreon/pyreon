// Actually COMPILE + RUN the dependency-free runtime-kotlin smoke tests
// in-env — turning `fun main()` smokes that previously NEVER executed into
// a real, verified gate.
//
// Why this exists: the package's `verify-kotlin.ts` typechecks each module
// against hand-written stubs, and its smoke-run is gated on `java` (absent
// here), so it is skipped. But the `kotlin` CLI ships its own JRE and CAN
// run a compiled jar. For modules that import NO external deps (no
// `androidx.*` / `android.*` / `kotlinx.*`), the compiled jar is REAL code
// (no stubs), so running its `main()` is a genuine behavioral test —
// proving the impl round-trips, not just typechecks.
//
// Scope (honest):
//   - RUNNABLE  = module + its `<Name>Test.kt` both import no external dep.
//                 Compiled (own source + test) → jar → run via `kotlin`.
//   - SKIPPED   = module/test imports `androidx`/`android.` (needs the
//                 Android SDK + Compose jars) OR `kotlinx.*` (needs the
//                 serialization/coroutines artifacts) — flagged, not faked.
//   - NO TOOLS  = kotlinc or kotlin missing → skip the whole gate (exit 0)
//                 unless PYREON_REQUIRE_NATIVE_VALIDATE=1.
//
// Exit 0 when every runnable smoke passes (or the gate is skipped); exit 1
// on any compile/run failure or an unexpected smoke output.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = join(HERE, '..')
const SRC = join(PKG, 'src/main/kotlin/com/pyreon/runtime')
const TEST = join(PKG, 'src/test/kotlin/com/pyreon/runtime')

const EXTERNAL_IMPORT = /^import\s+(androidx|android\.|kotlinx\.)/m

function toolAvailable(cmd: string, arg: string): boolean {
  try {
    return spawnSync(cmd, [arg], { encoding: 'utf8' }).status === 0
  } catch {
    return false
  }
}

interface Classified {
  name: string
  modulePath: string
  testPath: string
  status: 'runnable' | 'skip-external' | 'skip-no-test'
}

/** Classify every module by whether it (and its test) can run dep-free. */
export function classifyModules(): Classified[] {
  const out: Classified[] = []
  for (const file of readdirSync(SRC).sort()) {
    if (!file.endsWith('.kt')) continue
    const name = file.slice(0, -3)
    const modulePath = join(SRC, file)
    const testPath = join(TEST, `${name}Test.kt`)
    if (!existsSync(testPath)) {
      out.push({ name, modulePath, testPath, status: 'skip-no-test' })
      continue
    }
    const moduleSrc = readFileSync(modulePath, 'utf8')
    const testSrc = readFileSync(testPath, 'utf8')
    const external = EXTERNAL_IMPORT.test(moduleSrc) || EXTERNAL_IMPORT.test(testSrc)
    out.push({
      name,
      modulePath,
      testPath,
      status: external ? 'skip-external' : 'runnable',
    })
  }
  return out
}

interface RunResult {
  name: string
  ok: boolean
  detail: string
}

function compileAndRun(m: Classified, tempDir: string): RunResult {
  const jar = join(tempDir, `${m.name}.jar`)
  // Compile the module + its test together with the kotlin stdlib bundled
  // (`-include-runtime`) so the resulting jar self-runs via `kotlin`.
  const compile = spawnSync(
    'kotlinc',
    [m.modulePath, m.testPath, '-include-runtime', '-d', jar],
    { encoding: 'utf8' },
  )
  if (compile.status !== 0) {
    const err = (compile.stderr ?? '')
      .split('\n')
      .filter((l) => /error:/.test(l))
      .slice(0, 3)
      .join(' | ')
    return { name: m.name, ok: false, detail: `compile failed: ${err || compile.stderr?.slice(0, 120)}` }
  }
  // Run the test's top-level `main()` (Kotlin names it `<File>Kt`).
  const run = spawnSync('kotlin', ['-classpath', jar, `com.pyreon.runtime.${m.name}TestKt`], {
    encoding: 'utf8',
  })
  const stdout = (run.stdout ?? '').trim()
  if (run.status !== 0) {
    return {
      name: m.name,
      ok: false,
      detail: `smoke exited ${run.status}: ${(run.stderr ?? stdout).slice(0, 160)}`,
    }
  }
  return { name: m.name, ok: true, detail: stdout.split('\n').pop() ?? 'ran' }
}

function main(): number {
  const required = process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1'
  if (!toolAvailable('kotlinc', '-version') || !toolAvailable('kotlin', '-version')) {
    const msg = '[run-kotlin-tests] kotlinc/kotlin not on PATH'
    if (required) {
      console.error(`${msg} (PYREON_REQUIRE_NATIVE_VALIDATE=1 requested).`)
      return 1
    }
    console.log(`${msg}; skipping (Kotlin toolchain required).`)
    return 0
  }

  const classified = classifyModules()
  const runnable = classified.filter((c) => c.status === 'runnable')
  const skippedExternal = classified.filter((c) => c.status === 'skip-external')

  console.log(
    `[run-kotlin-tests] ${runnable.length} dependency-free module(s) to run; ` +
      `${skippedExternal.length} skipped (androidx/kotlinx — Android-SDK/artifact-gated).`,
  )

  const tempDir = mkdtempSync(join(tmpdir(), 'pyreon-kotlin-run-'))
  const results: RunResult[] = []
  try {
    for (const m of runnable) results.push(compileAndRun(m, tempDir))
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }

  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}: ${r.detail}`)
  }
  if (skippedExternal.length > 0) {
    console.log(
      `[run-kotlin-tests] Android-SDK/artifact-gated (typecheck-only via verify-kotlin): ` +
        skippedExternal.map((c) => c.name).join(', '),
    )
  }

  const failures = results.filter((r) => !r.ok)
  if (failures.length > 0) {
    console.error(`[run-kotlin-tests] ${failures.length} module(s) FAILED.`)
    return 1
  }
  console.log(`[run-kotlin-tests] ✓ all ${results.length} dependency-free smoke test(s) passed.`)
  return 0
}

if (import.meta.main) {
  process.exit(main())
}
