/**
 * Content types the generated standalone runners (node, deno) serve static
 * files with. Emitted INTO the runner source, so there is one table for both.
 *
 * Covers what lands in a client build: Vite's hashed output, and whatever the
 * user puts in `public/`. A `public/robots.txt` or `sitemap.xml` used to be
 * served as `application/octet-stream` (browsers download it; some crawlers
 * refuse it) because the table knew only the hashed-asset types.
 */
export const STATIC_MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
})
