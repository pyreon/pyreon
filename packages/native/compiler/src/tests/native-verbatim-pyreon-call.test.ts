// A call to a Pyreon package function that NOTHING lowers is re-emitted verbatim, so the native build fails with
// "cannot find 'getSnapshot' in scope" and the compiler said nothing.
//
// Found by compiling every package's documented `api[].example` through the real compiler: inside a component, with
// its imports, 38 of 121 plain examples ended there (`getSnapshot`, `onPatch`, `formatError`, `isValid`, `createStorage`,
// `compose`, `withDuration`, …). The import-keyed warnings cover hooks, the web-only packages and modules with per-export
// advice; a PARTIAL package's other exports had nothing.
//
// The check reads the FINAL emitted text (not the emitter's call tail, which is also reached while computing output a
// plugin later discards) and needs the SOURCE to call the name too (a preset passed as a value is not a call).
import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { verbatimPyreonCallWarnings } from '../verbatim-call-warning'

const app = (imports: string, body: string) => `${imports}
import { Stack, Text } from '@pyreon/primitives'
export function App() {
${body}
  return <Stack><Text>x</Text></Stack>
}`

describe('a Pyreon function call nothing lowered', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: warns, naming the function and its package`, () => {
      const r = transform(app(`import { getSnapshot } from '@pyreon/state-tree'`, `  const snap = getSnapshot(null as never)`), { target })
      const w = r.warnings.find((x) => x.startsWith('getSnapshot()'))
      expect(w, r.warnings.join('\n')).toBeDefined()
      expect(w).toMatch(/\(from @pyreon\/state-tree\) has NO native lowering/)
      expect(w).toMatch(/cannot find 'getSnapshot' in scope/)
    })
  }
  it('a renamed import warns under its ORIGINAL name', () => {
    const r = transform(app(`import { getSnapshot as snap } from '@pyreon/state-tree'`, `  const s = snap(null as never)`), { target: 'swift' })
    expect(r.warnings.join('\n')).toMatch(/getSnapshot\(\) \(from @pyreon\/state-tree\)/)
  })
  it('stays silent for a name the source only passes as a VALUE (a preset consumed by its package)', () => {
    const src = `import { kinetic } from '@pyreon/kinetic'
import { scaleIn } from '@pyreon/kinetic-presets'
import { Stack, Text } from '@pyreon/primitives'
const Box = kinetic('div').preset(scaleIn)
export function App() { return <Stack><Box><Text>x</Text></Box></Stack> }`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).warnings.filter((w) => w.startsWith('scaleIn()'))).toEqual([])
    }
  })
  it('stays silent for a JSX tag import (the emitters lower it into a native composable of the same spelling)', () => {
    const src = `import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/primitives'
export function App() { return <Container><Row><Col size={6}><Text>x</Text></Col></Row></Container> }`
    expect(transform(src, { target: 'kotlin' }).warnings.filter((w) => w.startsWith('Row()'))).toEqual([])
  })
  it('stays silent when an earlier warning already names it (the plugin\'s own diagnostic is more specific)', () => {
    const imports = new Map([['getSnapshot', { source: '@pyreon/state-tree', imported: 'getSnapshot' }]])
    const code = 'let s = getSnapshot(x)'
    const src = 'const s = getSnapshot(x)'
    expect(verbatimPyreonCallWarnings(imports, src, code, [])).toHaveLength(1)
    expect(verbatimPyreonCallWarnings(imports, src, code, ['getSnapshot declaration dropped'])).toEqual([])
  })
  it('a name inside a string literal or a comment is not a call', () => {
    const imports = new Map([['getSnapshot', { source: '@pyreon/state-tree', imported: 'getSnapshot' }]])
    const src = 'const s = getSnapshot(x)'
    expect(verbatimPyreonCallWarnings(imports, src, 'let page = "<script>getSnapshot(1)</script>" // getSnapshot(2)', [])).toEqual([])
    expect(verbatimPyreonCallWarnings(imports, src, 'let m = obj.getSnapshot(1)', [])).toEqual([])
  })
})
