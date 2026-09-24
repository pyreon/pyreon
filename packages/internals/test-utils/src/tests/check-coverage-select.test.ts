import { describe, expect, it } from 'vitest'
import { parseNameList, selectPackages } from '../../../../../scripts/check-coverage'

/**
 * `--skip` moves a toolchain-bound package out of `Coverage (Full)`'s shared
 * pool into its own job. The contract that matters is the failure mode: a
 * skip naming nothing must be REPORTED, because the caller meant to measure
 * that package elsewhere and silently keeping it here is exactly the
 * cap-pinning the flag exists to end.
 */
const all = [{ name: '@pyreon/a' }, { name: '@pyreon/native-compiler' }, { name: '@pyreon/z' }]
const names = (xs: { name: string }[]) => xs.map((x) => x.name)

describe('check-coverage selectPackages', () => {
  it('parses a comma list with blanks and whitespace', () => {
    expect([...parseNameList(' a, b,,c ')]).toEqual(['a', 'b', 'c'])
  })

  it('no flags → everything, nothing skipped', () => {
    const s = selectPackages(all, null, null)
    expect(names(s.selected)).toEqual(names(all))
    expect(s.skipped).toEqual([])
    expect(s.unknownSkips).toEqual([])
  })

  it('--skip removes the named package and reports it', () => {
    const s = selectPackages(all, null, '--skip=@pyreon/native-compiler')
    expect(names(s.selected)).toEqual(['@pyreon/a', '@pyreon/z'])
    expect(s.skipped).toEqual(['@pyreon/native-compiler'])
    expect(s.unknownSkips).toEqual([])
  })

  it('--only then --skip: skip applies to the narrowed set', () => {
    const s = selectPackages(
      all,
      '--only=@pyreon/a,@pyreon/native-compiler',
      '--skip=@pyreon/native-compiler',
    )
    expect(names(s.selected)).toEqual(['@pyreon/a'])
    expect(s.skipped).toEqual(['@pyreon/native-compiler'])
  })

  it('a --skip naming no testable workspace is reported, never silently ignored', () => {
    const s = selectPackages(all, null, '--skip=@pyreon/renamed-away')
    expect(names(s.selected)).toEqual(names(all))
    expect(s.unknownSkips).toEqual(['@pyreon/renamed-away'])
  })

  it('--only alone still restricts (the pre-existing contract)', () => {
    const s = selectPackages(all, '--only=@pyreon/z', null)
    expect(names(s.selected)).toEqual(['@pyreon/z'])
  })
})
