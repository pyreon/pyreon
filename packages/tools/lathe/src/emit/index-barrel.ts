/**
 * The generated barrel and the query-key registry.
 *
 * Two things a consumer otherwise writes by hand and gets subtly wrong.
 *
 * The BARREL exists because the per-tag split is an emitter concern, not
 * something a consumer should have to know: `import { useListBooks } from
 * './gen'` should work without knowing which tag that operation was filed
 * under, or that tags exist at all.
 *
 * The KEY REGISTRY exists because cache invalidation is where a generated
 * client usually stops helping. `queryClient.invalidateQueries({ queryKey:
 * ['GET', '/books'] })` is a hand-written literal that drifts from the endpoint
 * the moment a path changes, and nothing catches it. Deriving the keys from the
 * same endpoints means a path edit moves both, or fails to compile.
 */

import type { IrDocument } from '../core/ir'
import { typeIdent } from '../core/naming'
import { byTag, isMutation, tagFile } from './client'
import { relativeSpecifier, SourceFile } from './writer'

export const BARREL_FILE = 'index.ts'

/** Emit `index.ts` — one import site for everything generated. */
export function emitBarrel(doc: IrDocument, opts: { plugins: readonly string[] }): SourceFile {
  const f = new SourceFile(BARREL_FILE)
  const has = (p: string): boolean => opts.plugins.includes(p)
  const lines: string[] = []

  f.line()
  f.doc(
    `Everything generated from ${doc.title} ${doc.version}, in one import site.`,
    '',
    'The per-tag split is an emitter concern. A consumer should not have to',
    'know which tag an operation was filed under, or that tags exist.',
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
  if (has('mocks')) lines.push(`export { mockRoutes, routes as mockRouteTable } from './mocks'`)
  for (const l of lines) f.line(l)
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
    'A hand-written `[\'GET\', \'/books\']` drifts from the endpoint the moment',
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
