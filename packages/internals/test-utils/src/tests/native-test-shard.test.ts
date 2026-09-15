import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  nativeTestWeight,
  packNativeTests,
  type WeightedTestFile,
} from '../../../../../scripts/native-test-shard'

const files: WeightedTestFile[] = [
  { path: 'a.test.ts', weight: 40 },
  { path: 'b.test.ts', weight: 30 },
  { path: 'c.test.ts', weight: 20 },
  { path: 'd.test.ts', weight: 10 },
  { path: 'e.test.ts', weight: 5 },
  { path: 'f.test.ts', weight: 5 },
]

describe('native test shard packing', () => {
  it('conserves every file exactly once', () => {
    const packed = packNativeTests(files, 3).flat().map((file) => file.path).sort()
    expect(packed).toEqual(files.map((file) => file.path).sort())
  })

  it('is deterministic regardless of discovery order', () => {
    expect(packNativeTests(files, 3)).toEqual(packNativeTests([...files].reverse(), 3))
  })

  it('separates the most expensive files', () => {
    const shards = packNativeTests(files, 3)
    const locations = ['a.test.ts', 'b.test.ts', 'c.test.ts'].map((path) =>
      shards.findIndex((shard) => shard.some((file) => file.path === path)),
    )
    expect(new Set(locations).size).toBe(3)
  })

  it('weights real compiler calls above text-only files', () => {
    expect(nativeTestWeight('expect(code).toContain("Text")')).toBe(1)
    expect(nativeTestWeight('validateSwiftWithStubs(swift); validateKotlin(kotlin)')).toBe(19)
  })

  it('refuses invalid inputs rather than silently dropping coverage', () => {
    expect(() => packNativeTests([], 3)).toThrow(/no test files/)
    expect(() => packNativeTests(files, 0)).toThrow(/positive integer/)
    expect(() => packNativeTests([files[0]!, files[0]!], 2)).toThrow(/duplicate/)
  })

  it('CI enters the package before forwarding selected files', () => {
    const fromPackage = process.cwd().endsWith('/packages/internals/test-utils')
    const workflow = readFileSync(
      resolve(process.cwd(), fromPackage ? '../../../.github/workflows/ci.yml' : '.github/workflows/ci.yml'),
      'utf8',
    )
    expect(workflow).toContain('(cd packages/native/compiler && bun run test -- $SHARD_ARGS)')
    expect(workflow).not.toMatch(/SHARD_ARGS="--shard=/)
  })
})
