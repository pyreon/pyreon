/**
 * Coverage tests for `runDistributionGate`'s findPackages edge cases.
 *
 * Each scenario covers one defensive branch in the package discovery
 * loop (no packages/ root, malformed package.json, non-string name,
 * private package, unreadable category dir). Closes lines 42, 54, 62
 * that the real repo doesn't exercise.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runDistributionGate } from '../doctor/gates/distribution'

describe('distribution gate — findPackages edge cases', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-dist-edges-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns no findings when packages/ dir does not exist (line 42)', async () => {
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(result.findings.length).toBe(0)
  })

  it('skips packages with malformed package.json (line 54)', async () => {
    fs.mkdirSync(path.join(tmp, 'packages/core/foo'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'packages/core/foo/package.json'), '{invalid json')
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(result.findings.length).toBe(0)
  })

  it('skips packages with non-string name field (line 62)', async () => {
    fs.mkdirSync(path.join(tmp, 'packages/core/foo'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, 'packages/core/foo/package.json'),
      JSON.stringify({ name: 123, version: '0.1.0' }),
    )
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(result.findings.length).toBe(0)
  })

  it('skips private packages', async () => {
    fs.mkdirSync(path.join(tmp, 'packages/core/foo'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, 'packages/core/foo/package.json'),
      JSON.stringify({ name: '@pyreon/foo', private: true, version: '0.1.0' }),
    )
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(result.findings.length).toBe(0)
  })
})
