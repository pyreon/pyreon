/**
 * Pure-policy unit tests for the doctor's OBJECTIVE first-party scope
 * (`isFirstPartySourceFile` / `isCompatPackageFile`).
 *
 * These predicates decide what `pyreon doctor` audits as "codebase
 * health". They are pure functions; a false-negative here silently
 * shrinks the audited set (the project's "no subprocess-tested policy
 * — pure policy must be unit-tested, not just smoke-checked" rule), and
 * a false-positive re-introduces the example/fixture noise that made
 * the pre-fix score a meaningless F. Bisect-load-bearing.
 */

import { describe, expect, it } from 'vitest'

import { isCompatPackageFile, isFirstPartySourceFile } from '../doctor/utils/walk'

describe('isFirstPartySourceFile — INCLUDED', () => {
  it.each([
    'packages/core/reactivity/src/signal.ts',
    'packages/core/runtime-dom/src/mount.ts',
    'packages/tools/cli/src/doctor/orchestrator.ts',
    'packages/tools/react-compat/src/index.ts',
    'packages/ui-system/styler/src/styled.tsx',
    '/abs/repo/packages/zero/zero/src/ssg-plugin.ts',
    'packages/internals/perf-harness/src/registry.ts',
  ])('%s → true', (p) => {
    expect(isFirstPartySourceFile(p)).toBe(true)
  })
})

describe('isFirstPartySourceFile — EXCLUDED', () => {
  it.each([
    // not under packages/
    'examples/ssr-showcase/src/main.tsx',
    'e2e/router.spec.ts',
    'docs/docs/index.md.ts',
    'scripts/verify-modes.ts',
    'tests/browser/router.spec.ts',
    'vitest.shared.ts',
    // under packages/ but not src/
    'packages/core/reactivity/lib/signal.js',
    'packages/core/reactivity/package.json.ts',
    // test / fixture / decl files inside a package src
    'packages/core/core/src/tests/signal.test.ts',
    'packages/core/core/src/__tests__/h.test.tsx',
    'packages/tools/cli/src/doctor/__fixtures__/bad.ts',
    'packages/core/core/src/signal.test.ts',
    'packages/core/core/src/h.spec.tsx',
    'packages/core/runtime-dom/src/mount.browser.test.ts',
    'packages/core/core/src/types.d.ts',
  ])('%s → false', (p) => {
    expect(isFirstPartySourceFile(p)).toBe(false)
  })

  it('non-source extensions → false even under packages/*/src', () => {
    expect(isFirstPartySourceFile('packages/core/core/src/readme.md')).toBe(false)
    expect(isFirstPartySourceFile('packages/core/core/src/data.json')).toBe(false)
  })
})

describe('isCompatPackageFile', () => {
  it.each([
    'packages/tools/react-compat/src/index.ts',
    'packages/tools/preact-compat/src/hooks.ts',
    'packages/tools/vue-compat/src/index.ts',
    '/abs/packages/tools/solid-compat/src/jsx-runtime.ts',
  ])('%s → true (compat shim — React/Vue surface IS its purpose)', (p) => {
    expect(isCompatPackageFile(p)).toBe(true)
  })

  it.each([
    'packages/core/reactivity/src/signal.ts',
    'packages/tools/cli/src/index.ts',
    'examples/demo/src/App.tsx',
    'packages/tools/react-compat/lib/index.js',
  ])('%s → false', (p) => {
    expect(isCompatPackageFile(p)).toBe(false)
  })
})

describe('Windows path separators normalize', () => {
  it('backslash paths are treated identically', () => {
    expect(isFirstPartySourceFile('packages\\core\\reactivity\\src\\signal.ts')).toBe(true)
    expect(isCompatPackageFile('packages\\tools\\vue-compat\\src\\index.ts')).toBe(true)
  })
})
