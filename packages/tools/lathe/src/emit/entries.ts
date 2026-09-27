/**
 * The generated ENTRY POINTS — the composition layer.
 *
 * A generator produces a graph, not a bag of files, and the entry points are
 * where that graph becomes visible to a bundler. Getting them wrong is not a
 * matter of taste: measured on a 30-tag / 120-operation spec with real Vite,
 * importing ONE hook through a barrel that re-exported everything pulled in
 *
 *   30,710 B (2,420 B gz) — all 120 endpoints AND all 120 mock fixtures
 *
 * against
 *
 *    6,063 B   (766 B gz) — 4 endpoints, no fixtures
 *
 * for the same hook reached through its own tag. 5.1x raw, 3.2x gzipped, and
 * a production bundle carrying a fixture table nobody asked for.
 *
 * `api.endpoint(...)` and `s.object({ ... })` are module-level CALLS, so a
 * bundler retains every one it cannot prove side-effect-free. Two things
 * answer that, and both are needed: REACHABILITY (what an entry names -- this
 * file, plus one schema module per model) and PURITY (`/* @__PURE__ *\/` on
 * EVERY emitted call, arguments included, so an unused declaration inside a
 * reached module is dropped). An early measurement annotated only the OUTER
 * declaration, found 2%, and concluded purity was useless; annotated
 * throughout it is the larger of the two levers -- see `emitSchemas` for the
 * GitHub/Stripe numbers.
 *
 * So the entries mirror the dependency layering instead of flattening it:
 *
 *   index.ts          production — schemas, client, endpoints, queries, keys
 *   dev.ts            fixtures, factories and previews — never in a page bundle
 *   endpoints/index   one layer, for consumers that want the calls and no hooks
 *   queries/index     one layer, for consumers that want the hooks
 *   <tag> modules     the finest grain; Vite emits one chunk per tag
 *
 * `dev.ts` is the same shape as `@pyreon/server/client` in this repo: a
 * capability that is perfectly safe on its own, kept out of the barrel its
 * siblings live in, because a barrel is a reachability edge and reachability
 * is what decides bundle contents.
 */

import type { IrDocument } from '../core/ir'
import { hookOf, typeIdent } from '../core/naming'
import { byTag, isMutation, tagFile } from './client'
import type { ClientName } from './client-runtime'
import { relativeSpecifier, SourceFile } from './writer'

export const BARREL_FILE = 'index.ts'
export const DEV_FILE = 'dev.ts'
export const ENDPOINTS_BARREL = 'endpoints/index.ts'
export const QUERIES_BARREL = 'queries/index.ts'

export interface EntryOptions {
  plugins: readonly string[]
  client?: ClientName | undefined
  /**
   * The paths that were ACTUALLY emitted before the entries.
   *
   * An entry re-exports files, and the plugin selection says which files were
   * ASKED for, not which exist: an emitter with nothing to say (no models, no
   * query operations, no faker factories) produces no file at all. Keying the
   * barrel on the selection made a zero-model or zero-operation spec emit an
   * `index.ts` importing `./schemas` / `./keys` / `./faker` that were never
   * written. When omitted, every selected module is assumed present.
   */
  emitted?: ReadonlySet<string> | undefined
}

/** Is `file` (a path relative to the output root) going to exist? */
function exists(opts: EntryOptions, file: string): boolean {
  return opts.emitted === undefined || opts.emitted.has(file)
}

/**
 * `index.ts` — the PRODUCTION surface.
 *
 * Everything here is code a page legitimately ships: types, the client, the
 * endpoint calls, the hooks, the keys. Fixtures, fake-data factories and
 * preview components are deliberately absent — see {@link emitDevEntry}.
 */
export function emitBarrel(doc: IrDocument, opts: EntryOptions): SourceFile {
  const f = new SourceFile(BARREL_FILE)
  const has = (p: string): boolean => opts.plugins.includes(p)
  const lines: string[] = []

  f.line()
  f.doc(
    `Everything from ${doc.title} ${doc.version} that a page ships.`,
    '',
    'The per-tag split is an emitter concern: a consumer should not have to',
    'know which tag an operation was filed under, or that tags exist.',
    '',
    'Importing one hook from here costs the same as importing it from its own',
    'tag module: every declaration is annotated pure and the `package.json`',
    'next to this file declares the output side-effect-free, so a bundler keeps',
    'only what the hook reaches (measured on GitHub\'s spec with Vite 8: 2.8 kB',
    'gzipped of generated code either way). A bundler that ignores both hints',
    'keeps more through this file than through the tag.',
    '',
    'Fixtures and fake-data factories are NOT re-exported here -- they live in',
    '`./dev`, so a page bundle cannot reach them. Preview components are absent',
    'for the same reason and live in `./components`.',
  )

  if (has('schemas')) {
    if (exists(opts, 'schemas.ts')) lines.push(`export * from './schemas'`)
  } else if (has('types') && exists(opts, 'types.ts')) lines.push(`export * from './types'`)
  if (has('client')) {
    if (exists(opts, 'client.ts')) {
      // The runtime seam (dx D8) is part of the production surface: an app
      // configures its base URL and auth from here, not by editing output.
      // Identical for every client: each one exports `configureApi` and, per
      // security scheme, `auth` — only their per-library shapes differ.
      const auth = (doc.securitySchemes?.length ?? 0) > 0
      lines.push(`export { api, configureApi, ${auth ? 'auth, ' : ''}type ApiConfig } from './client'`)
    }
    for (const [tag] of byTag(doc)) {
      if (exists(opts, `endpoints/${tagFile(tag)}.ts`)) {
        lines.push(`export * from './endpoints/${tagFile(tag)}'`)
      }
    }
  }
  if (has('queries')) {
    for (const [tag] of byTag(doc)) {
      if (exists(opts, `queries/${tagFile(tag)}.ts`)) lines.push(`export * from './queries/${tagFile(tag)}'`)
    }
    if (exists(opts, KEYS_FILE)) lines.push(`export { keys, optimisticUpdate } from './keys'`)
  }
  for (const l of lines) f.line(l)
  // A file with no import/export is a SCRIPT, and a consumer compiling with
  // `isolatedModules` rejects it (TS1208). Only reachable for a spec that
  // emits nothing re-exportable.
  if (lines.length === 0) f.line('export {}')
  return f
}

/**
 * `dev.ts` — fixtures, fake-data factories and previews.
 *
 * Split out for reachability, not for tidiness. A mock route table is DATA:
 * unlike an unused function it survives minification wherever it is reachable,
 * so a barrel that names it puts every fixture in the page bundle. Measured at
 * 120 operations that was the whole fixture table, in production.
 *
 * Nothing here is unsafe to import — it is unsafe to import ACCIDENTALLY,
 * which is exactly what a convenience barrel does.
 */
export function emitDevEntry(doc: IrDocument, opts: EntryOptions): SourceFile | null {
  const f = new SourceFile(DEV_FILE)
  const has = (p: string): boolean => opts.plugins.includes(p)
  const mocks = has('mocks') && exists(opts, 'mocks.ts')
  const faker = has('faker') && exists(opts, 'faker.ts')
  if (!mocks && !faker) return null

  f.line()
  f.doc(
    `Development surface for ${doc.title} -- fixtures and fake-data factories.`,
    '',
    'Kept out of `./index` on purpose. A fixture table is DATA, so it survives',
    'tree-shaking anywhere it is reachable; a barrel that named it shipped',
    'every fixture to production. Import from here in tests, workbenches and',
    'stories, and a page bundle can never reach it by accident.',
    '',
    'NODE-SAFE by construction, and that is why the preview components are NOT',
    'here. They are JSX, so re-exporting them made this entry require a JSX',
    'transform -- a plain node test that wanted one fake object had to configure',
    'one, for components it never touches. Previews are a workbench surface with',
    'exactly one kind of consumer (an Atlas config, a story), and that consumer',
    'imports `./components` directly.',
  )
  if (mocks) {
    f.line(
      `export { installMocks, mockCalls, mockOperation, resetMocks, routes as mockRouteTable, type MockedOperation } from './mocks'`,
    )
    // `mockRoutes` is a `@pyreon/http` MIDDLEWARE and has no equivalent on the
    // generated adapters, which answer through their own transport seam.
    if ((opts.client ?? 'pyreon') === 'pyreon') {
      f.line(`export { mockRoutes } from './mocks'`)
    }
  }
  if (faker) f.line(`export * from './faker'`)
  return f
}

/** `endpoints/index.ts` — every endpoint call, no hooks. */
export function emitEndpointsBarrel(doc: IrDocument): SourceFile | null {
  const tags = [...byTag(doc)]
  if (tags.length === 0) return null
  const f = new SourceFile(ENDPOINTS_BARREL)
  f.line()
  f.doc(
    'Every endpoint, without the query layer.',
    '',
    'For code that calls the API directly -- a loader, a server route, a',
    'script -- and has no use for hooks or a QueryClient.',
  )
  for (const [tag] of tags) f.line(`export * from './${tagFile(tag)}'`)
  return f
}

/** `queries/index.ts` — every hook, no previews. */
export function emitQueriesBarrel(doc: IrDocument): SourceFile | null {
  // A group whose every hook is turned off emits no queries module.
  const tags = [...byTag(doc)].filter(([, ops]) => ops.some((op) => hookOf(op) !== undefined))
  if (tags.length === 0) return null
  const f = new SourceFile(QUERIES_BARREL)
  f.line()
  f.doc(
    'Every generated hook.',
    '',
    'Reaches every endpoint in the spec. Import a single tag instead when',
    'bundle size matters -- Vite emits one chunk per tag file.',
  )
  for (const [tag] of tags) f.line(`export * from './${tagFile(tag)}'`)
  return f
}

export const KEYS_FILE = 'keys.ts'

/**
 * Emit `keys.ts` — the query keys, derived from the endpoints themselves.
 *
 * `.prefix` matches every call of an endpoint regardless of arguments, which
 * is what invalidation almost always wants: after creating a book you want
 * every `GET /books` variant refetched, not one exact argument tuple.
 */
export function emitKeys(doc: IrDocument): SourceFile {
  const f = new SourceFile(KEYS_FILE)
  const tags = [...byTag(doc)]
  const queryOps = tags.map(([tag, ops]) => [tag, ops.filter((o) => !isMutation(o))] as const)

  for (const [tag, ops] of queryOps) {
    if (ops.length === 0) continue
    f.import(relativeSpecifier(KEYS_FILE, `endpoints/${tagFile(tag)}.ts`), ...ops.map((o) => o.id))
  }
  f.importType('@pyreon/query', 'QueryClient', 'QueryKey')

  f.line()
  f.doc(
    'Query keys, derived from the endpoints rather than written by hand.',
    '',
    "A hand-written `['GET', '/books']` drifts from the endpoint the moment",
    'a path changes, and nothing catches it. These move with the spec.',
    '',
    '```ts',
    "queryClient.invalidateQueries({ queryKey: keys.books.listBooks.all })",
    "queryClient.invalidateQueries({ queryKey: keys.books.getBook.of({ params: { bookId: '1' } }) })",
    '```',
  )
  f.line('export const keys = {')
  for (const [tag, ops] of queryOps) {
    if (ops.length === 0) continue
    f.line(`  ${typeIdent(tag).charAt(0).toLowerCase()}${typeIdent(tag).slice(1)}: {`)
    for (const op of ops) {
      f.line(`    ${op.id}: {`)
      // `.all` matches EVERY call of this endpoint; `.of(args)` matches one.
      f.line(`      all: ${op.id}.key.prefix,`)
      f.line(`      of: ${op.id}.key,`)
      f.line('    },')
    }
    f.line('  },')
  }
  f.line('} as const')

  f.line()
  f.doc(
    'Optimistically rewrite cached query data, returning a ROLLBACK (audit E2).',
    '',
    'Cancels in-flight fetches for `queryKey` (so a late response cannot',
    'overwrite the optimistic value), applies `update` to every cached entry',
    'under it, and returns a function restoring exactly what was there. The',
    'data type is the endpoint\'s own response type — pass the endpoint.',
    '',
    '```ts',
    'const rename = useRenamePet({',
    '  onMutate: async (vars) => {',
    '    const rollback = await optimisticUpdate(client, getPet, getPet.key(vars), (pet) =>',
    '      pet && { ...pet, name: vars.json.name })',
    '    return { rollback }',
    '  },',
    '  onError: (_e, _v, ctx) => ctx?.rollback(),',
    '})',
    '```',
  )
  f.line('export async function optimisticUpdate<E extends (...args: never[]) => Promise<unknown>>(')
  f.line('  client: QueryClient,')
  f.line('  _endpoint: E,')
  f.line('  queryKey: QueryKey,')
  f.line('  update: (current: Awaited<ReturnType<E>> | undefined) => Awaited<ReturnType<E>> | undefined,')
  f.line('): Promise<() => void> {')
  f.line('  await client.cancelQueries({ queryKey })')
  f.line('  const previous = client.getQueriesData<Awaited<ReturnType<E>>>({ queryKey })')
  f.line('  client.setQueriesData<Awaited<ReturnType<E>>>({ queryKey }, update)')
  f.line('  return () => {')
  f.line('    for (const [key, data] of previous) client.setQueryData(key, data)')
  f.line('  }')
  f.line('}')
  return f
}
