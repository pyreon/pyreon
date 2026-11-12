/**
 * Usage errors in the shared theme: `✗ pyreon-native · problem`, then
 * `fix:`, on stderr, with no escape codes when stderr is not a terminal.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { main } from '../cli'

afterEach(() => vi.restoreAllMocks())

const errorsOf = (argv: string[]): { code: number; text: string } => {
  const errs: string[] = []
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errs.push(a.map(String).join(' ')))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const code = main(argv) as number
  return { code, text: errs.join('\n') }
}

describe('pyreon-native usage errors', () => {
  it('a missing flag', () => {
    const { code, text } = errorsOf(['build', '--target=ios', '--out=/tmp/x'])
    expect(code).toBe(1)
    expect(text).toContain('✗ pyreon-native · --source is required\n   fix: run pyreon-native --help for usage')
    expect(text).not.toContain(String.fromCharCode(27))
    // Rule 1: the problem is the last thing printed, after the usage.
    expect(text.trimEnd().endsWith('✗ pyreon-native · --source is required\n   fix: run pyreon-native --help for usage')).toBe(true)
  })

  it('an unknown check target names the choices in fix:', () => {
    const { code, text } = errorsOf(['check', '--target=web', '--source=src'])
    expect(code).not.toBe(0)
    expect(text).toContain('✗ pyreon-native · Unknown check target "web".\n   fix: choose --target=ios, android, swift, kotlin, or all')
  })
})
