import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import type { ModuleLoader } from '../load'
import { discoverRocketstyle } from '../rocketstyle'
import { fileDiscoveryPlugin } from '../discover'

const rs = rocketstyle()
const button = (state: string) =>
  rs({ name: 'Button', component: Element }).states({ [state]: { color: 'red' } })
const loader = (modules: Map<string, Record<string, unknown>>): ModuleLoader => ({
  kind: 'runtime',
  load: async (file) => modules.get(file) ?? {},
  close: async () => {},
})

it('keeps distinct same-named rocketstyle components and their own contracts', async () => {
  const a = button('primary')
  const b = button('danger')
  const modules = new Map([
    ['/project/a.ts', { Button: a }],
    ['/project/b.ts', { Button: b }],
  ])
  const found = await discoverRocketstyle([...modules.keys()], { loader: loader(modules) })
  expect(found).toHaveLength(2)
  expect(found.map((c) => c.source)).toEqual([...modules.keys()])
  expect(found.map((c) => c.axes.find((axis) => axis.name === 'state')?.values)).toEqual([
    ['primary'],
    ['danger'],
  ])
})

it('deduplicates re-exports of the same value while preserving distinct aliases', async () => {
  const a = button('primary')
  const modules = new Map([
    ['/project/a.ts', { Button: a }],
    ['/project/index.ts', { Button: a, OtherButton: a }],
  ])
  const found = await discoverRocketstyle([...modules.keys()], { loader: loader(modules) })
  expect(found.map((c) => [c.name, c.source])).toEqual([
    ['Button', '/project/a.ts'],
    ['OtherButton', '/project/index.ts'],
  ])
})

it('preserves the public name-wide skip contract', async () => {
  const modules = new Map([
    ['/project/a.ts', { Button: button('primary') }],
    ['/project/b.ts', { Button: button('danger') }],
  ])
  expect(
    await discoverRocketstyle(
      [...modules.keys()],
      { loader: loader(modules) },
      new Set(['Button']),
    ),
  ).toEqual([])
})

it('a file-qualified static claim excludes only that component, including earlier barrel re-exports', async () => {
  const a = button('primary')
  const b = button('danger')
  const modules = new Map([
    ['/project/00-index.ts', { Button: a }],
    ['/project/a.ts', { Button: a }],
    ['/project/b.ts', { Button: b }],
  ])
  const found = await discoverRocketstyle(
    [...modules.keys()],
    { loader: loader(modules) },
    new Set(['Button@/project/a.ts']),
  )
  expect(found.map((c) => [c.name, c.source])).toEqual([['Button', '/project/b.ts']])
  expect(found[0]?.component).toBe(b)
})

it('the complete file plugin keeps a chain sharing a static component name in another file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-identity-'))
  try {
    const src = join(root, 'src')
    mkdirSync(src)
    const a = join(src, 'a.ts')
    const b = join(src, 'b.ts')
    writeFileSync(a, 'export function Button(props: { label: string }) { return null }')
    writeFileSync(
      b,
      'export const Button = rs({ name: "Button", component: Element }).states({ danger: {} })',
    )
    const chain = button('danger')
    const modules = new Map([
      [a, {}],
      [b, { Button: chain }],
    ])
    const plugin = fileDiscoveryPlugin({
      cwd: root,
      project: 'ui',
      rocketstyle: { loader: loader(modules) },
    })
    const found = await plugin.discover!({ cwd: root })
    expect(found).toHaveLength(2)
    expect(found.map((c) => c.source)).toEqual([a, b])
    expect(found.every((c) => c.project === 'ui')).toBe(true)
    expect(found[0]?.controls.some((c) => c.name === 'label')).toBe(true)
    expect(found[1]?.component).toBe(chain)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
