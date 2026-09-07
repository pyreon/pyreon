#!/usr/bin/env bun
// Quiet-window runner for the four parse cells @pyreon/validate loses to zod-c.
// Spawns validation.ts's own per-cell worker (process isolation, its sampler),
// interleaved pyreon/zod-c per cell, ROUNDS rounds; reports median-of-medians + ratio.
import { spawnSync } from 'node:child_process'
const CELLS = ['number.int.range', 'du.3-member', 'object.array-of-objects', 'array.20-objects']
const LIBS = ['pyreon', 'zod-c']
const ROUNDS = Number(process.argv[2] ?? 3)
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]! }
const run = (cell: string, lib: string): number => {
  const r = spawnSync('bun', ['bench/validation.ts', '--cell', `${cell}|valid|parse|${lib}`], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' } })
  if (r.status !== 0) throw new Error(`${cell}/${lib}: ${r.stderr.slice(0, 300)}`)
  return med((JSON.parse(r.stdout.trim()) as { samples: number[] }).samples)
}
const load = () => require('node:os').loadavg().map((x: number) => x.toFixed(2)).join(' ')
console.log(`load=${load()} rounds=${ROUNDS}`)
const acc: Record<string, number[]> = {}
for (let r = 0; r < ROUNDS; r++) for (const c of CELLS) for (const l of LIBS) (acc[`${c}|${l}`] ??= []).push(run(c, l))
for (const c of CELLS) { const p = med(acc[`${c}|pyreon`]!), z = med(acc[`${c}|zod-c`]!); console.log(`${c.padEnd(26)} pyreon ${p.toFixed(2).padStart(7)}  zod-c ${z.toFixed(2).padStart(7)}  → ${(p / z).toFixed(2)}×`) }
console.log(`end load=${load()}`)
