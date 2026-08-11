#!/usr/bin/env bun
/**
 * Run `verify-kotlin.ts` over every service — derived, and in parallel.
 *
 * ## What this replaces
 *
 * Three hand-maintained `&&` chains in package.json — `build` (38 invocations),
 * `test` (44) and `typecheck` (37) — each a ~3,000-character JSON string listing
 * services by hand. They were the same list written three times, which is a
 * shape that fails in one specific way: it goes wrong exactly when a service is
 * ADDED, and nothing says so.
 *
 * It had already gone wrong. Comparing the three lists found **8 services
 * missing from at least one**: `PyreonBiometrics`, `PyreonFilePicker`,
 * `PyreonHaptics`, `PyreonImagePicker`, `PyreonLinking`, `PyreonNotifications`
 * and `PyreonShare` were verified by `test` but by neither `build` nor
 * `typecheck`; `PyreonGeolocationAndroid` by `build` alone.
 *
 * `check-service-coverage.ts` did not catch it, and could not: it grepped the
 * WHOLE package.json for `--service=<Name>`, so a service named in any ONE of
 * the three scripts read as covered. It answered "is this service verified
 * somewhere?" while the question that matters is "is it verified by the script I
 * am running?". It now reads the same derived plan this runner executes, so the
 * two cannot disagree.
 *
 * ## Why derived rather than listed
 *
 * See `./services.ts` — it owns the derivation, the EXEMPT ratchet and the
 * per-service mode, and both this runner and the coverage gate read it.
 *
 * ## Concurrency
 *
 * Each invocation spawns its own `kotlinc` and writes stubs to its own
 * `mkdtemp` directory, so they are independent. Measured on this machine:
 * ~2.9s for a full verify and ~2.4s for a typecheck-only, which sequentially is
 * ~102s locally and was **242s** of `Release Build`'s 376s in CI — 64% of the
 * clean build of every published package, on a required check.
 *
 * kotlinc is itself multi-threaded (measured 224-242% CPU), so this does not
 * scale linearly; the pool is deliberately small. Each JVM also costs real
 * memory, and this runs on 16 GB CI runners.
 *
 * Usage:
 *   bun scripts/verify-all.ts                 # full where the service allows
 *   bun scripts/verify-all.ts --mode=typecheck # everything typecheck-only
 *   bun scripts/verify-all.ts --concurrency=2
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planServices } from './services'
import { cacheDisabled, readVerdict, verdictKey, writeVerdict } from './verdict-cache'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = join(HERE, '..')
const SOURCE_DIR = join(PACKAGE_ROOT, 'src/main/kotlin/com/pyreon/runtime')

if (import.meta.main) {
  // No kotlinc, no verification — the same graceful skip the chains had, so a
  // contributor without the Kotlin toolchain can still build the workspace.
  const probe = spawn('sh', ['-c', 'command -v kotlinc'], { stdio: 'ignore' })
  const hasKotlinc = await new Promise<boolean>((r) => probe.on('close', (c) => r(c === 0)))
  if (!hasKotlinc) {
    console.log('[verify-all] kotlinc not on PATH; skipping (Android stack required)')
    process.exit(0)
  }

  const modeArg = process.argv.find((a) => a.startsWith('--mode='))?.split('=')[1]
  const mode = modeArg === 'typecheck' ? 'typecheck' : 'full'
  const concurrencyArg = process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1]
  const concurrency = Math.max(
    1,
    Number(concurrencyArg) || Math.min(4, Math.max(2, availableParallelism() - 2)),
  )

  if (!existsSync(SOURCE_DIR)) {
    console.error(`[verify-all] FAILED — no source directory at ${SOURCE_DIR}`)
    process.exit(1)
  }
  const plan = planServices(readdirSync(SOURCE_DIR), mode)
  // An empty plan is a broken runner, never a vacuous pass — the same rule the
  // sibling coverage gate applies to its own scan.
  if (plan.length === 0) {
    console.error(`[verify-all] FAILED — no services found under ${SOURCE_DIR}`)
    process.exit(1)
  }

  console.log(
    `[verify-all] ${plan.length} service(s), mode=${mode}, concurrency=${concurrency}`,
  )
  const start = Date.now()

  // Key material shared by every service: the compiler, and the harness whose
  // bytes carry the per-service stubs (see ./verdict-cache.ts).
  const compilerVersion = (() => {
    const p = spawnSync('kotlinc', ['-version'], { encoding: 'utf8' })
    return `${p.stdout ?? ''}${p.stderr ?? ''}`.trim() || 'unknown'
  })()
  const harness = readFileSync(join(HERE, 'verify-kotlin.ts'), 'utf8')
  const read = (f: string) => {
    try {
      return readFileSync(f, 'utf8')
    } catch {
      return ''
    }
  }

  const failures: { name: string; output: string }[] = []
  let cached = 0
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < plan.length) {
      const { name, typecheckOnly } = plan[next++]!
      const key = verdictKey({
        compilerVersion,
        harness,
        source: read(join(SOURCE_DIR, `${name}.kt`)),
        test: read(join(PACKAGE_ROOT, `src/test/kotlin/com/pyreon/runtime/${name}Test.kt`)),
        typecheckOnly,
      })
      const hit = readVerdict(key)
      // Only a PASS is served from cache. A cached failure is re-derived so the
      // error text is fresh and a fixed-but-unchanged-key case cannot stick —
      // and re-running a failure costs nothing anyone minds.
      if (hit?.ok === true) {
        cached++
        continue
      }
      const args = [join(HERE, 'verify-kotlin.ts'), `--service=${name}`]
      if (typecheckOnly) args.push('--typecheck-only')
      const child = spawn('bun', args, { cwd: PACKAGE_ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      child.stdout.on('data', (c: Buffer) => (out += c))
      child.stderr.on('data', (c: Buffer) => (out += c))
      const code = await new Promise<number>((r) => child.on('close', (c) => r(c ?? 1)))
      if (code !== 0) failures.push({ name, output: out.trim() })
      else writeVerdict(key, { ok: true })
    }
  }
  // EVERY service runs even after one fails. The `&&` chain stopped at the
  // first failure, so a contributor fixed them one CI round at a time; the
  // whole list is more useful than the first item of it.
  await Promise.all(Array.from({ length: Math.min(concurrency, plan.length) }, worker))

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  if (failures.length > 0) {
    console.error(`\n[verify-all] ✗ ${failures.length}/${plan.length} failed in ${elapsed}s:\n`)
    for (const f of failures.sort((a, b) => a.name.localeCompare(b.name))) {
      console.error(`──── ${f.name} ────`)
      console.error(f.output)
      console.error('')
    }
    process.exit(1)
  }
  const how = cacheDisabled()
    ? ' (cache disabled)'
    : cached > 0
      ? ` (${cached} from cache, ${plan.length - cached} compiled)`
      : ''
  console.log(`[verify-all] ✓ ${plan.length} service(s) verified in ${elapsed}s${how}`)
}
