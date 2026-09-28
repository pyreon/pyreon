/**
 * The non-hashed static files a deploy must serve AS FILES — everything the
 * user put in `public/` (plus anything a plugin wrote beside it), other than
 * the content-hashed `<assetsDir>/` tree every adapter already routes by
 * prefix.
 *
 * ## Why this exists
 *
 * The serverless / edge adapters route every request to the SSR function by
 * default and carve out static files with a hand-written list —
 * `/favicon.*`, `/robots.txt`, `/sitemap.xml`, `/site.webmanifest`. Anything
 * else in `public/` (`humans.txt`, `og.png`, `icons/…`,
 * `/.well-known/security.txt`) was SHADOWED: the function answered it with a
 * server-rendered HTML page, status 200. Netlify Edge Functions run before
 * static files, so there even `robots.txt` was shadowed. Found by running the
 * emitted artifacts in workerd, Deno and Vercel's Edge Runtime
 * (`e2e/edge-runtimes.spec.ts`); a Node-invoked unit test cannot see it,
 * because routing is the platform's, not the handler's.
 *
 * Enumerating the files at build time is the only complete answer: a
 * runtime "does this file exist?" check needs a filesystem the edge does not
 * have.
 *
 * Skipped: dotfiles/dirs other than `.well-known/` (`.vite/`), HTML (the SSR template and any
 * prerendered page — their routing is the render mode's business), the
 * `<assetsDir>/` tree (prefix-routed already), top-level `_`-prefixed entries
 * (platform config and zero manifests: `_headers`, `_routes.json`,
 * `_worker.js`, `_redirects`, `_pyreon-*.json`, `_server/`) and any
 * caller-named top-level entry (server bundles staged beside the client).
 *
 * @returns URL paths with a leading `/`, sorted (deterministic output).
 */
export async function listStaticFiles(
  dir: string,
  options: { assetsDir?: string | undefined; skip?: readonly string[] } = {},
): Promise<string[]> {
  const { readdir } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const assets = `${(options.assetsDir && options.assetsDir.length > 0 ? options.assetsDir : 'assets').replace(/^\/+|\/+$/g, '')}/`
  const skip = new Set(options.skip ?? [])
  const out: string[] = []

  const walk = async (abs: string, rel: string): Promise<void> => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const name = entry.name
      if (name.startsWith('.') && !(rel === '' && name === '.well-known')) continue
      if (rel === '' && (name.startsWith('_') || skip.has(name))) continue
      const childRel = rel === '' ? name : `${rel}/${name}`
      if (`${childRel}/`.startsWith(assets)) continue
      if (entry.isDirectory()) await walk(join(abs, name), childRel)
      else if (entry.isFile() && !name.endsWith('.html')) out.push(`/${childRel}`)
    }
  }
  await walk(dir, '')
  return out.sort()
}

/** Escape a string for literal use inside a `RegExp` source. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
