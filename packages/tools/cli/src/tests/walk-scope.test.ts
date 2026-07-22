/**
 * Pure-policy unit tests for the doctor's per-file audit scope
 * (`isAuditableSourceFile` / `isCompatPackageFile`) — the objectivity
 * filters that survive the workspace-roots rework.
 *
 * These predicates decide what `pyreon doctor` audits as "codebase
 * health". They are pure functions; a false-negative here silently
 * shrinks the audited set (the project's "no subprocess-tested policy
 * — pure policy must be unit-tested, not just smoke-checked" rule), and
 * a false-positive re-introduces the example/fixture noise that made
 * the pre-fix score a meaningless F. Root SCOPING (which package dirs
 * get walked) is the resolver's job — covered in
 * `workspace-roots.test.ts` + `doctor-foreign-workspace.test.ts`; the
 * predicates here run on paths RELATIVE to the scan root.
 */

import { describe, expect, it } from 'vitest'

import {
  isAuditableSourceFile,
  isCompatPackageFile,
} from '../doctor/utils/walk'

describe('isAuditableSourceFile — INCLUDED (paths relative to the scan root)', () => {
  it.each([
    'signal.ts',
    'mount.ts',
    'doctor/orchestrator.ts',
    'components/App.tsx',
    'deep/nested/module.jsx',
    'index.js',
  ])('%s → true', (p) => {
    expect(isAuditableSourceFile(p)).toBe(true)
  })
})

describe('isAuditableSourceFile — EXCLUDED', () => {
  it.each([
    // test / fixture / decl files
    'tests/signal.test.ts',
    '__tests__/h.test.tsx',
    '__fixtures__/bad.ts',
    'signal.test.ts',
    'h.spec.tsx',
    'mount.browser.test.ts',
    'types.d.ts',
    'fixtures/sample.ts',
  ])('%s → false', (p) => {
    expect(isAuditableSourceFile(p)).toBe(false)
  })

  it('non-source extensions → false', () => {
    expect(isAuditableSourceFile('readme.md')).toBe(false)
    expect(isAuditableSourceFile('data.json')).toBe(false)
  })

  it('runs on RELATIVE paths so an out-of-repo parent dir named `test/` cannot false-exclude', () => {
    // The caller (collectAuditableSourceFiles) passes scan-root-relative
    // paths for exactly this reason: an absolute path like
    // /home/x/test/repo/src/a.ts would match the tests/ exclusion.
    expect(isAuditableSourceFile('repo-src/a.ts')).toBe(true)
    expect(isAuditableSourceFile('test/a.ts')).toBe(false)
  })
})

describe('isCompatPackageFile (paths relative to the repo root)', () => {
  it.each([
    'packages/tools/react-compat/src/index.ts',
    'packages/tools/preact-compat/src/hooks.ts',
    'packages/tools/vue-compat/src/index.ts',
    'packages/tools/solid-compat/src/jsx-runtime.ts',
    // Layout-agnostic: a foreign workspace's compat package matches too.
    'modules/my-compat/src/index.ts',
  ])('%s → true (compat shim — React/Vue surface IS its purpose)', (p) => {
    expect(isCompatPackageFile(p)).toBe(true)
  })

  it.each([
    'packages/core/reactivity/src/signal.ts',
    'packages/tools/cli/src/index.ts',
    'examples/demo/src/App.tsx',
    // `-compat` must be a full dir segment, not a substring.
    'packages/tools/react-compatible/src/index.ts',
  ])('%s → false', (p) => {
    expect(isCompatPackageFile(p)).toBe(false)
  })
})

describe('Windows path separators normalize', () => {
  it('backslash paths are treated identically', () => {
    expect(isAuditableSourceFile('deep\\nested\\signal.ts')).toBe(true)
    expect(isAuditableSourceFile('tests\\signal.test.ts')).toBe(false)
    expect(
      isCompatPackageFile('packages\\tools\\vue-compat\\src\\index.ts'),
    ).toBe(true)
  })
})
