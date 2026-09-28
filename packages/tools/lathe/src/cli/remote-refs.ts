/**
 * `remoteRefs: 'fetch'` — download the REMOTE parts of a spec on disk before
 * a (synchronous, offline) generation reads it.
 *
 * `generate` stays a pure function of what it is handed: this runs first,
 * asynchronously, and hands it the fetched documents. The fetching itself is
 * `lathe pull`'s (`documentFetcher`): a per-document ETag cache, credentials
 * scoped to their origin, and no local file reachable from remote content.
 */
import { collectDocumentsAsync, isRemote, type ReadOutcome } from '../input/bundle'
import { parseSpecText } from '../input/yaml'
import { documentCache, documentFetcher } from './pull'

/**
 * Every remote document the spec at `location` reaches -- through its local
 * parts too -- fetched and parsed, keyed by URL. Throws, naming each part,
 * when any cannot be fetched: an explicit `fetch` that silently typed a part
 * `unknown` would make the output depend on whether the network was up.
 */
export async function fetchRemoteParts(
  specText: string,
  location: string,
  readLocal: (id: string) => string,
  remoteHeaders: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined,
  cacheDir: string | undefined,
): Promise<Map<string, ReadOutcome>> {
  const byOrigin = new Map<string, Readonly<Record<string, string>>>()
  for (const [origin, headers] of Object.entries(remoteHeaders ?? {})) {
    try {
      byOrigin.set(new URL(origin).origin, headers)
    } catch {
      throw new Error(`[Pyreon] lathe: remoteHeaders key \`${origin}\` is not an origin (use \`https://host[:port]\`).`)
    }
  }
  const store = documentCache(cacheDir)
  const fetchRemote = documentFetcher(store.cache, store.cacheFile, (id) => {
    const headers = byOrigin.get(new URL(id).origin)
    return headers ? { ...headers } : undefined
  })
  const remote = new Map<string, ReadOutcome>()
  await collectDocumentsAsync(parseSpecText(specText), location, async (id) => {
    if (isRemote(id)) {
      const outcome = await fetchRemote(id)
      remote.set(id, outcome)
      return outcome
    }
    try {
      return { doc: parseSpecText(readLocal(id)) }
    } catch (err) {
      // A missing LOCAL part is the loader's to report, as without `fetch`.
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })
  store.save()
  const failed = [...remote].filter((e): e is [string, { error: string }] => 'error' in e[1])
  if (failed.length > 0) {
    throw new Error(
      `[Pyreon] lathe: \`remoteRefs: 'fetch'\` could not fetch ${failed.length} referenced document(s), so nothing was generated:\n` +
        failed.map(([id, o]) => `  ${id}: ${o.error}`).join('\n'),
    )
  }
  return remote
}
