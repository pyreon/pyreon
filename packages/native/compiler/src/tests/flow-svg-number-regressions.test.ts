import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { planFlowSvg } from '../../../../fundamentals/flow/src/native-plugin/svg'
import { parsePyreon } from '../parse'
import type { ExprIR } from '../types'

function plan(value: string | number) {
  const literal = typeof value === 'number' ? String(value) : JSON.stringify(value)
  const component = parsePyreon(
    `export function Icon() { return <svg width={${literal}} height={24} /> }`,
  ).components[0]!
  return planFlowSvg(component.returnExpr as Extract<ExprIR, { kind: 'jsx-element' }>)
}
// Both entries are BUILT output (`lib/`): a spawned worker reads what a consumer would, so a source edit is
// invisible here until `bun scripts/bootstrap.ts` rebuilds.
const ENTRY = fileURLToPath(new URL('../../lib/index.js', import.meta.url))

describe('native SVG number parsing', () => {
  it.each([
    ['24', 24],
    [' 24px ', 24],
    ['24 PX', 24],
    ['\t-12.5 \npx\r', -12.5],
    ['.25', 0.25],
    ['-.25', -0.25],
    ['1e-3', 0.001],
    ['2.5E+2 PX', 250],
    ['0', 0],
    ['-0', -0],
    ['\u00a00px\u00a0', 0],
  ])('preserves the accepted numeric spelling %s', (value, expected) => {
    const result = plan(value)
    expect(result.width).toEqual({ kind: 'literal', value: expected })
    expect(result.warnings).toEqual([])
  })
  it.each([
    '',
    'px',
    '1.',
    '+1',
    '0x10',
    '1 2',
    '1pt',
    '1pxpx',
    'Infinity',
    'NaN',
    '1e9999',
    '9'.repeat(1000),
  ])('rejects invalid or overflowing numbers %#', (value) => {
    const result = plan(value)
    expect(result.width).toBeUndefined()
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('is not a plain number')
  })
  it('rejects an overflowing numeric literal independently of string attributes', () => {
    const component = parsePyreon(
      'export function Icon() { return <svg width={1e9999} height={24} /> }',
    ).components[0]!
    const result = planFlowSvg(component.returnExpr as Extract<ExprIR, { kind: 'jsx-element' }>)
    expect(result.width).toBeUndefined()
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('is not a plain number')
  })
  it.each(['digits', 'whitespace'] as const)(
    'handles a long invalid %s attribute in a bounded worker',
    (kind) => {
      // Drive the published API and actual Flow renderer; a timeout confines the
      // broken regex to a child process instead of hanging the test runner.
      const script = `
      import {createCompiler} from ${JSON.stringify(new URL('../../lib/index.js', import.meta.url).href)};
      import {flowPlugin} from ${JSON.stringify(new URL('../../../../fundamentals/flow/lib/native-plugin.js', import.meta.url).href)};
      const {transform} = createCompiler({discovered:[flowPlugin]});
      const value = ${JSON.stringify(kind)} === 'digits' ? '0'.repeat(200000)+'!' : '0'+' '.repeat(200000)+'!';
      const source = "import {createFlow,Flow,type NodeComponentProps} from '@pyreon/flow';"+
        'function Icon(props:NodeComponentProps){return <svg width={'+JSON.stringify(value)+'} height={24}><circle r={4}/></svg>}'+
        'export function Diagram(){const flow=createFlow({nodes:[],edges:[]});return <Flow instance={flow} nodeTypes={{icon:Icon}}/>}';
      const result=transform(source,{target:'swift'});
      if(!result.code.includes('PyreonFlowSvg') || !result.warnings.some(w=>w.includes('is not a plain number'))) process.exit(2);
    `
      const worker = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8',
        timeout: 10_000,
      })
      expect(worker.error, `worker failed for ${ENTRY}`).toBeUndefined()
      expect(worker.status, worker.stderr).toBe(0)
    },
  )
})
