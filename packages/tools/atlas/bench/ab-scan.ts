#!/usr/bin/env bun
/**
 * Interleaved A/B of `atlas scan` across leak-batch sizes.
 *
 * This machine is shared with other sessions (a monorepo build, a second
 * `atlas scan`, an iOS simulator), and a GC-dominated benchmark is exactly the
 * kind that flips verdicts under contention — an earlier sequential sweep here
 * produced a monotonic curve that was pure load drift. Two defences:
 *
 *   1. INTERLEAVE. Run A,B,C,A,B,C… rather than AAA,BBB,CCC, so a drifting
 *      machine drifts through every arm equally instead of favouring whichever
 *      ran during a quiet patch.
 *   2. Report the MINIMUM, not the mean. Contention only ever makes a run
 *      slower, so the fastest observed run is the closest estimate of the true
 *      cost, and the spread says how much to trust it.
 *
 * Alongside the timing it reports the GC CALL COUNT, which is deterministic —
 * it does not move with load at all, so it is the honest signal for a change
 * whose whole purpose is to make fewer GC calls.
 *
 * Run: bun packages/tools/atlas/bench/ab-scan.ts <dir> [--reps N] [--arms 1,8,32]
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const dir = args.find((a) => !a.startsWith('--')) ?? '.'
const repsIdx = args.indexOf('--reps')
const reps = repsIdx >= 0 ? Number(args[repsIdx + 1]) : 3
const armsIdx = args.indexOf('--arms')
const arms = (armsIdx >= 0 ? args[armsIdx + 1]! : '1,4,16,32').split(',')

const root = resolve(import.meta.dirname, '../../../..')
const driver = resolve(import.meta.dirname, 'scan-once.ts')

interface Sample {
  ms: number
  gcCalls: number
  mounts: number
  components: number
  scenarios: number
  failing: string
}

const results = new Map<string, Sample[]>()
for (const a of arms) results.set(a, [])

for (let rep = 0; rep < reps; rep++) {
  for (const arm of arms) {
    const r = spawnSync('bun', [driver, dir], {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, ATLAS_LEAK_BATCH: arm, ATLAS_PROFILE: '1' },
    })
    const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('RESULT '))
    if (!line) {
      process.stderr.write(`arm ${arm} rep ${rep}: no RESULT line\n${(r.stderr ?? '').slice(-800)}\n`)
      continue
    }
    results.get(arm)!.push(JSON.parse(line.slice(7)) as Sample)
    process.stderr.write(`  rep ${rep} arm ${arm}: ${JSON.parse(line.slice(7)).ms}ms\n`)
  }
}

process.stdout.write(`\n=== atlas scan — interleaved A/B (${reps} reps, min of each) ===\n\n`)
process.stdout.write('  batch     min      max    gc calls   mounts   components/scenarios  failing\n')
for (const arm of arms) {
  const s = results.get(arm)!
  if (s.length === 0) { process.stdout.write(`  ${arm.padStart(5)}   (no samples)\n`); continue }
  const times = s.map((x) => x.ms).sort((a, b) => a - b)
  const f = s[0]!
  process.stdout.write(
    `  ${arm.padStart(5)} ${times[0]!.toFixed(0).padStart(7)}ms ${times.at(-1)!.toFixed(0).padStart(7)}ms ` +
      `${String(f.gcCalls).padStart(8)} ${String(f.mounts).padStart(8)}   ${f.components}/${f.scenarios}` +
      `  ${f.failing || '-'}\n`,
  )
}
process.stdout.write('\n')
