/**
 * The hashed-asset URL prefix a deploy actually serves under: `<base><assetsDir>`.
 *
 * Vite's `base` (default `/`) prefixes every asset URL in the built HTML, and
 * static hosts mount `dist/` at that base — so a `base: '/blog/'` +
 * `assetsDir: 'static'` site serves its content-hashed chunks at
 * `/blog/static/...`. Adapter cache rules must match that FULL prefix, not a
 * bare `/assets/`, or a subpath / custom-`assetsDir` deploy silently loses the
 * immutable long-cache treatment.
 *
 * @returns the prefix WITHOUT a trailing slash — e.g. `/assets`, `/blog/static`.
 */
export function assetUrlPrefix(
  base: string | undefined,
  assetsDir: string | undefined,
): string {
  const b = base && base.length > 0 ? base : '/'
  const dir = assetsDir && assetsDir.length > 0 ? assetsDir : 'assets'
  const withSlash = b.endsWith('/') ? b : `${b}/`
  return `${withSlash}${dir}`
}

/**
 * The canonical `_headers` block (Netlify / Cloudflare Pages format) pinning
 * content-hashed assets under `<urlPrefix>/` to a 1-year immutable cache — the
 * same scope `vercel.json` / `netlify.toml` emit. Everything else is left to
 * the host's revalidating default: HTML must NEVER be immutable (it changes on
 * every deploy), and immutability is only safe for files Vite content-hashes,
 * which is exactly the `<base><build.assetsDir>` directory.
 */
function assetImmutableBlock(urlPrefix: string): string {
  return `${urlPrefix}/*\n  Cache-Control: public, max-age=31536000, immutable\n`
}

/**
 * Write (or augment) `<outDir>/_headers` with the asset-immutable rule for the
 * resolved asset URL prefix (`<base><assetsDir>`, default `/assets`).
 *
 * Respects a user-provided `_headers` (e.g. one copied from `public/_headers`
 * by Vite): if a `_headers` already exists AND already declares a policy for
 * this `<urlPrefix>/` prefix, it's left untouched (the user owns their asset
 * caching); otherwise the framework block is appended so user rules and the
 * default coexist. A `_headers` file is inert on hosts that don't read it
 * (GitHub Pages, S3) and honored by Cloudflare Pages + Netlify.
 */
export async function writeAssetCacheHeaders(
  outDir: string,
  urlPrefix = '/assets',
): Promise<void> {
  const { writeFile, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const headersPath = join(outDir, '_headers')
  const block = assetImmutableBlock(urlPrefix)
  const marker = `${urlPrefix}/`

  // Read-then-act: the read IS the existence check (atomic — no `existsSync`
  // check-then-use TOCTOU race). ENOENT → no user file → write fresh.
  let existing: string | null
  try {
    existing = await readFile(headersPath, 'utf-8')
  } catch {
    existing = null
  }

  if (existing !== null) {
    // User already declares a policy for this asset prefix — don't override.
    if (existing.includes(marker)) return
    const sep = existing.endsWith('\n') ? '\n' : '\n\n'
    await writeFile(headersPath, existing + sep + block)
    return
  }
  await writeFile(headersPath, block)
}
