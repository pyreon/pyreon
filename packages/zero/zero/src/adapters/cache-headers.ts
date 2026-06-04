/**
 * The canonical `_headers` block (Netlify / Cloudflare Pages format) pinning
 * content-hashed assets under `/assets/` to a 1-year immutable cache — the same
 * scope `vercel.json` / `netlify.toml` already emit. Everything else is left to
 * the host's revalidating default: HTML must NEVER be immutable (it changes on
 * every deploy), and immutability is only safe for files Vite content-hashes,
 * which is exactly the `/assets/` directory.
 */
const ASSET_IMMUTABLE_BLOCK = `/assets/*
  Cache-Control: public, max-age=31536000, immutable
`

/**
 * Write (or augment) `<outDir>/_headers` with the asset-immutable rule.
 *
 * Respects a user-provided `_headers` (e.g. one copied from `public/_headers`
 * by Vite): if a `_headers` already exists AND already declares an `/assets/`
 * policy, it's left untouched (the user owns their asset caching); otherwise the
 * framework block is appended so user rules and the default coexist. A `_headers`
 * file is inert on hosts that don't read it (GitHub Pages, S3) and honored by
 * Cloudflare Pages + Netlify.
 */
export async function writeAssetCacheHeaders(outDir: string): Promise<void> {
  const { writeFile, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const headersPath = join(outDir, '_headers')

  // Read-then-act: the read IS the existence check (atomic — no `existsSync`
  // check-then-use TOCTOU race). ENOENT → no user file → write fresh.
  let existing: string | null
  try {
    existing = await readFile(headersPath, 'utf-8')
  } catch {
    existing = null
  }

  if (existing !== null) {
    // User already declares an /assets/ policy — don't double-declare or override.
    if (existing.includes('/assets/')) return
    const sep = existing.endsWith('\n') ? '\n' : '\n\n'
    await writeFile(headersPath, existing + sep + ASSET_IMMUTABLE_BLOCK)
    return
  }
  await writeFile(headersPath, ASSET_IMMUTABLE_BLOCK)
}
