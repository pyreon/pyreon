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
 *  - disjoint → recursive **copy** (the normal case for a server bundle landing
 *    in a sibling function directory, or a genuinely separate clientOutDir).
 *
 * @param src      source directory (must exist for the copy/move paths).
 * @param dest     where `src`'s contents should end up.
 * @param preserve top-level entries of `src` to leave in place when moving
 *                 (the destination's own top segment is always preserved
 *                 automatically). Use this for the server subdir and any
 *                 scaffold files the adapter writes after staging.
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

  // `dest` inside `src`: a whole-directory recursive copy would recurse into
  // the destination (EINVAL). Copy `src`'s top-level entries into `dest`
  // INDIVIDUALLY instead — each entry's source/dest are disjoint subtrees once
  // the destination's own top segment is skipped, so there's no self-copy. The
  // originals are PRESERVED (not moved) so `outDir` stays a valid flat layout
  // for `vite preview` / other tooling.
  if (d.startsWith(s + sep)) {
    const destTop = relative(s, d).split(sep)[0] ?? ''
    const skip = new Set<string>([destTop, ...preserve])
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
