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

  it.each(uiTests)('$path declares the wait it uses', ({ path, src }) => {
    if (!/\.waitToExist\s*\(/.test(src)) return
    // File-private, so a suite that copies a call without the helper fails to compile; this
    // checks the helper kept its contract (an immediate check, then a bounded poll).
    const helper = /func waitToExist\(timeout: TimeInterval\) -> Bool \{\s*if exists \{ return true \}/.test(src)
    expect(helper, `${path}: waitToExist must ask "exists" before it waits`).toBe(true)
  })
})
