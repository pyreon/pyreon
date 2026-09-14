#!/usr/bin/env bun
/**
 * Deterministically balance native-compiler test files across CI shards.
 *
 * Vitest's built-in sharding balances file COUNT. That is a poor proxy here:
 * some files only inspect emitted text while others spawn swiftc/kotlinc many
 * times. One hash shard consequently reached CI's 25-minute safety cap even
 * after the suite was split sixteen ways. This packer uses static compiler
 * invocation counts as a stable cost estimate, then applies LPT packing.
 *
 * Weights affect placement only. `packNativeTests` verifies conservation so a
 * bad estimate can make a shard slower, but can never skip or duplicate tests.
 */

import { readdirSync, readFileSync } from 'node:fs'

export interface WeightedTestFile {
  path: string
  weight: number
}

const COMPILER_CALL_WEIGHTS: ReadonlyArray<readonly [RegExp, number]> = [
  [/\bvalidateKotlin\s*\(/g, 10],
  [/\bvalidateSwiftWithStubs\s*\(/g, 8],
  [/\bvalidateSwiftTypecheck\s*\(/g, 8],
  [/\bvalidateSwift\s*\(/g, 5],
]

function matches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0
}

/** Estimate real-toolchain cost from source without executing any tests. */
export function nativeTestWeight(source: string): number {
  // Every file pays Vitest + transform overhead. Real compiler subprocesses
  // dominate, especially kotlinc, so give those calls the useful signal.
  return 1 + COMPILER_CALL_WEIGHTS.reduce(
    (total, [pattern, weight]) => total + matches(source, pattern) * weight,
    0,
  )
}

/** Longest-processing-time-first packing with stable tie breaks. */
export function packNativeTests(
  files: readonly WeightedTestFile[],
  shardCount: number,
): WeightedTestFile[][] {
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error('[native-test-shard] shard count must be a positive integer')
  }
  if (files.length === 0) throw new Error('[native-test-shard] no test files found')

  const paths = files.map((file) => file.path)
  if (new Set(paths).size !== paths.length) {
    throw new Error('[native-test-shard] duplicate input test path')
  }

  const bins = Array.from(
    { length: Math.min(shardCount, files.length) },
    () => ({ weight: 0, files: [] as WeightedTestFile[] }),
  )
  const sorted = [...files].sort((a, b) => b.weight - a.weight || a.path.localeCompare(b.path))
  for (const file of sorted) {
    let lightest = bins[0]!
    for (const bin of bins) {
      if (bin.weight < lightest.weight) lightest = bin
    }
    lightest.files.push(file)
    lightest.weight += file.weight
  }

  const packed = bins.flatMap((bin) => bin.files).map((file) => file.path).sort()
  const input = [...paths].sort()
  if (packed.length !== input.length || packed.some((path, index) => path !== input[index])) {
    throw new Error('[native-test-shard] packing lost or duplicated test files')
  }
  return bins.map((bin) => bin.files.sort((a, b) => a.path.localeCompare(b.path)))
}

async function testFiles(): Promise<WeightedTestFile[]> {
  const packageDir = 'packages/native/compiler'
  const testsDir = `${packageDir}/src/tests`
  const paths = readdirSync(testsDir, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.test.ts'))
    .map((path) => `src/tests/${path}`)
    .sort()
  return paths.map((path) => ({
    path,
    weight: nativeTestWeight(readFileSync(`${packageDir}/${path}`, 'utf8')),
  }))
}

if (import.meta.main) {
  const value = (name: string): string | undefined =>
    process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  const index = Number(value('index'))
  const total = Number(value('total'))
  if (!Number.isInteger(index) || index < 1 || !Number.isInteger(total) || total < 1 || index > total) {
    throw new Error('[native-test-shard] expected --index=N --total=N with 1 <= index <= total')
  }
  const shards = packNativeTests(await testFiles(), total)
  const shard = shards[index - 1]
  if (!shard?.length) throw new Error(`[native-test-shard] shard ${index}/${total} is empty`)
  // Paths are relative to the package cwd used by `bun run --filter`.
  process.stdout.write(shard.map((file) => file.path).join(' '))
}
