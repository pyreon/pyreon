#!/usr/bin/env bun
/**
 * Runner for the `.strict()` short-circuit A/B (see strict-shortcircuit.ts).
 *
 * Toggles `src/core/jit.ts` between the shipped OWN-KEY PROOF and the
 * COUNT-ONLY guard it replaced, spawning a fresh worker per arm per round so
 * the arms are process-isolated and interleaved. The worker reports which arm
 * it ACTUALLY compiled, read off the emitted source; a mismatch against what
 * the toggle intended aborts the run rather than posting a mislabeled number.
 *
 * Run on a quiet machine:  bun bench/strict-ab.ts [rounds] [--engine node|bun]
 */
import { spawnSync } from 'node:child_process'
import { loadavg } from 'node:os'
import { readFileSync, writeFileSync } from 'node:fs'

const JIT = new URL('../src/core/jit.ts', import.meta.url).pathname
const CELLS = ['2|valid', '4|valid', '8|valid', '8|typo']
const ROUNDS = Number(process.argv[2] ?? 5)
const engine = process.argv.includes('--engine') ? process.argv[process.argv.indexOf('--engine') + 1]! : 'bun'

const original = readFileSync(JIT, 'utf8')
const NEEDLE = `      const allOwn = shapeKeys.map((k) => \`Object.hasOwn(\${srcVar}, \${JSON.stringify(k)})\`).join(' && ')
      return \`\${ksv}.length !== \${shapeKeys.length} || !(\${allOwn})\``
const COUNT_ONLY = `      return \`\${ksv}.length !== \${shapeKeys.length}\``
if (!original.includes(NEEDLE)) throw new Error('jit.ts does not carry the own-key proof — nothing to toggle')

const setArm = (a: 'own-key-proof' | 'count-only'): void => {
  writeFileSync(JIT, a === 'own-key-proof' ? original : original.replace(NEEDLE, COUNT_ONLY))
}

const med = (xs: number[]): number => {
  const a = [...xs].sort((x, y) => x - y)
  return a[a.length >> 1]!
}

const run = (cellSpec: string, expect: string): number => {
  const r = spawnSync(engine, ['bench/strict-shortcircuit.ts', '--cell', cellSpec], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production' },
  })
  if (r.status !== 0) throw new Error(`${cellSpec}/${expect}: ${r.stderr.slice(0, 400)}`)
  const out = JSON.parse(r.stdout.trim()) as { arm: string; median: number }
  if (out.arm !== expect) throw new Error(`ARM MISMATCH: toggled to ${expect}, worker compiled ${out.arm}`)
  return out.median
}

const load = (): string => loadavg().map((x) => x.toFixed(2)).join(' ')

try {
  console.log(`engine=${engine} rounds=${ROUNDS} iters=200k load=${load()}`)
  const acc: Record<string, number[]> = {}
  for (let r = 0; r < ROUNDS; r++) {
    for (const arm of ['own-key-proof', 'count-only'] as const) {
      setArm(arm)
      for (const c of CELLS) (acc[`${c}|${arm}`] ??= []).push(run(c, arm))
    }
  }
  for (const c of CELLS) {
    const p = med(acc[`${c}|own-key-proof`]!)
    const q = med(acc[`${c}|count-only`]!)
    console.log(
      `${c.padEnd(10)} proof ${p.toFixed(2).padStart(7)}ns  count ${q.toFixed(2).padStart(7)}ns  → ${(p / q).toFixed(3)}×`,
    )
  }
  console.log(`end load=${load()}`)
} finally {
  writeFileSync(JIT, original)
}
