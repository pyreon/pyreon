import type { CollectionEntry, CollectionSchemas } from './types'
import { getEntry } from './runtime'

// ─── Cross-collection references (PR-J audit M14) ─────────────────────────
//
// `reference(collection, slug)` returns a typed pointer that can be
// stored in a schema field. The value is intentionally a plain object —
// schemas + serialization stay JSON-friendly. The runtime helpers
// `resolveReference` / `resolveReferences` look the entry up on demand.
//
// Use case:
//
//     // content.config.ts
//     defineCollection({
//       schema: z.object({
//         title: z.string(),
//         author: z.custom<Reference<'authors'>>(),
//       }),
//     })
//
//     // post.md
//     ---
//     title: My Post
//     author: { collection: authors, slug: jdoe }
//     ---
//
//     // page.tsx
//     const post = await getEntry('posts', 'my-post')
//     const author = await resolveReference(post.data.author)

export interface Reference<K extends string = string> {
  /** Canonical brand — discriminates from other plain objects. */
  __pyreonReference: true
  /** Collection name. */
  collection: K
  /** Entry slug within that collection. */
  slug: string
}

/**
 * Build a typed cross-collection reference. Stored in frontmatter or
 * passed around the app code; resolved on demand via
 * `resolveReference`.
 *
 * Pure / runtime-agnostic — no IO at construction time.
 */
export function reference<K extends keyof CollectionSchemas & string>(
  collection: K,
  slug: string,
): Reference<K>
export function reference(collection: string, slug: string): Reference
export function reference(collection: string, slug: string): Reference {
  return { __pyreonReference: true, collection, slug }
}

/**
 * Type guard. Useful when a frontmatter field is `unknown` at runtime
 * (parsed from YAML) and the caller wants to assert reference shape.
 */
export function isReference(value: unknown): value is Reference {
  return (
    typeof value === 'object'
    && value !== null
    && (value as Record<string, unknown>)['__pyreonReference'] === true
    && typeof (value as Record<string, unknown>)['collection'] === 'string'
    && typeof (value as Record<string, unknown>)['slug'] === 'string'
  )
}

/**
 * Look up a reference. Returns `undefined` if the target collection
 * isn't registered or the slug doesn't match an entry.
 */
export async function resolveReference<
  K extends keyof CollectionSchemas & string,
>(
  ref: Reference<K>,
): Promise<CollectionEntry<CollectionSchemas[K]> | undefined>
export async function resolveReference(
  ref: Reference,
): Promise<CollectionEntry | undefined>
export async function resolveReference(
  ref: Reference,
): Promise<CollectionEntry | undefined> {
  return getEntry(ref.collection, ref.slug)
}

/**
 * Look up several references in parallel. Missing entries are filtered
 * out (consistent with `getEntries`).
 */
export async function resolveReferences<
  K extends keyof CollectionSchemas & string,
>(refs: Reference<K>[]): Promise<CollectionEntry<CollectionSchemas[K]>[]>
export async function resolveReferences(
  refs: Reference[],
): Promise<CollectionEntry[]>
export async function resolveReferences(
  refs: Reference[],
): Promise<CollectionEntry[]> {
  const all = await Promise.all(refs.map((r) => resolveReference(r)))
  return all.filter((e): e is CollectionEntry => e !== undefined)
}
