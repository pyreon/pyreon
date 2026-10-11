import { describe, expect, it } from 'vitest'
import { sizedMapPlugin, transform } from './first-party-plugins'
import { createCompiler } from '../index'
import type { ModuleScan } from '../plugin-api'

const imports = `import { SizedMap as Cache } from '@pyreon/sized-map'
import { Text } from '@pyreon/primitives'
type Factory = typeof Cache`
const construction = `new Cache<string, number>({ maxEntries: 10 })`
const shadows = {
  parameter: `export function App(Cache: Factory) { const seen = ${construction}; return <Text>{seen.size}</Text> }`,
  destructured: `export function App({ Cache }: { Cache: Factory }) { const seen = ${construction}; return <Text>{seen.size}</Text> }`,
  local: `export function App(props: { factory: Factory }) { const Cache = props.factory; const seen = ${construction}; return <Text>{seen.size}</Text> }`,
  helper: `function makeCache(Cache: Factory) { return ${construction} }
export function App() { return <Text>cache</Text> }`,
}

describe.each(['swift', 'kotlin'] as const)('SizedMap imported identity on %s', (target) => {
  it.each(Object.entries(shadows))(
    'does not claim a %s shadow as the imported constructor',
    (_name, body) => {
      const result = transform(`${imports}\n${body}`, { target })
      expect(result.code).not.toContain('PyreonSizedMap')
    },
  )

  it('keeps true imported constructors in an unrelated sibling and at module scope', () => {
    const result = transform(
      `${imports}
const shared = ${construction}
${shadows.destructured.replace('function App', 'function Other')}
export function App() { const own = ${construction}; return <Text>{own.size + shared.size}</Text> }`,
      { target },
    )
    expect(result.code.match(/PyreonSizedMap</g)).toHaveLength(2)
    expect(result.code).toContain(
      target === 'swift' ? '@State private var own' : 'val own = remember',
    )
  })
})


it('directs older scanner facades to upgrade instead of invoking a missing query', () => {
  const compiler = createCompiler({
    plugins: [{
      ...sizedMapPlugin,
      scanModule(scan) {
        const { isImportedReference: _query, ...legacy } = scan
        sizedMapPlugin.scanModule!(legacy as ModuleScan)
      },
    }],
  })
  expect(() => compiler.transform(`${imports}
export function App() { const seen = ${construction}; return <Text>{seen.size}</Text> }`, { target: 'swift' })).toThrow(/Upgrade @pyreon\/native-compiler.*isImportedReference/)
})
