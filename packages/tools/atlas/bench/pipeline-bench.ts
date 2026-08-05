#!/usr/bin/env bun
/**
 * The real `atlas scan`, timed per PLUGIN HOOK.
 *
 * Two hypotheses about where the ~75s goes have now been measured and both were
 * wrong — the static scan is 35ms, and `settleGraph` exits immediately because
 * the reactive graph reads 0. So this stops guessing at mechanisms and reads
 * the attribution off the registry seam every hook runs through
 * (`ATLAS_PROFILE=1`).
 *
 * Run: ATLAS_PROFILE=1 bun packages/tools/atlas/bench/pipeline-bench.ts <dir>
 */
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'

process.env.ATLAS_PROFILE = '1'

const root = resolve(process.argv[2] ?? '.')
const { runCli } = await import('../src/cli/run')
const { pluginProfile } = await import('../src/plugins/registry')

const t0 = performance.now()
const code = await runCli(['scan', root])
const total = performance.now() - t0

const rows = pluginProfile()
process.stdout.write(`\n\n=== atlas scan cost by plugin hook (exit ${code}) ===\n\n`)
let accounted = 0
for (const r of rows) {
  accounted += r.ms
  process.stdout.write(
    `  ${r.name.padEnd(34)} ${r.ms.toFixed(0).padStart(7)}ms  ${String(r.calls).padStart(5)} calls  ` +
      `${(r.ms / r.calls).toFixed(2)}ms/call\n`,
  )
}
process.stdout.write(`\n  ${'accounted'.padEnd(34)} ${accounted.toFixed(0).padStart(7)}ms\n`)
process.stdout.write(`  ${'TOTAL'.padEnd(34)} ${total.toFixed(0).padStart(7)}ms\n`)
process.stdout.write(
  `  ${'unaccounted (boot/io/graph)'.padEnd(34)} ${(total - accounted).toFixed(0).padStart(7)}ms\n\n`,
)


const { mountSteps } = await import('../src/plugins/mount')
if (mountSteps.size > 0) {
  process.stdout.write('=== inside atlas:mount.verify ===\n\n')
  const steps = [...mountSteps.entries()].sort((a, b) => b[1].ms - a[1].ms)
  for (const [name, t] of steps) {
    process.stdout.write(
      `  ${name.padEnd(30)} ${t.ms.toFixed(0).padStart(7)}ms  ${String(t.calls).padStart(6)} calls  ${(t.ms / t.calls).toFixed(2)}ms/call\n`,
    )
  }
  process.stdout.write('\n')
}
process.exit(0)
