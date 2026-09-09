#!/usr/bin/env bun
/**
 * `.strict()` short-circuit A/B — the OWN-KEY PROOF (`keys.length === N &&
 * every declared key is own`) against the COUNT-ONLY guard it replaced.
 *
 * The two emits are semantically DIFFERENT (the count-only form is the #3183
 * regression: it says "valid" for a typo'd key and "invalid" for a
 * prototype-carried object), so this measures the price of correctness, not
 * two ways of being right. What it must show is that the proof stays a
 * short-circuit — i.e. a VALID all-required object still skips the per-key
 * `Set#has` scan and pays only N `Object.hasOwn` calls.
 *
 * Protocol, mirroring `bench/four-cells.ts`:
 *  - PROCESS ISOLATION: the runner spawns this file per cell; one arm per
 *    process, no in-process slot bias.
 *  - The arm LABEL is derived from the emitted source (`Object.hasOwn` present
 *    or not), never from what the caller thinks it toggled — a file-toggling
 *    A/B that trusts its own label is how a mislabeled measurement ships.
 *  - Load-stamped by the runner; medians over R rounds, interleaved.
 *
 * The `typo` cell is NOT a like-for-like comparison and must not be quoted as
 * a ratio: there the count-only arm is fast precisely because it skips the
 * scan it should be running, so the number compares correctness against its
 * absence. Only the `valid` cells compare two ways of reaching the same
 * answer.
 *
 * NOT YET MEASURED ON A QUIET MACHINE. Written for the PR that introduced the
 * own-key proof; every window available to it sat at load 100-335, where the
 * valid cells' run-to-run spread (0.59x-1.93x on the same cell) exceeds the
 * few-nanosecond effect. Run it quiet before quoting anything from it.
 *
 * Worker:  bun bench/strict-shortcircuit.ts --cell <fields>|<input>
 * Runner:  bun bench/strict-ab.ts [rounds] [--engine node|bun]
 */
import { tryCompileJitCheck } from '../src/core/jit.ts'
import { s } from '../src/v1.ts'

const ITERS = 200_000
const SAMPLES = 9

const buildSchema = (n: number) => {
  const shape: Record<string, ReturnType<typeof s.string>> = {}
  for (let i = 0; i < n; i++) shape[`f${i}`] = (i % 2 === 0 ? s.string() : s.number()) as never
  return s.object(shape as never).strict()
}

const buildValid = (n: number): Record<string, unknown> => {
  const o: Record<string, unknown> = {}
  for (let i = 0; i < n; i++) o[`f${i}`] = i % 2 === 0 ? 'x' : i
  return o
}

const buildTypo = (n: number): Record<string, unknown> => {
  const o = buildValid(n)
  const v = o.f0
  delete o.f0
  o.f0_typo = v
  return o
}

const med = (xs: number[]): number => {
  const a = [...xs].sort((x, y) => x - y)
  return a[a.length >> 1]!
}

const cell = process.argv.indexOf('--cell')
if (cell === -1) {
  console.error('usage: bun bench/strict-shortcircuit.ts --cell <fields>|<valid|typo>')
  process.exit(2)
}
const [nRaw, kind] = process.argv[cell + 1]!.split('|') as [string, string]
const n = Number(nRaw)
const schema = buildSchema(n)
const fn = tryCompileJitCheck(schema as never)
if (!fn) throw new Error('verdict emitter refused the schema — nothing to measure')
// The arm identifies ITSELF from the shipped emit.
const arm = String(fn).includes('Object.hasOwn(') ? 'own-key-proof' : 'count-only'
const input = kind === 'typo' ? buildTypo(n) : buildValid(n)
// Sanity: the two emits must AGREE on the valid input (they diverge only on
// the typo'd / prototype-carried shapes), so a valid-cell number that came
// from a broken build is still a like-for-like comparison.
if (kind === 'valid' && !fn(input)) throw new Error('valid input rejected — the cell is measuring the wrong path')

const samples: number[] = []
for (let s2 = 0; s2 < SAMPLES + 2; s2++) {
  let acc = 0
  const t0 = performance.now()
  for (let i = 0; i < ITERS; i++) if (fn(input)) acc++
  const dt = performance.now() - t0
  if (acc < 0) throw new Error('unreachable')
  if (s2 >= 2) samples.push((dt * 1e6) / ITERS) // ns/op
}
console.log(JSON.stringify({ arm, n, kind, median: med(samples), samples }))
