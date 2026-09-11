/**
 * JSX auto-import: merging into an EXISTING import, and refusing to
 * shadow a name the module already owns.
 *
 * This is the class the anti-pattern catalog names directly — *"a
 * transform that writes imports into user source must reconcile with
 * every name already in that scope"* — recorded there because an injected
 * bare `import { cx }` beside a hand-written one is a hard "Identifier
 * `cx` has already been declared" that broke a docs build.
 *
 * The failure is a BUILD failure rather than a silent one, which sounds
 * better than it is: it fires in the consumer's project, on their file,
 * naming an import line they never wrote. The three ways to produce it
 * are all ordinary code:
 *
 *   * the module already imports the same name from the same source
 *     (merge, don't append a second statement);
 *   * it imports it under an ALIAS (`Stack as Container`) — the local
 *     name is what collides, and the alias must survive the merge;
 *   * it DEFINES the name itself (`export function Stack`), in which case
 *     importing would shadow the module's own export.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import pyreonPlugin, { type PyreonPluginOptions } from '../index'

type ConfigHook = (u: Record<string, unknown>, e: { command: string }) => unknown
type TransformHook = (
  this: { warn: (m: string) => void; resolve: () => Promise<null> },
  code: string,
  id: string,
) => Promise<{ code: string; map: null } | undefined>

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-vp-autoimport-'))
  mkdirSync(join(root, 'src'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const run = async (code: string, opts: PyreonPluginOptions = {}): Promise<string> => {
  const plugin = pyreonPlugin(opts)
  ;(plugin.config as unknown as ConfigHook)({ root }, { command: 'build' })
  const out = await (plugin.transform as unknown as TransformHook).call(
    { warn: () => {}, resolve: async () => null },
    code,
    join(root, 'src/App.tsx'),
  )
  return out?.code ?? code
}

/** Count `import … from '<source>'` statements in the output. */
const importCount = (code: string, source: string): number =>
  code.split('\n').filter((l) => l.includes('import') && l.includes(`'${source}'`)).length

describe('auto-import injects a primitive the module uses but does not import', () => {
  it('adds the import for a bare canonical primitive', async () => {
    // The control. Every "does not double-import" spec below is worthless
    // against a transform that never injects anything.
    const out = await run(`export function App() { return <Stack><span>hi</span></Stack> }\n`)
    expect(out, 'the primitive must be imported').toContain('@pyreon/primitives')
  })

  it('does NOT inject when the module already imports it', async () => {
    // A second import statement for the same binding is the "already been
    // declared" build failure, in the consumer's file.
    const src = `import { Stack } from '@pyreon/primitives'\nexport function App() { return <Stack /> }\n`
    const out = await run(src)
    expect(importCount(out, '@pyreon/primitives'), 'exactly one import line').toBe(1)
  })

  it('MERGES into an existing import rather than adding a second line', async () => {
    const src = `import { Stack } from '@pyreon/primitives'\nexport function App() { return <Stack><Text>hi</Text></Stack> }\n`
    const out = await run(src)

    expect(importCount(out, '@pyreon/primitives')).toBe(1)
    const line = out.split('\n').find((l) => l.includes('@pyreon/primitives'))!
    expect(line, 'the existing name survives').toContain('Stack')
    expect(line, 'and the new one joins it').toContain('Text')
  })

  it('preserves an ALIAS through the merge', async () => {
    // `Stack as Container` binds `Container`. Rewriting the specifier
    // list from the masked source would drop the alias and every
    // `<Container>` in the file would become undefined.
    const src = `import { Stack as Container } from '@pyreon/primitives'\nexport function App() { return <Container><Text>hi</Text></Container> }\n`
    const out = await run(src)

    const line = out.split('\n').find((l) => l.includes('@pyreon/primitives'))!
    expect(line, 'the alias must survive').toContain('Stack as Container')
  })

  it('does not re-inject a name already present under an alias', async () => {
    // Dedupe is by LOCAL name: `Text as Label` means `Label` is taken,
    // and `Text` is not — so injecting `Text` is correct here and
    // injecting `Label` would collide.
    const src = `import { Text as Label } from '@pyreon/primitives'\nexport function App() { return <Label /> }\n`
    const out = await run(src)

    expect(importCount(out, '@pyreon/primitives')).toBe(1)
    const line = out.split('\n').find((l) => l.includes('@pyreon/primitives'))!
    expect(line, 'no duplicate local binding').toContain('Text as Label')
  })
})

describe('a name the module OWNS is never shadowed', () => {
  it('skips a primitive the module exports as a function', async () => {
    // Importing `Stack` beside `export function Stack` shadows the
    // module's own export — the component renders, but it is not the one
    // the author wrote.
    const src = `export function Stack(props) { return <div /> }\nexport function App() { return <Stack /> }\n`
    const out = await run(src)
    expect(out, 'must not import over the local definition').not.toContain('@pyreon/primitives')
  })

  it('skips one the module exports as a const', async () => {
    const src = `export const Stack = () => <div />\nexport function App() { return <Stack /> }\n`
    const out = await run(src)
    expect(out).not.toContain('@pyreon/primitives')
  })
})

describe('text that only LOOKS like usage does not trigger an import', () => {
  it('a primitive named inside a comment is not a usage', async () => {
    // The masking pass exists for this: JSDoc containing a literal
    // `<Stack>` would otherwise inject an import no code needs, which at
    // best is dead weight and at worst collides with a local name the
    // scanner could not see for the same reason.
    const src = `/** Wrap it in a <Stack> for layout. */\nexport function App() { return <div /> }\n`
    const out = await run(src)
    expect(out).not.toContain('@pyreon/primitives')
  })

  it('a primitive named inside a STRING is not a usage', async () => {
    const src = `export const doc = "use <Stack> here"\nexport function App() { return <div /> }\n`
    const out = await run(src)
    expect(out).not.toContain('@pyreon/primitives')
  })
})
