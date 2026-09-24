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

describe('the native test conventions this repo actually ships', () => {
  // The classifier was written for the TypeScript tree, so a Swift or Android
  // test edit read as shipping source and `check-changeset-required` demanded
  // a changeset for it. Both are provably unpublished — `runtime-swift`'s
  // `files` is `Package.swift`/`Sources`/`README`/`LICENSE`, and an Android
  // example is not a published package at all.
  it('SwiftPM Tests/ is test code, capital T and all', () => {
    expect(isTestPath('packages/native/runtime-swift/Tests/PyreonRuntimeTests/PyreonChartEngineTests.swift')).toBe(
      true,
    )
    expect(isTestPath('packages/native/router-swift/Tests/PyreonRouterTests/RouterTests.swift')).toBe(true)
  })

  it('Gradle androidTest/ and its lowercase test/ sibling are both test code', () => {
    expect(
      isTestPath('examples/native-tasks-android/app/src/androidTest/kotlin/com/pyreon/TasksAppInstrumentedTest.kt'),
    ).toBe(true)
    // `src/test/` already matched via the lowercase `test` alternative; pinned
    // so a future tidy-up of the alternation cannot drop it silently.
    expect(isTestPath('packages/native/runtime-kotlin/src/test/kotlin/com/pyreon/runtime/StorageTest.kt')).toBe(true)
  })

  it('the SHIPPED halves of those same packages are NOT test code', () => {
    // The assertion that makes the two above meaningful: widening the
    // alternation must not swallow the sources these packages publish.
    expect(isTestPath('packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift')).toBe(false)
    expect(isTestPath('packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartEngine.kt')).toBe(
      false,
    )
    // …and a directory that merely CONTAINS the word is still not a match.
    expect(isTestPath('packages/native/runtime-swift/Sources/LatestThing/x.swift')).toBe(false)
    expect(isTestPath('packages/core/core/src/androidTestHelpers.ts')).toBe(false)
  })
})
