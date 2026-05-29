// Phase D2 — JSX-auto-import for canonical primitives.
//
// Tests the regex-based scan + import-injection pass that lets ONE
// `.tsx` source compile on web (needs `import { Stack, ... } from
// '@pyreon/primitives'`) AND native (PMTC compiler resolves bare tags
// via its own table — imports are no-ops). Pass shape: scan JSX tag
// references → diff against already-imported / locally-declared names
// → inject ONLY the missing names, either by extending an existing
// `@pyreon/primitives` import or prepending a new line.
//
// These tests target the helper directly (not the full plugin) for
// fast feedback. Plugin integration is covered by the e2e
// `native-todomvc-web` suite, which exercises a real Vite build.

import { describe, expect, it } from 'vitest'
import pyreonPlugin from '../index'
import type { Plugin } from 'vite'

// Run a Vite plugin's `transform` hook directly. The plugin's `config`
// hook isn't strictly necessary for the auto-import scan, but its
// `transform` hook isn't typed for direct invocation in TS. The cast
// here is the standard pattern across the test suite.
async function runTransform(
  plugin: Plugin,
  code: string,
  id = '/proj/src/test.tsx',
): Promise<string> {
  const xform = plugin.transform as
    | ((
        this: unknown,
        code: string,
        id: string,
        opts?: { ssr?: boolean },
      ) => Promise<{ code: string } | string | null | undefined>)
    | undefined
  if (!xform) throw new Error('plugin has no transform hook')
  const ctx = {
    addWatchFile: () => {},
    resolve: () => null,
    warn: () => {},
    info: () => {},
    error: () => {},
  }
  const result = await xform.call(ctx, code, id)
  if (typeof result === 'string') return result
  if (result && typeof result === 'object' && 'code' in result) return result.code
  return code
}

describe('Phase D2 — JSX auto-import for canonical primitives', () => {
  it('injects new import line when no @pyreon/primitives import exists', async () => {
    const plugin = pyreonPlugin()
    const input = `
      export function App() {
        return <Stack><Text>Hello</Text></Stack>
      }
    `
    const out = await runTransform(plugin, input)
    // Both names land in a sorted, single import line.
    expect(out).toContain(`import { Stack, Text } from '@pyreon/primitives'`)
  })

  it('extends an existing @pyreon/primitives import with missing names', async () => {
    const plugin = pyreonPlugin()
    const input = `
      import { Button } from '@pyreon/primitives'
      export function App() {
        return <Stack><Button>OK</Button><Text>hi</Text></Stack>
      }
    `
    const out = await runTransform(plugin, input)
    // Original Button preserved, new names merged + sorted.
    expect(out).toContain(`import { Button, Stack, Text } from '@pyreon/primitives'`)
    // No duplicate import line.
    expect(out.match(/from '@pyreon\/primitives'/g)?.length).toBe(1)
  })

  it('does NOT shadow local-declared names', async () => {
    const plugin = pyreonPlugin()
    const input = `
      function Button(_props: unknown) { return null }
      export function App() {
        return <Stack><Button>x</Button></Stack>
      }
    `
    const out = await runTransform(plugin, input)
    // Stack auto-imported, Button preserved as local (not re-imported).
    expect(out).toContain(`import { Stack } from '@pyreon/primitives'`)
    expect(out).not.toContain(`import { Button`)
    expect(out).not.toContain(`Button, Stack`)
  })

  it('does NOT auto-import a name that is already imported from another source', async () => {
    const plugin = pyreonPlugin()
    const input = `
      import { Button } from './my-button'
      export function App() {
        return <Stack><Button>x</Button></Stack>
      }
    `
    const out = await runTransform(plugin, input)
    // Stack auto-imported, Button kept from its original source.
    expect(out).toContain(`import { Stack } from '@pyreon/primitives'`)
    // ./my-button import preserved.
    expect(out).toContain(`import { Button } from './my-button'`)
    // The @pyreon/primitives import contains only Stack (NOT Button).
    // Match the specific import line shape to avoid false positives
    // from the JSX body's `<Button>` reference.
    expect(out).not.toMatch(/import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*'@pyreon\/primitives'/)
  })

  it('skips non-canonical-primitive JSX tag names', async () => {
    const plugin = pyreonPlugin()
    const input = `
      export function App() {
        return <Custom><AnotherThing>x</AnotherThing></Custom>
      }
    `
    const out = await runTransform(plugin, input)
    // No @pyreon/primitives import injection — neither tag is in the
    // canonical-primitive name set.
    expect(out).not.toContain('@pyreon/primitives')
  })

  it('handles self-closing tags', async () => {
    const plugin = pyreonPlugin()
    const input = `
      export function App() {
        return <Field value="" onChangeText={() => {}} />
      }
    `
    const out = await runTransform(plugin, input)
    expect(out).toContain(`import { Field } from '@pyreon/primitives'`)
  })

  it('handles tags with attributes', async () => {
    const plugin = pyreonPlugin()
    const input = `
      export function App() {
        return <Stack gap={2} padding={4}><Text>x</Text></Stack>
      }
    `
    const out = await runTransform(plugin, input)
    expect(out).toContain(`import { Stack, Text } from '@pyreon/primitives'`)
  })

  it('preserves untouched code when no canonical primitives are used', async () => {
    const plugin = pyreonPlugin()
    const input = `
      export function App() {
        return <div>plain dom</div>
      }
    `
    const out = await runTransform(plugin, input)
    // No injection — nothing to add.
    expect(out).not.toContain('@pyreon/primitives')
  })

  it('respects opt-out via { jsxAutoImport: false }', async () => {
    const plugin = pyreonPlugin({ jsxAutoImport: false })
    const input = `
      export function App() {
        return <Stack><Text>x</Text></Stack>
      }
    `
    const out = await runTransform(plugin, input)
    expect(out).not.toContain('@pyreon/primitives')
  })

  it('supports custom source via deprecated source+names option', async () => {
    const plugin = pyreonPlugin({
      jsxAutoImport: { source: '@my/primitives', names: ['Box', 'Row'] },
    })
    const input = `
      export function App() {
        return <Box><Row>x</Row></Box>
      }
    `
    const out = await runTransform(plugin, input)
    expect(out).toContain(`import { Box, Row } from '@my/primitives'`)
  })

  it('supports multi-source via mappings option', async () => {
    const plugin = pyreonPlugin({
      jsxAutoImport: {
        mappings: [
          { source: '@my/primitives', names: ['Box', 'Row'] },
          { source: '@my/control', names: ['Each', 'When'] },
        ],
      },
    })
    const input = `
      export function App() {
        return (
          <Box>
            <Each>
              <Row>x</Row>
            </Each>
            <When>visible</When>
          </Box>
        )
      }
    `
    const out = await runTransform(plugin, input)
    expect(out).toContain(`import { Box, Row } from '@my/primitives'`)
    expect(out).toContain(`import { Each, When } from '@my/control'`)
  })

  it('default mappings include For + Show from @pyreon/core', async () => {
    const plugin = pyreonPlugin()
    const input = `
      const items = [1, 2, 3]
      const visible = true
      export function App() {
        return (
          <Stack>
            <For each={items} by={(i) => i}>
              {(i) => <Text>{i}</Text>}
            </For>
            <Show when={visible}>
              <Text>Yes</Text>
            </Show>
          </Stack>
        )
      }
    `
    const out = await runTransform(plugin, input)
    expect(out).toContain(`import { Stack, Text } from '@pyreon/primitives'`)
    expect(out).toContain(`import { For, Show } from '@pyreon/core'`)
  })

  it('skips already-imported canonical names without re-extending', async () => {
    const plugin = pyreonPlugin()
    const input = `
      import { Stack, Text } from '@pyreon/primitives'
      export function App() {
        return <Stack><Text>x</Text></Stack>
      }
    `
    const out = await runTransform(plugin, input)
    // No duplicate import line; original import preserved verbatim
    // (no shape change because nothing new to inject).
    expect(out.match(/import \{ Stack, Text \} from '@pyreon\/primitives'/g)?.length).toBe(1)
  })

  it('handles aliased imports correctly', async () => {
    const plugin = pyreonPlugin()
    const input = `
      import { Stack as Container } from '@pyreon/primitives'
      export function App() {
        return <Container><Text>x</Text></Container>
      }
    `
    const out = await runTransform(plugin, input)
    // Stack is aliased to Container, not used as <Stack> — only
    // <Container> appears in JSX. Text is used and not imported,
    // so it's auto-imported. The existing import is EXTENDED in place
    // (single import line with both alias + new name).
    expect(out).toMatch(
      /import\s*\{[^}]*Stack\s+as\s+Container[^}]*\}\s*from\s*'@pyreon\/primitives'/,
    )
    expect(out).toMatch(/import\s*\{[^}]*\bText\b[^}]*\}\s*from\s*'@pyreon\/primitives'/)
  })
})
