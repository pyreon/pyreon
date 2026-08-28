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
 * The mechanism is worth stating because the obvious fix does not work.
 * `api.endpoint(...)` and `s.object({ ... })` are module-level CALLS, so a
 * bundler cannot prove them side-effect-free and retains every one the entry
 * reaches. Annotating them `/* @__PURE__ *\/` is the reflex and it is nearly
 * useless — measured 2,041 B -> 2,000 B, 2% — because the ARGUMENTS are
 * themselves calls (`s.string().uuid()`), which esbuild must still evaluate.
 * The lever is not purity, it is REACHABILITY: what the entry point names.
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
import { typeIdent } from '../core/naming'
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
    'Reaching for one hook here reaches every operation in the spec, because',
    'an endpoint declaration is a module-level call a bundler must keep. On a',
    '120-operation spec that measured 30.7 kB against 6.1 kB for the same hook',
    "imported from its own tag. If that matters, import the tag: ",
    "`import { useListBooks } from './gen/queries/books'`.",
    '',
    'Fixtures, fake-data factories and preview components are NOT re-exported',
    "here -- they live in `./dev`, so a page bundle cannot reach them.",
  )

  if (has('schemas')) lines.push(`export * from './schemas'`)
  else if (has('types')) lines.push(`export * from './types'`)
  if (has('client')) {
    lines.push(`export { api } from './client'`)
    for (const [tag] of byTag(doc)) {
      lines.push(`export * from './endpoints/${tagFile(tag)}'`)
    }
  }
  if (has('queries')) {
    for (const [tag] of byTag(doc)) lines.push(`export * from './queries/${tagFile(tag)}'`)
    lines.push(`export { keys } from './keys'`)
  }
  for (const l of lines) f.line(l)
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
  if (!has('mocks') && !has('faker') && !has('components')) return null

  f.line()
  f.doc(
    `Development surface for ${doc.title} -- fixtures, factories, previews.`,
    '',
    'Kept out of `./index` on purpose. A fixture table is DATA, so it survives',
    'tree-shaking anywhere it is reachable; a barrel that named it shipped',
    'every fixture to production. Import from here in tests, workbenches and',
    'stories, and a page bundle can never reach it by accident.',
  )
  if (has('mocks')) {
    f.line(`export { installMocks, routes as mockRouteTable } from './mocks'`)
    // `mockRoutes` is a `@pyreon/http` MIDDLEWARE and has no equivalent on the
    // generated adapters, which answer through their own transport seam.
    if ((opts.client ?? 'pyreon') === 'pyreon') {
      f.line(`export { mockRoutes } from './mocks'`)
    }
  }
  if (has('faker')) f.line(`export * from './faker'`)
  if (has('components')) f.line(`export * from './components'`)
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
  const tags = [...byTag(doc)]
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
  if (queryOps.every(([, ops]) => ops.length === 0)) return f

  for (const [tag, ops] of queryOps) {
    if (ops.length === 0) continue
    f.import(relativeSpecifier(KEYS_FILE, `endpoints/${tagFile(tag)}.ts`), ...ops.map((o) => o.id))
  }

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
  return f
}
