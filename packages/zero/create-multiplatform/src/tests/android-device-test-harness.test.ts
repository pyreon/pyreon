// Every Android instrumented test in `examples/*-android` and `examples/*/android` runs on a harness that
// behaves like the app does, in the three places where the default one does not.
// Each rule below is the cause of a red `Android — gradlew assembleDebug` run on a
// PR that had not touched the code under test (2026-11-11..16); the device tests
// cannot check their own harness, so this file holds them to it.
//
// 1. The Compose rule is the `v2` one. The deprecated
//    `androidx.compose.ui.test.junit4.createAndroidComposeRule` runs the
//    composition on an `UnconfinedTestDispatcher`: the line after an emitted
//    `withContext(Dispatchers.IO) { … }` then resumes ON the IO thread, and the
//    snapshot apply and recomposer frame that follow run there too, racing the
//    main thread (`CalledFromWrongThreadException … Calling:
//    DefaultDispatcher-worker-2`, a corrupted slot table on dispose). The `v2`
//    rule queues the resumption for the main thread, as `AndroidUiDispatcher.Main`
//    does in an app. `ComposeRuleThreadingTest` (native-tasks/android) proves it
//    on the emulator.
// 2. A shell command is awaited. `executeShellCommand(cmd).close()` starts the
//    command and returns: a `pm grant` that had not landed let the tap raise the
//    system permission dialog over the app ("No compose hierarchies found").
// 3. A test that types keeps the soft keyboard out of the layout. The hosts pad
//    for `safeDrawing`, which includes the keyboard, so its arrival resizes the
//    page some hundred milliseconds after the typing returned: a button scrolled
//    into view before that sat outside the scroller's viewport when the click
//    reached it, and the click did nothing.
// 4. A node inside a page's <Scroll> is scrolled to before it is asserted
//    displayed (the tasks app's toolkit / stats / vocab pages). A Compose scroller
//    composes every child however far off-screen, so a bare assertIsDisplayed()
//    passes or fails with the emulator viewport and the previous scroll position
//    (toolkit-card-text sat above toolkit-crdt-map).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../../../../', import.meta.url))

function kotlinUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'build' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...kotlinUnder(p))
    else if (name.endsWith('.kt') && p.includes('/src/androidTest/')) out.push(p)
  }

  return out
}

/** The Kotlin with comments removed: the tests' comments quote the patterns they replaced. */
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// Both example layouts: a host of its own (`examples/native-<app>-android`) and
// one folder per app (`examples/native-<app>/android`).
const deviceTests = readdirSync(join(repo, 'examples'))
  .map((d) =>
    d.endsWith('-android') ? join(repo, 'examples', d) : join(repo, 'examples', d, 'android'),
  )
  .filter((dir) => existsSync(dir) && statSync(dir).isDirectory())
  .flatMap((dir) => kotlinUnder(dir))
  .map((path) => ({ path: path.slice(repo.length), src: code(readFileSync(path, 'utf8')) }))

const composeTests = deviceTests.filter((t) => /create(Android|Empty)?ComposeRule/.test(t.src))

describe('Android device-test harness', () => {
  it('finds the instrumented tests', () => {
    // A moved directory must not turn every rule below into a vacuous pass.
    expect(composeTests.length).toBeGreaterThanOrEqual(6)
    // A one-folder app's tests (native-showcase/android) are held to the same rules.
    expect(deviceTests.some((t) => /^examples\/native-[^/]+\/android\//.test(t.path))).toBe(true)
  })

  // Each rule asserts a boolean: a failed `toMatch` would print the whole test file.
  it.each(composeTests)('$path uses the v2 Compose rule (main-thread resumption)', ({ path, src }) => {
    const oldRule = /import androidx\.compose\.ui\.test\.junit4\.create(Android|Empty)?ComposeRule/.test(src)
    expect(oldRule, `${path}: import the rule from androidx.compose.ui.test.junit4.v2`).toBe(false)
    const newRule = /import androidx\.compose\.ui\.test\.junit4\.v2\.create(Android)?ComposeRule/.test(src)
    expect(newRule, `${path}: no androidx.compose.ui.test.junit4.v2 rule import`).toBe(true)
  })

  it.each(deviceTests)('$path waits for its shell commands', ({ path, src }) => {
    const fireAndForget = /executeShellCommand\([^\n]*\)\s*\.close\(\)/.test(src)
    expect(
      fireAndForget,
      `${path}: executeShellCommand(…).close() does not wait for the command; read its output to the end, or use grantRuntimePermission`,
    ).toBe(false)
  })

  it.each(composeTests.filter((t) => /performText(Input|Replacement)\(/.test(t.src)))(
    '$path keeps the soft keyboard out of the layout while it types',
    ({ path, src }) => {
      const hook = /@Before\s+fun keepSoftKeyboardOut\(\)/.test(src) && src.includes('FLAG_ALT_FOCUSABLE_IM')
      expect(hook, `${path}: add the @Before keepSoftKeyboardOut() hook (see TasksAppInstrumentedTest)`).toBe(true)
    },
  )

  it.each(deviceTests.filter((t) => /\/native-tasks/.test(t.path)))(
    '$path scrolls to a scroll-page node before asserting it displayed',
    ({ path, src }) => {
      // onNodeWithTag("toolkit-x").assertIsDisplayed() with nothing between: no scroll in
      // the chain. The -page containers are the scroller's own root and are excluded.
      const bare = [
        ...src.matchAll(/onNodeWithTag\("((?:toolkit|stats|vocab)-(?!page")[\w-]+)"\)\s*\.assertIsDisplayed\(\)/g),
      ].map((m) => m[1])
      expect(bare, `${path}: use assertTagDisplayedAfterScroll(tag, where) for ${bare.join(', ')}`).toEqual([])
    },
  )
})
