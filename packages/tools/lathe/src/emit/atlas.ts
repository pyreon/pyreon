/**
 * Atlas scenario emission.
 *
 * Atlas derives controls and variant axes from a component's PROPS; the axis it
 * cannot infer is which values are worth browsing. For a generated preview
 * that answer is fixed and knowable: the states a live request will not show
 * you on demand.
 *
 * Keyed by the PREVIEW component names, which `emitComponents` emits and Atlas
 * actually discovers. An earlier version keyed scenarios by a native data
 * component and varied RESPONSE fields -- names Atlas had no reason to scan,
 * and args that were not props. Both halves have to line up or the file is a
 * plausible-looking no-op.
 */

import type { IrDocument } from '../core/ir'
import { FORCED_STATES, previewName, previewOperations } from './components'
import { jsonLiteral, q, relativeSpecifier, SourceFile } from './writer'

export const ATLAS_FILE = 'atlas.scenarios.ts'
export const ATLAS_WRAPPER_FILE = 'atlas.wrapper.tsx'

/**
 * Emit `atlas.scenarios.ts`.
 *
 * Shaped to drop straight into `atlas.config.ts`'s `scenarios` field, so
 * wiring it up is a spread rather than a migration.
 */
export function emitAtlasScenarios(doc: IrDocument): SourceFile {
  const f = new SourceFile(ATLAS_FILE)
  const ops = previewOperations(doc)

  f.line()
  f.doc(
    `Atlas scenarios for ${doc.title}, derived from the spec.`,
    '',
    'Wire into `atlas.config.ts`:',
    '',
    '```ts',
    "import { scenarios } from './src/gen/atlas.scenarios'",
    'export default { scenarios }',
    '```',
    '',
    'Every preview gets the three states a live request will not produce on',
    'demand -- loading, error, empty -- which are the three a UI most often',
    'gets wrong. They regenerate with the spec instead of drifting from it.',
  )

  if (ops.length === 0) {
    f.line('export const scenarios = {}')
    f.line()
    f.doc('No previewable operations in this spec (all are mutations or take path params).')
    return f
  }

  f.line('export const scenarios = {')
  for (const op of ops) {
    f.line(`  ${q(previewName(op))}: [`)
    // The live request first: the default view is the real thing.
    f.line(`    { name: 'Default', args: {} },`)
    for (const state of FORCED_STATES) {
      f.line(`    { name: ${q(label(state))}, args: ${jsonLiteral({ force: state })} },`)
    }
    f.line('  ],')
  }
  f.line('}')
  return f
}

function label(state: string): string {
  return state.charAt(0).toUpperCase() + state.slice(1)
}

/**
 * Emit `atlas.wrapper.tsx`.
 *
 * The previews need a `QueryClientProvider`, and Atlas says so precisely when
 * one is missing -- so the last hand-wiring step is one the generator can just
 * do. Installing the generated mocks alongside it is what makes the workbench
 * work with NO server, which is the difference between a catalog people browse
 * and one that shows an error on every card.
 */
export function emitAtlasWrapper(doc: IrDocument): SourceFile {
  const f = new SourceFile(ATLAS_WRAPPER_FILE)
  if (previewOperations(doc).length === 0) return f

  f.import('@pyreon/query', 'QueryClient', 'QueryClientProvider')
  f.importType('@pyreon/core', 'VNodeChild')
  f.import(relativeSpecifier(ATLAS_WRAPPER_FILE, 'mocks.ts'), 'installMocks')

  f.line()
  f.doc(
    'Wrapper for the generated previews. Wire into `atlas.config.ts`:',
    '',
    '```ts',
    "export { wrapper } from './src/gen/atlas.wrapper'",
    '```',
    '',
    'Retries are OFF and gcTime is Infinity: a workbench wants the ERROR state',
    'to appear immediately rather than after a retry budget, and a card that',
    'refetches while you look at it is a card you cannot read.',
  )
  f.line('const client = new QueryClient({')
  f.line('  defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },')
  f.line('})')
  f.line()
  f.line('// Serve the generated fixtures, so every preview renders with no server.')
  f.line('installMocks()')
  f.line()
  f.line('export function wrapper(props: { children?: VNodeChild }) {')
  f.line('  return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>')
  f.line('}')
  return f
}
