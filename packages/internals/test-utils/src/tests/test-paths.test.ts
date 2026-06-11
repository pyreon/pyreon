import { describe, expect, it } from 'vitest'
import {
  TEST_DIR_RE,
  TEST_FILE_RE,
  isTestPath,
} from '../../../../../scripts/test-paths'

/**
 * Contract for the canonical test-path classifier
 * (`scripts/test-paths.ts`) — the SINGLE source of truth shared by the
 * `check-changeset-required` and `check-diagnose-catalog` gates.
 *
 * Before extraction, each gate carried a byte-for-byte copy of the two
 * regexes; this suite pins the one definition so a future test
 * convention is added in exactly one place.
 */
describe('isTestPath — test/spec/story FILE suffixes', () => {
  it('matches *.test.ts and *.test.tsx', () => {
    expect(isTestPath('packages/core/router/src/router.test.ts')).toBe(true)
    expect(
      isTestPath('packages/ui-system/elements/src/x.browser.test.tsx'),
    ).toBe(true)
  })

  it('matches *.spec.ts(x)', () => {
    expect(isTestPath('packages/core/router/src/router.spec.ts')).toBe(true)
    expect(isTestPath('packages/core/router/src/router.spec.tsx')).toBe(true)
  })

  it('matches *.stories.ts(x)', () => {
    expect(isTestPath('packages/ui/components/src/Button.stories.tsx')).toBe(
      true,
    )
  })
})

describe('isTestPath — test/story DIRECTORIES at any depth', () => {
  it('matches files under tests/ and __tests__/', () => {
    expect(isTestPath('packages/core/router/src/tests/helper.ts')).toBe(true)
    expect(
      isTestPath('packages/ui-system/elements/src/__tests__/fixtures/x.ts'),
    ).toBe(true)
  })

  it('matches files under test/ , __test__/ and stories/', () => {
    expect(isTestPath('packages/core/core/src/test/util.ts')).toBe(true)
    expect(isTestPath('packages/core/core/src/__test__/util.ts')).toBe(true)
    expect(isTestPath('packages/ui/components/src/stories/data.ts')).toBe(true)
  })
})

describe('isTestPath — real source is NOT test code', () => {
  it('rejects ordinary source files even beside tests', () => {
    expect(isTestPath('packages/core/router/src/router.ts')).toBe(false)
    expect(isTestPath('packages/core/router/src/match.ts')).toBe(false)
    expect(isTestPath('packages/ui-system/elements/src/Element/component.tsx')).toBe(
      false,
    )
  })

  it('does NOT match a file merely NAMED like "test" without the suffix/dir shape', () => {
    // `latest.ts`, `contest.tsx`, `test-paths.ts` are source, not tests.
    expect(isTestPath('packages/fundamentals/hooks/src/useLatest.ts')).toBe(
      false,
    )
    expect(isTestPath('scripts/test-paths.ts')).toBe(false)
    expect(isTestPath('packages/core/core/src/contest.tsx')).toBe(false)
  })

  it('does NOT match .d.ts or config files', () => {
    expect(isTestPath('packages/core/core/src/types.d.ts')).toBe(false)
    expect(isTestPath('packages/core/router/vitest.config.ts')).toBe(false)
  })
})

describe('regexes are exported for callers that need the raw pattern', () => {
  it('TEST_FILE_RE / TEST_DIR_RE compose into isTestPath', () => {
    const f = 'pkg/src/x.test.ts'
    const d = 'pkg/src/tests/x.ts'
    expect(TEST_FILE_RE.test(f)).toBe(true)
    expect(TEST_DIR_RE.test(d)).toBe(true)
    expect(isTestPath(f)).toBe(TEST_FILE_RE.test(f) || TEST_DIR_RE.test(f))
    expect(isTestPath(d)).toBe(TEST_FILE_RE.test(d) || TEST_DIR_RE.test(d))
  })
})
