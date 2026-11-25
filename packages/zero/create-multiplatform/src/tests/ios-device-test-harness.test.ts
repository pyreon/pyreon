// Every XCUITest in `examples/` waits without paying XCTest's first-poll delay.
// The required `iOS — xcodebuild (Simulator SDK)` job spends 43–48 of its 65–80
// minutes executing UI tests, and this habit was a sixth of that. It never shows
// up as a failure, so the device tests cannot hold themselves to it.
//
// `waitForExistence(timeout:)` evaluates its predicate for the FIRST time one
// second after the call, so an element that is already on screen still costs
// 1.03 s. In job 133764838886 (2026-11-17) 427 of 456 such waits were answered
// by that first poll and took 487 s between them. Each suite declares
// `waitToExist(timeout:)`, which has the same contract (true as soon as the
// element exists, false at the deadline), asks at once and then ten times a
// second.
//
// #4753: `field.tap(); field.typeText(…)` raced the keyboard. The keys went out
// before the tap made the field first responder, a slow simulator dropped some
// of them, and the login form submitted a short username. Every UITests target
// carries the same `KeyboardInput.swift` (`tapAndType` / `typeWhenFocused`: wait
// for keyboard focus, type, and fail on a wrong value, never re-typing over
// it; `waitForKeyboard` for a coordinate tap into a web editor), and no suite
// calls `typeText` as the statement straight
// after tapping.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../../../../', import.meta.url))

/** Layout-independent on purpose: the example directories are being regrouped. */
function uiTestsUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'build' || name === 'DerivedData' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...uiTestsUnder(p))
    else if (name.endsWith('UITests.swift')) out.push(p)
  }

  return out
}

/** The Swift with comments removed: the tests' comments quote the patterns they replaced. */
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const uiTests = uiTestsUnder(join(repo, 'examples')).map((path) => ({
  path: path.slice(repo.length),
  src: code(readFileSync(path, 'utf8')),
}))

/**
 * Any `.tap()` whose next statement is a `.typeText(` call, on the same
 * receiver or another one (`view.coordinate(…).tap()` then `app.typeText`) —
 * typing before focus (#4753). Going through `tapAndType`, or waiting for
 * focus / the keyboard in between, is the way out.
 */
function typesRightAfterTap(src: string): boolean {
  return /\.tap\(\)[ \t]*\n\s*[A-Za-z_][\w.]*\.typeText\(/.test(code(src))
}

const KEYBOARD_INPUT = 'KeyboardInput.swift'
const uiTestDirs = [...new Set(uiTests.map((t) => t.path.slice(0, t.path.lastIndexOf('/'))))]

describe('iOS device-test harness', () => {
  it('finds the XCUITest files', () => {
    // A moved directory must not turn every rule below into a vacuous pass.
    expect(uiTests.length).toBeGreaterThanOrEqual(7)
  })

  // Each rule asserts a boolean: a failed `toMatch` would print the whole test file.
  it.each(uiTests)('$path never pays the one-second first poll', ({ path, src }) => {
    const slowWait = /\.waitForExistence\s*\(/.test(src)
    expect(slowWait, `${path}: use waitToExist(timeout:), which checks at once`).toBe(false)
  })

  it('typesRightAfterTap flags any tap followed directly by typeText', () => {
    expect(typesRightAfterTap('field.tap()\nfield.typeText("ab")')).toBe(true)
    expect(typesRightAfterTap('a.b.tap()\n    // a comment\n    a.b.typeText("x")')).toBe(true)
    // A different receiver: the coordinate tap into a web editor, then app-level typing.
    expect(typesRightAfterTap('view.tap()\napp.typeText("QQ")')).toBe(true)
    expect(
      typesRightAfterTap('codeView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()\n        app.typeText("QQ")'),
    ).toBe(true)
    expect(typesRightAfterTap('field.tapAndType("ab", in: app)')).toBe(false)
    expect(
      typesRightAfterTap('view.tap()\nXCTAssertTrue(app.waitForKeyboard(timeout: 10))\napp.typeText("QQ")'),
    ).toBe(false)
    expect(typesRightAfterTap('field.tap()\nbeat()\nfield.typeText("ab")')).toBe(false)
  })

  it.each(uiTests)('$path waits for keyboard focus before typing', ({ path, src }) => {
    expect(typesRightAfterTap(src), `${path}: use tapAndType(_:in:expecting:) (KeyboardInput.swift)`).toBe(false)
  })

  it.each(uiTestDirs)('%s carries the shared KeyboardInput.swift', (dir) => {
    const file = join(repo, dir, KEYBOARD_INPUT)
    const reference = join(repo, 'examples/native-tasks/ios/UITests', KEYBOARD_INPUT)
    const same = readFileSync(file, 'utf8') === readFileSync(reference, 'utf8')
    expect(same, `${dir}/${KEYBOARD_INPUT} must be a copy of the native-tasks one`).toBe(true)
    // The contract, not just the bytes: focus is awaited before the keys go out.
    const src = code(readFileSync(reference, 'utf8'))
    const waitsThenTypes = /func typeWhenFocused[\s\S]*?waitForKeyboardFocus[\s\S]*?typeText\(text\)/.test(src)
    expect(waitsThenTypes, 'typeWhenFocused must wait for keyboard focus before typeText').toBe(true)
    // Once focus is confirmed a wrong value is a finding: exactly one typeText, no re-type.
    const body = /func typeWhenFocused[\s\S]*?(?=func tapAndType)/.exec(src)?.[0] ?? ''
    expect(body.match(/typeText\(/g)?.length, 'typeWhenFocused types once and never re-types').toBe(1)
  })

  it.each(uiTests)('$path declares the wait it uses', ({ path, src }) => {
    if (!/\.waitToExist\s*\(/.test(src)) return
    // File-private, so a suite that copies a call without the helper fails to compile; this
    // checks the helper kept its contract (an immediate check, then a bounded poll).
    const helper = /func waitToExist\(timeout: TimeInterval\) -> Bool \{\s*if exists \{ return true \}/.test(src)
    expect(helper, `${path}: waitToExist must ask "exists" before it waits`).toBe(true)
  })
})
