import { basename, join, relative, resolve, sep } from 'node:path'

/**
 * Stage a built directory tree so its contents end up at `dest`, correctly
 * handling the zero SSR-plugin layout where adapters receive
 * `clientOutDir === outDir` (and a server bundle already living inside that
 * same `outDir`).
 *
 * ## Why this exists
 *
 * The SSR plugin (`ssr-plugin.ts`) runs in `closeBundle`, AFTER the client
 * build has written its assets to `distDir`. It then invokes the adapter with
 * `clientOutDir === outDir === distDir` and `serverEntry` pointing at
 * `distDir/server/entry-server.js`. Every deploy adapter wants to place the
 * client under a subdirectory of `outDir` (`outDir/client`, `.vercel/output/
 * static`, `publish/`, …) and the server under another (`outDir/server`,
 * `functions/ssr.func`, …). A naive `cp(clientOutDir, outDir/client)` is then
 * a **copy of a directory into its own subtree** — Node's `fs.cp` throws
 * `ERR_FS_CP_EINVAL` ("Cannot copy … into itself"). The node/bun server copy
 * (`cp(distDir/server, distDir/server)`) is an even more direct self-copy and
 * throws `ERR_FS_CP_EINVAL` ("src and dest cannot be the same"). Because that
 * throw happens BEFORE the adapter writes its runtime entry (`index.js` /
 * `_worker.js` / …), the deploy artifact is never produced — `node
 * dist/index.js` doesn't exist, and SSR/ISR builds ship a client bundle with
 * no runnable server.
 *
 * ## Behaviour
 *
 *  - `src` and `dest` resolve to the same directory → **no-op** (the build is
 *    already in place — e.g. node's server copy, or the static/cloudflare
 *    "client stays flat at the root" shape).
 *  - `dest` is INSIDE `src` (e.g. `src=dist`, `dest=dist/client`) → **copy**
 *    each top-level entry of `src` into `dest`, skipping the destination's own
 *    top-level segment and any `preserve` entries (the server subdir, the
 *    scaffold files the adapter writes next). Copying ENTRY-BY-ENTRY avoids the
 *    copy-into-self recursion (each entry's source/dest are disjoint subtrees
 *    once the dest's own ancestor is skipped) while PRESERVING the original
 *    flat layout — `vite preview` and other tooling serve `outDir` directly, so
 *    moving the client out would 404 them. (A whole-directory `cp(src, dest)`
 *    here is what throws `ERR_FS_CP_EINVAL`; per-entry copy does not.)
 *  - disjoint → recursive **copy**. When `preserve` is empty this is a single
 *    whole-directory `cp` (the common case — a server bundle landing in a
 *    sibling function directory). When `preserve` is non-empty (e.g. Vercel
 *    stages the client into a root-level `.vercel/output/static`, disjoint from
 *    `dist`, but must still skip the `dist/server` subdir), it falls to the
 *    same per-entry copy so `preserve` is honored regardless of the src/dest
 *    relationship — `preserve` means "don't copy these top-level entries" and
 *    that invariant must hold for disjoint dests too.
 *
 * @param src      source directory (must exist for the copy/move paths).
 * @param dest     where `src`'s contents should end up.
 * @param preserve top-level entries of `src` to leave in place when copying
 *                 (the destination's own top segment, when `dest` is inside
 *                 `src`, is always skipped automatically). Use this for the
 *                 server subdir and any scaffold files the adapter writes next.
 */
export async function materialize(
  src: string,
  dest: string,
  { preserve = [] as readonly string[] }: { preserve?: readonly string[] } = {},
): Promise<void> {
  const s = resolve(src)
  const d = resolve(dest)

  // Same directory — nothing to do (server already at outDir/server; or the
  // static/cloudflare flat-client case where client === outDir).
  if (s === d) return

  const { cp, mkdir, readdir } = await import('node:fs/promises')
  await mkdir(d, { recursive: true })

  // Build the set of top-level `src` entries to SKIP. `preserve` always
  // applies. When `dest` is INSIDE `src`, its own top-level ancestor segment
  // must also be skipped — a whole-directory recursive copy would otherwise
  // recurse into the destination (`ERR_FS_CP_EINVAL`).
  const skip = new Set<string>(preserve)
  if (d.startsWith(s + sep)) {
    skip.add(relative(s, d).split(sep)[0] ?? '')
  }

  // Anything to skip → copy `src`'s top-level entries INDIVIDUALLY (each
  // entry's source/dest are disjoint subtrees, so no self-copy) while
  // PRESERVING the originals so `outDir` stays a valid flat layout for
  // `vite preview` / other tooling. Nothing to skip AND disjoint → the fast
  // whole-directory copy.
  if (skip.size > 0) {
    for (const entry of await readdir(s)) {
      if (skip.has(entry)) continue
      await cp(join(s, entry), join(d, entry), { recursive: true })
    }
    return
  }

  await cp(s, d, { recursive: true })
}

/**
 * Stage a deploy adapter's client + server builds in the canonical order:
 * client → `clientDest`, then server → `serverDest`. Every SSR deploy adapter
 * does exactly this; the only per-adapter variation is the two destinations +
 * any extra top-level entries to preserve during the client stage (scaffold
 * files the adapter writes next, a sibling functions dir, …).
 *
 * Centralizing it removes a silent-stomp foot-gun: the client source is the
 * build's `outDir`, which CONTAINS the server bundle's subdir — that segment
 * MUST be in the client stage's `preserve` or the client copy sweeps the
 * server bundle into the client dir. Rather than hand-maintain that `'server'`
 * entry in every adapter (easy to forget), this derives it from `serverEntry`
 * (`basename(serverEntry/..)`) and always preserves it.
 *
 * @param options  `clientOutDir` + `serverEntry` (the adapter's build inputs).
 * @param layout   `clientDest` / `serverDest` + extra `preserve` entries.
 */
export async function stageClientThenServer(
  options: { clientOutDir: string; serverEntry: string },
  layout: { clientDest: string; serverDest: string; preserve?: readonly string[] },
): Promise<void> {
  const serverSrc = join(options.serverEntry, '..')
  await materialize(options.clientOutDir, layout.clientDest, {
    preserve: [basename(serverSrc), ...(layout.preserve ?? [])],
  })
  await materialize(serverSrc, layout.serverDest)
}
