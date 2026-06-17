/**
 * Coverage-focused tests for template-engine helper exports.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pathExists, substitute } from '../template-engine'

describe('template-engine — substitute', () => {
  it('replaces a known {{key}} with its value', () => {
    expect(substitute('hi {{name}}', { name: 'world' })).toBe('hi world')
  })

  it('keeps an unknown {{key}} verbatim (the value === undefined branch)', () => {
    // user-source template literals like `${count}` and unmapped {{x}} must
    // pass through untouched — this is the `value === undefined ? full` path.
    expect(substitute('keep {{unknown}} as-is', { name: 'world' })).toBe(
      'keep {{unknown}} as-is',
    )
  })

  it('substitutes multiple placeholders in one pass', () => {
    expect(substitute('{{a}}-{{b}}-{{a}}', { a: '1', b: '2' })).toBe('1-2-1')
  })
})

describe('template-engine — pathExists helper', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-zero-paths-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns true for an existing file', async () => {
    const f = path.join(tmp, 'a.txt')
    fs.writeFileSync(f, 'hi')
    expect(await pathExists(f)).toBe(true)
  })

  it('returns true for an existing directory', async () => {
    expect(await pathExists(tmp)).toBe(true)
  })

  it('returns false for a non-existent path', async () => {
    expect(await pathExists(path.join(tmp, 'does-not-exist'))).toBe(false)
  })
})
