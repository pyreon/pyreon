// Every device test starts from a fresh-install app state, however the test (or
// attempt) before it ended.
//
// #4745: an iOS test recorded a crash report, then failed on a keyboard flake
// before its cleanup tap. The CI retry launched the same app over the same
// files, read `hadCrash == true` before it had recorded anything, and failed for
// good. State a test leaves behind is the shape, not that one report: any test
// that persists something (storage, a crash report, a session) breaks the
// next test or the retry when it fails half way.
//
// The fix is structural, per platform:
// - iOS: the app host clears its sandbox, defaults and Keychain when launched
//   with `-PyreonUITestResetState` (`ios/Sources/UITestAppState.swift`), and
//   the suite launches only through `launchFresh()` (or
//   `relaunchKeepingState()` for a persistence proof), never a bare `launch()`.
// - Android: the Test Orchestrator runs each test in its own process and
//   `pm clear`s the app first (`clearPackageData`). A @Before that deletes files
//   would not do: the instrumentation shares the app's process, so objects an
//   earlier test built are still in memory.
//
// NOT_YET_FRESH is a ratchet: apps that have not adopted it yet. It may only
// shrink; an app in it that has adopted it fails the "still listed" check.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../../../../', import.meta.url))

const NOT_YET_FRESH = new Set([
  'native-counter',
  'native-finance',
  'native-router-demo',
  'native-showcase',
  'native-todomvc',
])

/** The source with comments removed: comments quote the patterns they replaced. */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (
      name === 'node_modules' ||
      name === 'build' ||
      name === 'DerivedData' ||
      name.startsWith('.')
    ) {
      continue
    }
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...filesUnder(p, keep))
    else if (keep(name)) out.push(p)
  }

  return out
}

const apps = readdirSync(join(repo, 'examples')).filter(
  (d) => d.startsWith('native-') && !d.endsWith('-android'),
)

const iosApps = apps
  .map((app) => ({
    app,
    uiTests: filesUnder(join(repo, 'examples', app, 'ios', 'UITests'), (n) => n.endsWith('.swift')),
  }))
  .filter((a) => a.uiTests.length > 0)

const androidApps = apps
  .map((app) => ({
    app,
    gradle: join(repo, 'examples', app, 'android', 'app', 'build.gradle.kts'),
    tests: filesUnder(join(repo, 'examples', app, 'android', 'app', 'src', 'androidTest'), (n) =>
      n.endsWith('.kt'),
    ),
  }))
  .filter((a) => a.tests.length > 0)

describe('device tests start from a fresh app state', () => {
  it('finds the device-tested apps', () => {
    // A moved directory must not turn every rule below into a vacuous pass.
    expect(iosApps.map((a) => a.app)).toContain('native-tasks')
    expect(androidApps.map((a) => a.app)).toContain('native-tasks')
    expect(iosApps.length).toBeGreaterThanOrEqual(6)
    expect(androidApps.length).toBeGreaterThanOrEqual(6)
  })

  it.each(iosApps.filter((a) => !NOT_YET_FRESH.has(a.app)))(
    '$app (iOS) host resets on the launch argument',
    ({ app }) => {
      const appSwift = code(
        readFileSync(join(repo, 'examples', app, 'ios', 'Sources', 'App.swift'), 'utf8'),
      )
      const state = join(repo, 'examples', app, 'ios', 'Sources', 'UITestAppState.swift')
      const resets =
        existsSync(state) &&
        code(readFileSync(state, 'utf8')).includes('"-PyreonUITestResetState"') &&
        /UITestAppState\.resetIfRequested\(\)/.test(appSwift)
      expect(
        resets,
        `examples/${app}/ios: App.init must call UITestAppState.resetIfRequested()`,
      ).toBe(true)
    },
  )

  it.each(iosApps.filter((a) => !NOT_YET_FRESH.has(a.app)))(
    '$app (iOS) suites launch only fresh',
    ({ app, uiTests }) => {
      const helper = uiTests.find((p) =>
        code(readFileSync(p, 'utf8')).includes('func launchFresh()'),
      )
      expect(
        helper,
        `examples/${app}/ios/UITests: declare launchFresh() (see native-tasks FreshLaunch.swift)`,
      ).toBeTruthy()
      expect(code(readFileSync(helper!, 'utf8')).includes('"-PyreonUITestResetState"')).toBe(true)
      const bare = uiTests
        .filter((p) => p !== helper)
        .filter((p) => /\.launch\(\)/.test(code(readFileSync(p, 'utf8'))))
        .map((p) => p.slice(repo.length))
      expect(
        bare,
        'use launchFresh() (or relaunchKeepingState() to prove persistence), not launch()',
      ).toEqual([])
    },
  )

  it.each(androidApps.filter((a) => !NOT_YET_FRESH.has(a.app)))(
    '$app (Android) clears the app before every test',
    ({ app, gradle }) => {
      const src = code(readFileSync(gradle, 'utf8'))
      const fresh =
        /testInstrumentationRunnerArguments\["clearPackageData"\]\s*=\s*"true"/.test(src) &&
        /execution\s*=\s*"ANDROIDX_TEST_ORCHESTRATOR"/.test(src) &&
        /androidTestUtil\("androidx\.test:orchestrator:/.test(src) &&
        /androidTestUtil\("androidx\.test\.services:test-services:/.test(src)
      expect(
        fresh,
        `examples/${app}/android/app/build.gradle.kts: run the orchestrator with clearPackageData`,
      ).toBe(true)
    },
  )

  it.each([...NOT_YET_FRESH])('%s is still listed only because it has not adopted it', (app) => {
    const ios = iosApps.find((a) => a.app === app)
    const android = androidApps.find((a) => a.app === app)
    expect(
      ios ?? android,
      `${app} has no device tests any more: drop it from NOT_YET_FRESH`,
    ).toBeTruthy()
    const iosFresh = existsSync(
      join(repo, 'examples', app, 'ios', 'Sources', 'UITestAppState.swift'),
    )
    const androidFresh = android
      ? /ANDROIDX_TEST_ORCHESTRATOR/.test(code(readFileSync(android.gradle, 'utf8')))
      : false
    expect(
      iosFresh && androidFresh,
      `${app} has adopted fresh app state: remove it from NOT_YET_FRESH`,
    ).toBe(false)
  })
})
