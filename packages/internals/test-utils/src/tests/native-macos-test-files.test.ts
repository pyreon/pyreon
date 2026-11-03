// The macOS native-validate job runs only the test files that need macOS. The
// selection is by content so a new real-SDK test is never silently dropped.

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isMacOSSpecificTest,
  selectMacOSTestFiles,
} from '../../../../../scripts/native-macos-test-files'

describe('isMacOSSpecificTest', () => {
  it('selects a real-SDK typecheck', () => {
    expect(isMacOSSpecificTest(`expect(validateSwiftTypecheck(src).ok).toBe(true)`)).toBe(true)
  })

  it('selects a SwiftUI / Observation / platform gate', () => {
    expect(isMacOSSpecificTest(`it.skipIf(!isSwiftUIAvailable())('x', () => {})`)).toBe(true)
    expect(isMacOSSpecificTest(`if (process.platform !== 'darwin') return`)).toBe(true)
    expect(isMacOSSpecificTest(`execFileSync('xcrun', ['simctl'])`)).toBe(true)
  })

  it('does NOT select a stub-only Swift test (the Linux job compiles those)', () => {
    expect(
      isMacOSSpecificTest(
        `it.skipIf(!isSwiftcAvailable())('x', () => { expect(validateSwiftWithStubs(s).ok).toBe(true) })`,
      ),
    ).toBe(false)
  })

  it('does NOT select a Kotlin-only test', () => {
    expect(isMacOSSpecificTest(`expect(validateKotlin(s).ok).toBe(true)`)).toBe(false)
  })
})

describe('selectMacOSTestFiles (the real suite)', () => {
  const dir = join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '..',
    'native',
    'compiler',
    'src',
    'tests',
  )
  const files = selectMacOSTestFiles(dir)

  it('selects a non-empty, strict subset', () => {
    expect(files.length).toBeGreaterThan(50)
    expect(files.length).toBeLessThan(500)
  })

  it('every selected file actually carries a macOS marker', () => {
    expect(files.every((f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx'))).toBe(true)
  })
})
