import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { classifyCoverageExecution, runCoverage } from '../../../../../scripts/check-coverage'

const repoRoot = resolve(import.meta.dirname, '../../../../..')
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const summary = `Statements : 100% ( 1/1 )
Branches : 100% ( 1/1 )
Functions : 100% ( 1/1 )
Lines : 100% ( 1/1 )`
const execution = (output: string, code = 1) => ({ output, code, signal: null, timedOut: false })

function fixture(expected: number, extraSource = '', after = '') {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-vitest-report-fixture-'))
  roots.push(root)
  symlinkSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), 'junction')
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'package.json'), '{"type":"module","private":true}')
  writeFileSync(
    join(root, 'vitest.config.mjs'),
    `export default { test: {
    globals: true, include: ['src/*.test.js'], maxWorkers: 1,
    coverage: { provider: 'v8', include: ['src/value.js'], thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 } }
  } }`,
  )
  writeFileSync(join(root, 'src/value.js'), `export function value() { return 1 }\n${extraSource}`)
  writeFileSync(
    join(root, 'src/value.test.js'),
    `import { value } from './value.js'
    test('consumes the real value', () => expect(value()).toBe(${expected}))
    ${after}`,
  )
  return root
}

describe('coverage verdict requires successful tests', () => {
  it('rejects a nonzero exit with green numbers and no readable report', () => {
    expect(
      classifyCoverageExecution(
        execution(summary + '\nJSON report written to output.json'),
        '@pyreon/fixture',
        95,
      ),
    ).toMatchObject({ kind: 'unparseable' })
  })

  it('rejects an unexplained nonzero exit even with all-green assertions', () => {
    const report = JSON.stringify({ testResults: [{ assertionResults: [{ status: 'passed' }] }] })
    expect(
      classifyCoverageExecution(execution(summary + '\n' + report, 7), '@pyreon/fixture', 95),
    ).toMatchObject({ kind: 'unparseable' })
  })

  it('rejects an explicit failed report even when the process exits zero', () => {
    const report = JSON.stringify({ testResults: [], success: false })
    expect(
      classifyCoverageExecution(execution(summary + '\n' + report, 0), '@pyreon/fixture', 95),
    ).toMatchObject({ kind: 'tests-failed' })
  })

  it('rejects runtime failures even without a named failed assertion', () => {
    const report = JSON.stringify({ testResults: [], numRuntimeErrorTestSuites: 1 })
    expect(
      classifyCoverageExecution(
        execution(
          summary + '\nERROR: Coverage for lines does not meet global threshold\n' + report,
        ),
        '@pyreon/fixture',
        95,
      ),
    ).toMatchObject({ kind: 'tests-failed', failedTests: [{ name: '(Vitest run)' }] })
  })
})

describe('real Vitest JSON-file reporting', { timeout: 60_000 }, () => {
  it('reports a failed assertion despite a passing 100% coverage summary', async () => {
    const result = await runCoverage(fixture(2), '@pyreon/fixture', 95, 20_000)
    expect(result).toMatchObject({ kind: 'tests-failed' })
    if ('failedTests' in result) {
      expect(result.failedTests[0]?.name).toContain('consumes the real value')
      expect(result.failedTests[0]?.message).toContain('expected 1 to be 2')
    }
  })

  it('accepts the corrected real test and its complete coverage', async () => {
    expect(await runCoverage(fixture(1), '@pyreon/fixture', 95, 20_000)).toMatchObject({
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
      pass: true,
    })
  })

  it('retains measured numbers when only Vitest coverage thresholds fail', async () => {
    const result = await runCoverage(
      fixture(1, 'export function unused() { return 2 }'),
      '@pyreon/fixture',
      0,
      20_000,
    )
    expect(result).toHaveProperty('statements')
    if ('statements' in result) expect(result.statements).toBeLessThan(100)
  })

  it('rejects an unhandled rejection alongside a coverage-threshold failure', async () => {
    const result = await runCoverage(
      fixture(
        1,
        'export function unused() { return 2 }',
        "test('unhandled runtime error', () => { void Promise.reject(new Error('async failure')) })",
      ),
      '@pyreon/fixture',
      0,
      20_000,
    )
    expect(result).toMatchObject({ kind: 'tests-failed' })
  })

  it('rejects an afterAll failure even when every assertion passed', async () => {
    const result = await runCoverage(
      fixture(1, '', "afterAll(() => { throw new Error('teardown failed') })"),
      '@pyreon/fixture',
      95,
      20_000,
    )
    expect(result).toMatchObject({ kind: 'tests-failed' })
  })
})
