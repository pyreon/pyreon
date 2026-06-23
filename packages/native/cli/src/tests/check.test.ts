// Tests for the `check` command — fast in-memory native compile-check.
//
// Verifies the no-build feedback loop: transform both targets, surface
// unsupported-subset warnings + transform errors, support single-file +
// dir modes, skip web entries, and (macOS-only) run the `swiftc
// -typecheck` gate with the runtime-module-miss → skip heuristic.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isSwiftUIAvailable } from '@pyreon/native-compiler'
import {
  check,
  resolveCheckInputs,
  collectMtimes,
  mtimesChanged,
  watchCheck,
  type CheckResult,
} from '../check'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-check-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const write = (name: string, code: string): string => {
  const p = join(dir, name)
  writeFileSync(p, code, 'utf8')
  return p
}

const CLEAN = `import { Stack, Text, Button } from '@pyreon/primitives'
function App() {
  const count = signal(0)
  return (<Stack><Text>{String(count())}</Text><Button onPress={() => count.set(count() + 1)}>inc</Button></Stack>)
}`

const RISKY = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const now = new Date()
  return (<Stack><Text>{now.toString()}</Text></Stack>)
}`

describe('check — in-memory native compile-check', () => {
  it('a clean component produces zero errors + zero warnings (both targets)', () => {
    write('App.tsx', CLEAN)
    const res = check({ source: dir })
    expect(res.filesChecked).toBe(1)
    expect(res.errorCount).toBe(0)
    expect(res.warningCount).toBe(0)
  })

  it('an unsupported-subset shape (new Date()) warns for BOTH targets', () => {
    write('App.tsx', RISKY)
    const res = check({ source: dir })
    const warnings = res.findings.filter((f) => f.kind === 'warning')
    expect(warnings.some((f) => f.target === 'swift')).toBe(true)
    expect(warnings.some((f) => f.target === 'kotlin')).toBe(true)
    expect(res.errorCount).toBe(0) // warn-drop, not a hard error
  })

  it('--target narrows to a single platform', () => {
    write('App.tsx', RISKY)
    const res = check({ source: dir, targets: ['swift'] })
    expect(res.findings.every((f) => f.target === 'swift')).toBe(true)
  })

  it('single-file source mode checks just that file', () => {
    const file = write('App.tsx', CLEAN)
    write('Other.tsx', RISKY)
    const res = check({ source: file })
    expect(res.filesChecked).toBe(1)
    expect(res.warningCount).toBe(0) // only the clean file was checked
  })

  it('skips web-only entry files (import @pyreon/runtime-dom)', () => {
    write(
      'entry-web.tsx',
      `import { mount } from '@pyreon/runtime-dom'\nfunction App() { return null }\nmount(App, document.body)`,
    )
    const res = check({ source: dir })
    expect(res.filesChecked).toBe(0)
    expect(res.skippedWebEntries).toHaveLength(1)
  })

  it('resolveCheckInputs: single .tsx → [file]; non-.tsx → throws', () => {
    const file = write('App.tsx', CLEAN)
    expect(resolveCheckInputs(file)).toEqual([file])
    const bad = write('notes.txt', 'hello')
    expect(() => resolveCheckInputs(bad)).toThrow(/not a \.tsx file/)
  })

  it('dir mode walks nested directories', () => {
    mkdirSync(join(dir, 'nested'))
    write('App.tsx', CLEAN)
    writeFileSync(join(dir, 'nested', 'Inner.tsx'), CLEAN, 'utf8')
    const res = check({ source: dir })
    expect(res.filesChecked).toBe(2)
  })

  // --- macOS-only: the real swiftc -typecheck gate ---

  it.skipIf(!isSwiftUIAvailable())(
    '--typecheck: a clean SwiftUI-only component typechecks (no errors)',
    () => {
      write('App.tsx', CLEAN)
      const res = check({ source: dir, targets: ['swift'], typecheck: true })
      expect(res.errorCount).toBe(0)
      expect(res.findings.filter((f) => f.kind === 'typecheck-error')).toHaveLength(0)
    },
  )

  it.skipIf(!isSwiftUIAvailable())(
    '--typecheck: runtime-referencing emit (Link → PyreonLink) is SKIPPED, not errored',
    () => {
      write(
        'Nav.tsx',
        `import { Stack, Link } from '@pyreon/primitives'\nfunction App() { return (<Stack><Link to="/about">About</Link></Stack>) }`,
      )
      const res = check({ source: dir, targets: ['swift'], typecheck: true })
      // PyreonLink isn't on the search path → classified as a skip, NOT a
      // type error (so --typecheck stays honest until the multi-module gate).
      expect(res.errorCount).toBe(0)
      expect(res.findings.some((f) => f.kind === 'typecheck-skipped')).toBe(true)
    },
  )

  it.skipIf(isSwiftUIAvailable())(
    '--typecheck off-macOS: reported as typecheck-skipped (never an error)',
    () => {
      write('App.tsx', CLEAN)
      const res = check({ source: dir, targets: ['swift'], typecheck: true })
      expect(res.errorCount).toBe(0)
      expect(res.findings.some((f) => f.kind === 'typecheck-skipped')).toBe(true)
    },
  )
})

describe('watch helpers', () => {
  it('mtimesChanged: stable → false; add / remove / mtime-move → true', () => {
    expect(mtimesChanged({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(false)
    expect(mtimesChanged({ a: 1 }, { a: 1, b: 2 })).toBe(true) // added
    expect(mtimesChanged({ a: 1, b: 2 }, { a: 1 })).toBe(true) // removed
    expect(mtimesChanged({ a: 1 }, { a: 2 })).toBe(true) // mtime moved
  })

  it('collectMtimes: snapshots existing files, omits missing', () => {
    const f = write('App.tsx', CLEAN)
    const snap = collectMtimes([f, join(dir, 'ghost.tsx')])
    expect(typeof snap[f]).toBe('number')
    expect(snap[join(dir, 'ghost.tsx')]).toBeUndefined()
  })

  it('watchCheck (maxTicks 0): runs the initial check exactly once', async () => {
    write('App.tsx', CLEAN)
    const results: CheckResult[] = []
    await watchCheck(
      { source: dir, targets: ['swift'] },
      { onResult: (r) => results.push(r), maxTicks: 0 },
    )
    expect(results).toHaveLength(1)
    expect(results[0]!.filesChecked).toBe(1)
  })

  it('watchCheck: re-checks when a source mtime moves', async () => {
    const file = write('App.tsx', CLEAN)
    const results: CheckResult[] = []
    const p = watchCheck(
      { source: dir, targets: ['swift'] },
      { onResult: (r) => results.push(r), intervalMs: 50, maxTicks: 1 },
    )
    // Initial snapshot is taken synchronously before the first poll;
    // bump the mtime during the poll interval so the tick detects it.
    await new Promise((r) => setTimeout(r, 10))
    const future = new Date(Date.now() + 10_000)
    utimesSync(file, future, future)
    await p
    expect(results).toHaveLength(2) // initial + post-change re-check
  })
})
