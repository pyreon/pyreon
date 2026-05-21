// Tests for the programmatic build API.
//
// Verify the directory-walk + per-file transform + write pipeline by
// pointing the build at the seven starter fixtures from
// @pyreon/native-compiler and asserting:
//   1. Every fixture produces one output file in the target's extension
//   2. Source-map directives are prepended to each output
//   3. Output content matches what `transform()` directly produces
//   4. Filename mapping `.tsx → .swift/.kt` is correct
//
// Tests use a per-run tempdir created via mkdtempSync so parallel runs
// don't collide and Math.random isn't anywhere near the path
// (CodeQL avoidance — secure temp file conventions per #796).

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { transform } from '@pyreon/native-compiler'
import { build, findTsxFiles } from '../build'

const HERE = dirname(fileURLToPath(import.meta.url))
// Compiler fixtures live in the native-compiler package — reach them via
// the workspace's predictable layout.
const COMPILER_FIXTURES = resolve(HERE, '..', '..', '..', 'compiler', 'src', 'fixtures')

describe('@pyreon/native-cli build', () => {
  let tempOut: string

  beforeEach(() => {
    tempOut = mkdtempSync(join(tmpdir(), 'pyreon-native-cli-test-'))
  })

  afterEach(() => {
    try {
      rmSync(tempOut, { recursive: true, force: true })
    } catch {
      // Cleanup best-effort.
    }
  })

  it('findTsxFiles discovers all 7+ fixtures', () => {
    const files = findTsxFiles(COMPILER_FIXTURES)
    expect(files.length).toBeGreaterThanOrEqual(7)
    expect(files.every((f) => f.endsWith('.tsx'))).toBe(true)
    expect(files.every((f) => !f.endsWith('.test.tsx'))).toBe(true)
  })

  it('build compiles all fixtures to Swift', () => {
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'swift',
    })
    expect(result.filesCompiled).toBeGreaterThanOrEqual(7)
    expect(result.warnings).toEqual([])

    // Every output exists + has the .swift extension + carries the
    // source-map directive.
    for (const output of result.outputs) {
      expect(output.output.endsWith('.swift')).toBe(true)
      const written = readFileSync(output.output, 'utf8')
      expect(written).toBe(output.code)
      expect(written.startsWith('#sourceLocation(file: "')).toBe(true)
    }
  })

  it('build compiles all fixtures to Kotlin', () => {
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'kotlin',
    })
    expect(result.filesCompiled).toBeGreaterThanOrEqual(7)
    expect(result.warnings).toEqual([])

    for (const output of result.outputs) {
      expect(output.output.endsWith('.kt')).toBe(true)
      const written = readFileSync(output.output, 'utf8')
      expect(written).toBe(output.code)
      expect(written.startsWith('// pyreon-source: ')).toBe(true)
    }
  })

  it('build output matches direct transform() result (modulo source-map header)', () => {
    const result = build({
      source: COMPILER_FIXTURES,
      out: tempOut,
      target: 'swift',
    })
    // For one canonical fixture, confirm the build's output body equals
    // what calling transform() directly produces — i.e. the CLI doesn't
    // mutate the compiler's emit.
    const counter = result.outputs.find((o) => o.source.endsWith('02-signal.tsx'))
    expect(counter).toBeDefined()
    const source = readFileSync(counter!.source, 'utf8')
    const direct = transform(source, { target: 'swift' }).code
    // The build prepends a source-map header; strip it before comparing.
    const builtBody = counter!.code.split('\n').slice(1).join('\n')
    expect(builtBody).toBe(direct)
  })
})
