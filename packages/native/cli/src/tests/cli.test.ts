// Tests for the CLI's argv parsing + main() entry. We don't exec the
// bin via subprocess (slow, brittle) — we import main() and call it
// directly with a mocked argv. Output goes via console.error /
// console.log; tests capture both.

import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../cli'

const HERE = dirname(fileURLToPath(import.meta.url))
const COMPILER_FIXTURES = resolve(HERE, '..', '..', '..', 'compiler', 'src', 'fixtures')

describe('@pyreon/native-cli main()', () => {
  let tempOut: string

  beforeEach(() => {
    tempOut = mkdtempSync(join(tmpdir(), 'pyreon-native-cli-main-test-'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    try {
      rmSync(tempOut, { recursive: true, force: true })
    } catch {
      // Cleanup best-effort.
    }
    vi.restoreAllMocks()
  })

  it('returns 1 when no command is given', () => {
    expect(main([])).toBe(1)
  })

  it('returns 1 for an unknown command', () => {
    expect(main(['compile', '--target=ios'])).toBe(1)
  })

  it('returns 1 when --target is missing', () => {
    expect(main(['build', '--source=./src', '--out=./out'])).toBe(1)
  })

  it('returns 1 when --source is missing', () => {
    expect(main(['build', '--target=ios', '--out=./out'])).toBe(1)
  })

  it('returns 1 when --out is missing', () => {
    expect(main(['build', '--target=ios', '--source=./src'])).toBe(1)
  })

  it('returns 0 + writes .swift files for target=ios', () => {
    const code = main([
      'build',
      `--target=ios`,
      `--source=${COMPILER_FIXTURES}`,
      `--out=${tempOut}`,
    ])
    expect(code).toBe(0)
    const written = readdirSync(tempOut)
    expect(written.length).toBeGreaterThanOrEqual(7)
    expect(written.every((f) => f.endsWith('.swift'))).toBe(true)
  })

  it('returns 0 + writes .kt files for target=android', () => {
    const code = main([
      'build',
      `--target=android`,
      `--source=${COMPILER_FIXTURES}`,
      `--out=${tempOut}`,
    ])
    expect(code).toBe(0)
    const written = readdirSync(tempOut)
    expect(written.length).toBeGreaterThanOrEqual(7)
    expect(written.every((f) => f.endsWith('.kt'))).toBe(true)
  })

  it('accepts --target=swift as alias for ios', () => {
    expect(
      main(['build', '--target=swift', `--source=${COMPILER_FIXTURES}`, `--out=${tempOut}`]),
    ).toBe(0)
  })

  it('accepts --target=kotlin as alias for android', () => {
    expect(
      main(['build', '--target=kotlin', `--source=${COMPILER_FIXTURES}`, `--out=${tempOut}`]),
    ).toBe(0)
  })

  it('returns 2 when source directory does not exist', () => {
    expect(
      main([
        'build',
        '--target=ios',
        '--source=/nonexistent/path/that/should/not/exist',
        `--out=${tempOut}`,
      ]),
    ).toBe(2)
  })
})
