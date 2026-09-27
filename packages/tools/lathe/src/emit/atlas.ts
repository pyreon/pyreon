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

import type { IrDocument, IrOperation, IrType } from '../core/ir'
import { pascal } from '../core/naming'
import { sampleValue } from '../core/sample-value'
import { FORCED_STATES, previewName, previewOperations } from './components'
import { FAKER_FILE } from './faker'
import { jsLiteral } from './jsdoc'
import { jsonLiteral, q, relativeSpecifier, SourceFile } from './writer'

export const ATLAS_FILE = 'atlas.scenarios.ts'
export const ATLAS_WRAPPER_FILE = 'atlas.wrapper.tsx'

/**
 * Emit `atlas.scenarios.ts`.
 *
 * Shaped to drop straight into `atlas.config.ts`'s `scenarios` field, so
 * wiring it up is a spread rather than a migration.
 *
 * Five scenarios per preview: `Default` (the request, answered by the mocks),
 * `Data` (realistic fake data passed through the preview's `data` prop), and
 * the three forced states. `Data` uses the faker factories when the `faker`
 * plugin ran — seeded, so a visual baseline does not flake — and otherwise the
 * same deterministic sample the mocks return.
 */
export function emitAtlasScenarios(doc: IrDocument, opts: { faker?: boolean } = {}): SourceFile {
  const f = new SourceFile(ATLAS_FILE)
  const ops = previewOperations(doc)

  f.line()
  f.doc(
    `Atlas scenarios for ${doc.title}, one set per generated preview.`,
    '',
    '@example',
    '```ts',
    '// atlas.config.ts',
    "import { scenarios } from './src/gen/atlas.scenarios'",
    "import { wrapper } from './src/gen/atlas.wrapper'",
    'export default { scenarios, wrapper }',
    '```',
  )

  if (ops.length === 0) {
    f.line('export const scenarios = {}')
    f.line()
    f.doc('No previewable operations in this spec: previews are generated for GET operations with a JSON response.')
    return f
  }

  const factories = new Set<string>()
  const dataExprs = ops.map((op) => dataExpr(op, doc, opts.faker === true, factories))
  if (factories.size > 0) {
    f.import(relativeSpecifier(ATLAS_FILE, FAKER_FILE), 'seedFaker', ...factories)
    f.line()
    f.line('// A fixed seed, so the "Data" scenario renders the same values every run.')
    f.line('seedFaker(1)')
  }

  f.line()
  f.line('export const scenarios = {')
  for (const [i, op] of ops.entries()) {
    f.line(`  ${q(previewName(op))}: [`)
    // The live request first: the default view is the real thing.
    f.line(`    { name: 'Default', args: {} },`)
    f.line(`    { name: 'Data', args: { data: ${dataExprs[i]} } },`)
    for (const state of FORCED_STATES) {
      f.line(`    { name: ${q(label(state))}, args: ${jsonLiteral({ force: state })} },`)
    }
    f.line('  ],')
  }
  f.line('}')
  return f
}

/**
 * The `data` a preview's "Data" scenario renders: a faker factory call for a
 * named model (or a short list of them), else the deterministic sample.
 */
function dataExpr(op: IrOperation, doc: IrDocument, faker: boolean, factories: Set<string>): string {
  const type = op.response as IrType
  const named = (t: IrType): string | undefined =>
    t.kind === 'ref' ? t.name : t.kind === 'nullable' ? named(t.inner) : undefined
  if (faker) {
    const one = named(type)
    if (one) {
      const fn = `create${pascal(one)}`
      factories.add(fn)
      return `${fn}()`
    }
    const inner = type.kind === 'array' ? named(type.items) : undefined
    if (type.kind === 'array' && inner) {
      const fn = `create${pascal(inner)}`
      factories.add(fn)
      return `Array.from({ length: 5 }, () => ${fn}())`
    }
  }
  return jsLiteral(sampleValue(type, doc), 6, 30)
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
    'Wraps every generated preview: a QueryClient, with the mock routes installed',
    'so the previews render with no server. Queries never retry or refetch, so',
    'an error shows at once and a card does not change while you read it.',
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
