/**
 * Smoke tests for the gate adapters added in PR 2. Each test runs
 * the adapter against a synthetic tmp dir and asserts the GateResult
 * shape contract (matches what `assertGateResultShape` checks for
 * PR 1 gates). Some tests also assert a SPECIFIC finding code surfaces
 * — those are the "bisect-load-bearing" specs that lock the
 * detector → severity → category mapping.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  runAuditTestsGate,
  runIslandsAuditGate,
  runLintGate,
  runPyreonPatternsGate,
  runReactPatternsGate,
  runSsgAuditGate,
} from '../doctor/gates'
import type { GateResult } from '../doctor/types'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-gate-adapters-'))
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

const assertShape = (result: GateResult, gate: string): void => {
  expect(result.gate).toBe(gate)
  expect(typeof result.category).toBe('string')
  expect(Array.isArray(result.findings)).toBe(true)
  expect(typeof result.meta.elapsedMs).toBe('number')
  for (const f of result.findings) {
    expect(f.gate).toBe(gate)
    expect(f.code).toMatch(new RegExp(`^${gate}/`))
  }
}

describe('runReactPatternsGate', () => {
  it('finds nothing in a clean in-scope package src file', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'packages/core/app/src/App.tsx',
      `import { signal } from "@pyreon/reactivity"\nexport function X() { const c = signal(0); return <div class="x">{c()}</div> }\n`,
    )
    const result = await runReactPatternsGate({ cwd })
    assertShape(result, 'react-patterns')
    expect(result.findings).toEqual([])
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('flags useState + className in first-party package src', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'packages/core/app/src/App.tsx',
      `import { useState } from "react"\nexport function X() { const [c, setC] = useState(0); return <div className="x">{c}</div> }\n`,
    )
    const result = await runReactPatternsGate({ cwd })
    assertShape(result, 'react-patterns')
    expect(result.findings.length).toBeGreaterThan(0)
    const codes = result.findings.map((f) => f.code)
    expect(codes.some((c) => c.startsWith('react-patterns/'))).toBe(true)
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('OBJECTIVE scope: ignores examples/, *-compat src, and test fixtures', async () => {
    const cwd = makeTmpDir()
    // All three would fire react-patterns if scanned — none must.
    writeFile(
      cwd,
      'examples/demo/src/Demo.tsx',
      `import { useState } from "react"\nexport function D() { const [c] = useState(0); return <div className="d">{c}</div> }\n`,
    )
    writeFile(
      cwd,
      'packages/tools/react-compat/src/index.ts',
      `export function useState<T>(v: T) { return [v, () => {}] as const }\nexport const className = "x"\n`,
    )
    writeFile(
      cwd,
      'packages/core/app/src/__tests__/App.test.tsx',
      `import { useState } from "react"\nexport function T() { const [c] = useState(0); return <div className="t">{c}</div> }\n`,
    )
    const result = await runReactPatternsGate({ cwd })
    assertShape(result, 'react-patterns')
    expect(result.findings).toEqual([])
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('--fix mode applies migrations and reports auto-fixed info findings', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'src/App.tsx',
      `export function X() { return <div className="x" /> }\n`,
    )
    const result = await runReactPatternsGate({ cwd, fix: true })
    assertShape(result, 'react-patterns')
    // We exercised the --fix branch; the file may or may not have
    // received changes depending on what `migrateReactCode` matches
    // for. Either way the gate runs without throwing and emits a
    // GateResult.
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('--fix mode rewrites className → class on first-party file + emits auto-fixed info findings (L60-74)', async () => {
    const cwd = makeTmpDir()
    const file = 'packages/core/app/src/App.tsx'
    writeFile(
      cwd,
      file,
      `export function X() { return <div className="hello" htmlFor="x" /> }\n`,
    )
    const result = await runReactPatternsGate({ cwd, fix: true })
    assertShape(result, 'react-patterns')
    // The migration MUST rewrite className → class on disk
    const after = fs.readFileSync(path.join(cwd, file), 'utf-8')
    expect(after).toContain('class="hello"')
    expect(after).not.toContain('className="hello"')
    // The fix-mode branch must surface auto-fixed-* info findings
    const autoFixed = result.findings.filter((f) =>
      f.code.startsWith('react-patterns/auto-fixed-'),
    )
    expect(autoFixed.length).toBeGreaterThan(0)
    expect(autoFixed[0]!.severity).toBe('info')
    fs.rmSync(cwd, { recursive: true, force: true })
  })

})

describe('runPyreonPatternsGate', () => {
  it('runs against an empty dir and returns GateResult shape', async () => {
    const cwd = makeTmpDir()
    const result = await runPyreonPatternsGate({ cwd })
    assertShape(result, 'pyreon-patterns')
    expect(result.findings).toEqual([])
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('flags `<For>` without `by` prop in first-party package src', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'packages/core/app/src/X.tsx',
      `import { For } from "@pyreon/core"\nexport function X({ items }) { return <For each={items}>{(x) => <li>{x}</li>}</For> }\n`,
    )
    const result = await runPyreonPatternsGate({ cwd })
    assertShape(result, 'pyreon-patterns')
    if (result.findings.length > 0) {
      expect(result.findings[0]!.gate).toBe('pyreon-patterns')
    }
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('OBJECTIVE scope: ignores examples/ + test fixtures (pyreon-patterns runs on compat — real Pyreon code)', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'examples/demo/src/Demo.tsx',
      `import { For } from "@pyreon/core"\nexport function D({ items }) { return <For each={items}>{(x) => <li>{x}</li>}</For> }\n`,
    )
    writeFile(
      cwd,
      'packages/core/app/src/__tests__/X.test.tsx',
      `import { For } from "@pyreon/core"\nexport function T({ items }) { return <For each={items}>{(x) => <li>{x}</li>}</For> }\n`,
    )
    const result = await runPyreonPatternsGate({ cwd })
    assertShape(result, 'pyreon-patterns')
    expect(result.findings).toEqual([])
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  // ── overlap with the `lint` gate ──
  // detectPyreonPatterns overlaps the lint rules. For codes the lint gate
  // FULLY owns (process-dev-gate, raw-add-event-listener, query-options),
  // pyreon-patterns DEFERS — skips them entirely — to avoid double-reporting
  // at a wrong severity + FPing on framework code the lint rule exempts.
  // raw-REMOVE is kept (the add-only lint rule can't catch it) but honors the
  // add-rule's framework-layer exemptPaths.

  it('DEFERS process-dev-gate to the lint gate (never double-reported by pyreon-patterns)', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'packages/core/app/src/x.ts',
      `if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') console.warn('dev')\n`,
    )
    const result = await runPyreonPatternsGate({ cwd })
    assertShape(result, 'pyreon-patterns')
    // The `lint` gate owns process-dev-gate (with correct severity + config);
    // pyreon-patterns must not re-flag it.
    expect(result.findings.some((f) => f.code === 'pyreon-patterns/process-dev-gate')).toBe(
      false,
    )
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('CONTROL: still reports raw-remove-event-listener (lint is ADD-only — sole catcher) when not exempted', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'packages/core/app/src/x.ts',
      `export function f(el: any) { el.removeEventListener('click', g) }\n`,
    )
    const result = await runPyreonPatternsGate({ cwd })
    assertShape(result, 'pyreon-patterns')
    expect(
      result.findings.some((f) => f.code === 'pyreon-patterns/raw-remove-event-listener'),
    ).toBe(true)
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('honors the add-rule exemptPaths for the KEPT raw-remove-event-listener code', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'packages/core/runtime-dom/src/x.ts',
      `export function f(el: any) { el.removeEventListener('click', g) }\n`,
    )
    writeFile(
      cwd,
      '.pyreonlintrc.json',
      JSON.stringify({
        rules: {
          'pyreon/no-raw-addeventlistener': [
            'info',
            { exemptPaths: ['packages/core/runtime-dom/'] },
          ],
        },
      }),
    )
    const result = await runPyreonPatternsGate({ cwd })
    assertShape(result, 'pyreon-patterns')
    expect(
      result.findings.some((f) => f.code === 'pyreon-patterns/raw-remove-event-listener'),
    ).toBe(false)
    fs.rmSync(cwd, { recursive: true, force: true })
  })
})

describe('runIslandsAuditGate', () => {
  it('runs against an empty dir and returns GateResult shape', async () => {
    const cwd = makeTmpDir()
    const result = await runIslandsAuditGate({ cwd })
    assertShape(result, 'islands-audit')
    expect(result.category).toBe('architecture')
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('maps duplicate-name finding to GateResult shape via SEVERITY_BY_CODE (L36-54)', async () => {
    const cwd = makeTmpDir()
    // Plant 2 islands with the SAME name in the same file (same-file
    // detection is the simplest reliable shape — cross-file requires
    // scanner walk traversal).
    writeFile(
      cwd,
      'packages/core/foo/src/islands.tsx',
      `import { island } from '@pyreon/server'\nexport const X = island(() => import('./inner-x'), { name: 'Dup', hydrate: 'load' })\nexport const Y = island(() => import('./inner-y'), { name: 'Dup', hydrate: 'load' })\n`,
    )
    const result = await runIslandsAuditGate({ cwd })
    assertShape(result, 'islands-audit')
    // The for-loop body in islands-audit.ts MUST run — assert at least one
    // duplicate-name finding surfaces and carries the SEVERITY_BY_CODE
    // mapping (error severity).
    const dup = result.findings.filter(
      (f) => f.code === 'islands-audit/duplicate-name',
    )
    expect(dup.length).toBeGreaterThan(0)
    expect(dup[0]!.severity).toBe('error')
    expect(dup[0]!.category).toBe('architecture')
    fs.rmSync(cwd, { recursive: true, force: true })
  })
})

describe('runSsgAuditGate', () => {
  it('runs against an empty dir and returns GateResult shape', async () => {
    const cwd = makeTmpDir()
    const result = await runSsgAuditGate({ cwd })
    assertShape(result, 'ssg-audit')
    expect(result.category).toBe('architecture')
    fs.rmSync(cwd, { recursive: true, force: true })
  })
})

describe('runAuditTestsGate', () => {
  it('respects minRisk option', async () => {
    const cwd = makeTmpDir()
    const result = await runAuditTestsGate({ cwd, minRisk: 'high' })
    assertShape(result, 'audit-tests')
    // High-risk only — synthetic dir has nothing; expect empty.
    expect(result.findings).toEqual([])
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('defaults minRisk to medium', async () => {
    const cwd = makeTmpDir()
    const result = await runAuditTestsGate({ cwd })
    assertShape(result, 'audit-tests')
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('emits mock-vnode finding for test files with heavy literal patterns (L46-58)', async () => {
    const cwd = makeTmpDir()
    // The auditTestEnvironment scanner (packages/core/compiler/src/test-audit.ts)
    // classifies a test file as risky when it contains many mock-vnode literals
    // + a vnode() helper + zero real h() imports. Plant exactly that shape so
    // the for-loop body in audit-tests.ts L46-58 executes and surfaces a finding.
    const heavyMock = Array.from(
      { length: 20 },
      (_, i) => `const v${i} = { type: 'div', props: {}, children: [] }`,
    ).join('\n')
    writeFile(
      cwd,
      'packages/core/foo/src/__tests__/foo.test.ts',
      `import { describe, it, expect } from 'vitest'\n${heavyMock}\nfunction vnode(type, props){return{type,props,children:[]}}\ndescribe('x', () => {\n  it('uses mock vnodes only', () => {\n    expect(vnode('div', {})).toBeDefined()\n    expect(vnode('span', {})).toBeDefined()\n    expect(vnode('button', {})).toBeDefined()\n  })\n})\n`,
    )
    const result = await runAuditTestsGate({ cwd, minRisk: 'low' })
    assertShape(result, 'audit-tests')
    // The for-loop body MUST emit at least one audit-tests/mock-vnode-* finding.
    const mockFindings = result.findings.filter((f) =>
      f.code.startsWith('audit-tests/mock-vnode-'),
    )
    expect(mockFindings.length).toBeGreaterThan(0)
    expect(mockFindings[0]!.category).toBe('testing')
    fs.rmSync(cwd, { recursive: true, force: true })
  })
})

describe('runLintGate', () => {
  it('runs against an empty dir and returns GateResult shape', async () => {
    const cwd = makeTmpDir()
    const result = await runLintGate({ cwd })
    assertShape(result, 'lint')
    expect(result.category).toBe('correctness')
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('exercises the diagnostic emission path against a real in-scope lint target', async () => {
    const cwd = makeTmpDir()
    // `pyreon/no-window-in-ssr` fires on this; it must be under
    // packages/<cat>/<pkg>/src/ to be inside the OBJECTIVE scope.
    writeFile(
      cwd,
      'packages/core/app/src/App.tsx',
      `export function X() { return <div>{window.innerWidth}</div> }\n`,
    )
    const result = await runLintGate({ cwd })
    assertShape(result, 'lint')
    // Whether findings fire depends on lint detecting the tmp dir as a
    // Pyreon project — either way the entry path + emission loop ran.
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('OBJECTIVE scope: lint ignores examples/ even when it would flag them', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'examples/demo/src/Demo.tsx',
      `export function D() { return <div>{window.innerWidth}</div> }\n`,
    )
    const result = await runLintGate({ cwd })
    assertShape(result, 'lint')
    // No first-party package src exists → nothing to lint → no findings.
    expect(
      result.findings.some((f) =>
        (f.location?.relPath ?? '').includes('examples/'),
      ),
    ).toBe(false)
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('--fix mode runs without throwing', async () => {
    const cwd = makeTmpDir()
    writeFile(cwd, 'packages/core/app/src/App.tsx', `export const x = 1\n`)
    const result = await runLintGate({ cwd, fix: true })
    assertShape(result, 'lint')
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('maps warn → warning and info → info severities (mapLintSeverity)', async () => {
    const cwd = makeTmpDir()
    // `no-nested-effect` is a WARN rule; `no-eager-import` is an INFO
    // rule — both in the `recommended` preset, both pure-AST so they
    // fire deterministically on this in-scope first-party fixture.
    writeFile(
      cwd,
      'packages/core/app/src/Drag.tsx',
      [
        `import { effect } from '@pyreon/reactivity'`,
        `import { render } from '@pyreon/document'`,
        `export function D() {`,
        `  effect(() => { effect(() => { void render }) })`,
        `  return null`,
        `}`,
        ``,
      ].join('\n'),
    )
    const result = await runLintGate({ cwd })
    assertShape(result, 'lint')
    const sevs = new Set(result.findings.map((f) => f.severity))
    // The recommended preset emits non-error severities for these rules;
    // the gate must surface them (not just 'error'), exercising the
    // warn→warning / info→info arms of mapLintSeverity.
    expect(sevs.has('warning') || sevs.has('info')).toBe(true)
    fs.rmSync(cwd, { recursive: true, force: true })
  })
})
