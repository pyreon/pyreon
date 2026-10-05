/**
 * Everything the config hands the scan must come from the SAME module graph
 * the components are loaded into (#3786).
 *
 * `runScan` loads the config through a first module loader, and — when the
 * config declares an explicit `alias` — closes it and builds a replacement for
 * the components. A loader owns its module graph, so a config kept from the
 * first one imports a DIFFERENT instance of every local module it shares with
 * the components: a context the wrapper `provide()`s and a component
 * `useContext()`s become two objects, the provider never reaches the
 * component, and the scan reports a failing scenario with nothing naming the
 * cause. An unused alias is enough to trigger it.
 *
 * Spawned as a subprocess for the same reason `scan-mount.test.ts` is
 * (mounting boots its own framework copy; the in-process runner holds one),
 * and it runs the BUILT bin — so bisecting means edit source → bootstrap →
 * run. The fixture lives INSIDE the package so `@pyreon/core` resolves by
 * walking up to the workspace `node_modules`, as it does in a real project.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const PKG = resolve(import.meta.dirname, '../../..')
const BIN = join(PKG, 'bin/atlas.js')
let dir = ''

const write = (rel: string, body: string): void => {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = ''
})

const scan = (cwdArg: string): { out: string; status: number | null } => {
  const run = spawnSync('bun', [BIN, 'scan', cwdArg, '--no-write'], {
    cwd: PKG,
    encoding: 'utf8',
    timeout: 300_000,
  })
  return { out: `${run.stdout}\n${run.stderr}`, status: run.status }
}

const fixture = (): void => {
  dir = mkdtempSync(join(PKG, '.loader-identity-'))
  write('package.json', '{"name":"fx","private":true,"version":"0.0.0","type":"module"}')
}

const CONTEXT = `import { createContext } from '@pyreon/core'
export const ExampleContext = createContext(false)
`
const EXAMPLE = `import { useContext } from '@pyreon/core'
import { ExampleContext } from './context'
export function Example() {
  if (!useContext(ExampleContext)) throw new Error('Expected configured provider')
  return <button>Works</button>
}
`
const WRAPPER = `import { h, provide, type VNodeChild } from '@pyreon/core'
import { ExampleContext } from './src/context'
function Provider(props: { children?: VNodeChild }) {
  provide(ExampleContext, true)
  return props.children
}
export const wrapper = (props: { children?: VNodeChild }) => h(Provider, null, props.children)
`

describe('config and components share one module graph', () => {
  it('a configured provider reaches components when an explicit alias is declared', () => {
    fixture()
    write('src/context.ts', CONTEXT)
    write('src/Example.tsx', EXAMPLE)
    write('atlas.config.ts', `${WRAPPER}\nexport const alias = { '@unused': './src' }\n`)
    const { out } = scan(dir)
    expect(out).toMatch(/1 component\(s\), \d+ scenario\(s\) — \d+ verified, 0 failing/)
    expect(out).not.toContain('Expected configured provider')
  }, 320_000)

  it('control: the same project without the alias', () => {
    fixture()
    write('src/context.ts', CONTEXT)
    write('src/Example.tsx', EXAMPLE)
    write('atlas.config.ts', WRAPPER)
    const { out } = scan(dir)
    expect(out).not.toContain('Expected configured provider')
    expect(out).toMatch(/ 0 failing/)
  }, 320_000)

  it('an authored scenario sees the same local module instance the component does', () => {
    fixture()
    write('src/identity.ts', `export const ID = { key: Math.random().toString(36).slice(2) }\n`)
    write(
      'src/Tag.tsx',
      `import { ID } from './identity'\nexport function Tag() { return <button data-key={ID.key}>t</button> }\n`,
    )
    write(
      'atlas.config.ts',
      `import { ID } from './src/identity'
export const alias = { '@unused': './src' }
export const scenarios = {
  Tag: [{ name: 'same-graph', play: ({ root }) => {
    if (root.querySelector('button')?.getAttribute('data-key') !== ID.key) throw new Error('config and component hold different module instances')
  } }],
}
`,
    )
    const { out } = scan(dir)
    expect(out).not.toContain('different module instances')
    expect(out).toMatch(/ 0 failing/)
  }, 320_000)

  it('a monorepo `projects` config keeps the provider across the loader rebuild', () => {
    fixture()
    write('packages/a/src/context.ts', CONTEXT)
    write('packages/a/src/Example.tsx', EXAMPLE)
    write(
      'atlas.config.ts',
      WRAPPER.replace('./src/context', './packages/a/src/context') +
        `\nexport const alias = { '@unused': './packages/a/src' }\nexport const projects = [{ name: 'A', dir: 'packages/a/src' }]\n`,
    )
    const { out } = scan(dir)
    expect(out).not.toContain('Expected configured provider')
    expect(out).toMatch(/ 0 failing/)
  }, 320_000)
})
