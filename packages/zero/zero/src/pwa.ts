/**
 * PWA support — `zero({ pwa })`.
 *
 * - Emits `manifest.webmanifest` from config and links it (+ `theme-color`)
 *   into every page's `<head>`.
 * - Generates `sw.js` AFTER the output is final (post-prerender, BEFORE the
 *   deploy adapter stages `dist/`), precaching exactly the files that were
 *   emitted: every content-hashed asset under `<base><assetsDir>/` and, for
 *   `mode: 'ssg'`, every prerendered HTML page.
 *
 * Runtime strategy baked into the worker:
 * - navigations → NETWORK-FIRST (fresh HTML online; the precached /
 *   last-seen page offline),
 * - same-origin GETs under the hashed-asset prefix → CACHE-FIRST (a hashed
 *   URL is immutable by construction),
 * - everything else → untouched (the browser's normal fetch).
 * - updates: a new worker WAITS by default (no mid-session swap of the asset
 *   set under a running page). `skipWaiting: true` opts into immediate
 *   activation; otherwise `registerServiceWorker({ onUpdate })` lets the app
 *   ask the user and then activate.
 *
 * The worker is served with `max-age=0, must-revalidate` by the node/bun
 * adapters (never immutable — the SW script is the update channel); the
 * platform adapters only mark `<base><assetsDir>/*` immutable.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'
import { writeFileAtomic } from './ssr-build-shared'

/** A web app manifest icon. */
export interface PwaManifestIcon {
  src: string
  sizes: string
  type?: string
  purpose?: 'any' | 'maskable' | 'monochrome' | 'any maskable'
}

/** The subset of the W3C web app manifest zero writes verbatim. */
export interface PwaManifest {
  name: string
  short_name?: string
  description?: string
  /** Default: the app base (`/`). */
  start_url?: string
  /** Default: the app base (`/`). */
  scope?: string
  /** Default: `'standalone'`. */
  display?: 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser'
  theme_color?: string
  background_color?: string
  lang?: string
  orientation?: 'any' | 'portrait' | 'landscape'
  icons?: PwaManifestIcon[]
}

/** `zero({ pwa })` configuration. */
export interface PwaConfig {
  /** Web app manifest content (written to `manifest.webmanifest`). */
  manifest: PwaManifest
  /**
   * Activate a new service worker immediately (`skipWaiting` +
   * `clients.claim`). Default `false`: the new worker waits until every tab
   * of the old version closes — or until the app calls the `activate()`
   * handed to `registerServiceWorker({ onUpdate })`. Opting in means a
   * running page can have its asset cache swapped underneath it.
   */
  skipWaiting?: boolean
  /** Cache-name prefix. Default `'pyreon'`. */
  cacheName?: string
}

/** Filename of the generated worker, at the app base. */
export const PWA_SW_FILE = 'sw.js'
/** Filename of the generated manifest, at the app base. */
export const PWA_MANIFEST_FILE = 'manifest.webmanifest'

function withBase(base: string, path: string): string {
  const b = base.endsWith('/') ? base : `${base}/`
  return `${b}${path.replace(/^\/+/, '')}`
}

/**
 * Build the manifest JSON (defaults: `start_url`/`scope` = base,
 * `display: 'standalone'`).
 * @internal
 */
export function buildWebManifest(manifest: PwaManifest, base = '/'): string {
  return `${JSON.stringify(
    { start_url: withBase(base, ''), scope: withBase(base, ''), display: 'standalone', ...manifest },
    null,
    2,
  )}\n`
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(full)))
    else if (e.isFile()) out.push(full)
  }
  return out
}

/** Options for {@link collectPrecacheFiles}. */
export interface PrecacheScanOptions {
  base: string
  assetsDir: string
  /** Include prerendered HTML pages (`mode: 'ssg'`). */
  includeHtml: boolean
}

/**
 * Files under `distDir` the worker precaches, as `dist`-relative POSIX
 * paths (sorted). Hashed assets under `assetsDir` (minus source maps and
 * the per-route OG images — social cards are for crawlers, not offline
 * use), plus prerendered `*.html` when `includeHtml`. Internal artifacts
 * (`_*`, `404.html`, `server/`, the worker itself) are never listed.
 * @internal
 */
export async function collectPrecacheFiles(distDir: string, opts: PrecacheScanOptions): Promise<string[]> {
  const assetsRoot = `${opts.assetsDir.replace(/^\/+|\/+$/g, '')}/`
  const files: string[] = []
  for (const full of await walk(distDir)) {
    const rel = relative(distDir, full).split(sep).join('/')
    const top = rel.split('/')[0]!
    if (top.startsWith('_') || top.startsWith('.') || top === 'server' || rel === PWA_SW_FILE) continue
    if (rel.startsWith(assetsRoot)) {
      if (rel.endsWith('.map') || rel.startsWith(`${assetsRoot}og/`)) continue
      files.push(rel)
    } else if (opts.includeHtml && rel.endsWith('.html') && rel !== '404.html') {
      files.push(rel)
    }
  }
  return files.sort()
}

/**
 * Generate the service worker source for a precache list.
 * @internal Exported for testing.
 */
export function buildServiceWorker(params: {
  precache: string[]
  version: string
  base: string
  assetsDir: string
  cacheName: string
  skipWaiting: boolean
}): string {
  const precacheUrls = params.precache.map((f) => withBase(params.base, f))
  const assetPrefix = withBase(params.base, `${params.assetsDir.replace(/^\/+|\/+$/g, '')}/`)
  const cfg = {
    precache: precacheUrls,
    version: params.version,
    prefix: params.cacheName,
    assetPrefix,
    skipWaiting: params.skipWaiting,
  }
  return `// Generated by @pyreon/zero (pwa). Do not edit.
const CFG = ${JSON.stringify(cfg)};
const PRECACHE = CFG.prefix + "-precache-" + CFG.version;
const RUNTIME = CFG.prefix + "-runtime";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(CFG.precache))
      .then(() => { if (CFG.skipWaiting) return self.skipWaiting(); }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith(CFG.prefix + "-precache-") && k !== PRECACHE)
        .map((k) => caches.delete(k))))
      .then(() => { if (CFG.skipWaiting) return self.clients.claim(); }),
  );
});

// Opt-in activation from the page (registerServiceWorker's onUpdate).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function pageCandidates(url) {
  const p = url.pathname;
  if (p.endsWith("/")) return [p, p + "index.html"];
  return [p, p + "/index.html", p + ".html"];
}

async function matchAny(keys) {
  for (const k of keys) {
    const hit = await caches.match(k);
    if (hit) return hit;
  }
  return undefined;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Network-first: fresh HTML when online, cached copy offline.
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, copy));
        }
        return res;
      } catch (err) {
        const hit = await matchAny(pageCandidates(url));
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  if (url.pathname.startsWith(CFG.assetPrefix)) {
    // Cache-first: a content-hashed URL never changes its bytes.
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        caches.open(RUNTIME).then((c) => c.put(req, copy));
      }
      return res;
    })());
  }
});
`
}

/**
 * Generate + write `sw.js` into a FINISHED `distDir`. Called by the SSG and
 * SSR post-steps right before the deploy adapter stages the output, so the
 * precache list is exactly what ships.
 * @internal
 */
export async function writeServiceWorker(
  distDir: string,
  config: PwaConfig,
  opts: PrecacheScanOptions,
): Promise<string[]> {
  const files = await collectPrecacheFiles(distDir, opts)
  const hash = createHash('sha256')
  for (const f of files) {
    hash.update(f)
    hash.update(await readFile(join(distDir, f)))
  }
  const sw = buildServiceWorker({
    precache: files,
    version: hash.digest('hex').slice(0, 12),
    base: opts.base,
    assetsDir: opts.assetsDir,
    cacheName: config.cacheName ?? 'pyreon',
    skipWaiting: config.skipWaiting === true,
  })
  await writeFileAtomic(join(distDir, PWA_SW_FILE), sw)
  return files
}

/**
 * Vite plugin half of `zero({ pwa })`: emits the manifest and links it into
 * the HTML. The worker itself is written by the build post-step (see
 * {@link writeServiceWorker}); for `mode: 'spa'` (no post-step) this plugin
 * writes it at `closeBundle`.
 * @internal Wired by `zero({ pwa })`.
 */
export function pwaPlugin(config: PwaConfig, zeroMode: string | undefined, zeroBase = '/'): Plugin {
  let distDir = ''
  let assetsDir = 'assets'
  let isSsrBuild = false
  return {
    name: 'pyreon-zero-pwa',
    apply: 'build',
    configResolved(resolved) {
      distDir = join(resolved.root, resolved.build.outDir)
      assetsDir = resolved.build.assetsDir
      isSsrBuild = Boolean(resolved.build.ssr)
    },
    generateBundle() {
      if (isSsrBuild) return
      this.emitFile({ type: 'asset', fileName: PWA_MANIFEST_FILE, source: buildWebManifest(config.manifest, zeroBase) })
    },
    transformIndexHtml() {
      const tags: { tag: string; attrs: Record<string, string>; injectTo: 'head' }[] = [
        { tag: 'link', attrs: { rel: 'manifest', href: withBase(zeroBase, PWA_MANIFEST_FILE) }, injectTo: 'head' },
      ]
      if (config.manifest.theme_color) {
        tags.push({ tag: 'meta', attrs: { name: 'theme-color', content: config.manifest.theme_color }, injectTo: 'head' })
      }
      return tags
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        if (isSsrBuild || zeroMode !== 'spa') return
        await writeServiceWorker(distDir, config, { base: zeroBase, assetsDir, includeHtml: false })
      },
    },
  }
}
