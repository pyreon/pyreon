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
 *   explicitly public last-seen page offline),
 * - SPA: a failed navigation gets the precached app shell (any route loads
 *   offline); SSG: `pwa.offlineFallback` names a prerendered page for routes
 *   that were never prerendered or visited; SSR/ISR: the browser's offline error,
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
  /**
   * `mode: 'ssg'` only: the URL of a PRERENDERED page (e.g. `'/'`) whose HTML
   * the worker returns, as an app shell, for a navigation that fails offline
   * and is neither a page the visitor already saw nor a precached prerendered
   * page. The client router then takes over and renders whatever route matches
   * the address bar (a dynamic route with an un-prerendered param renders
   * client-side; an unknown path renders the app's 404). Pick a small page with
   * no per-route data. Without it such a navigation shows the browser's own
   * offline error. A build error in the SSR/ISR/SPA modes: SSR/ISR HTML is
   * per-request (nothing static to fall back to) and SPA already uses its
   * app shell.
   */
  offlineFallback?: string
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
    {
      start_url: withBase(base, ''),
      scope: withBase(base, ''),
      display: 'standalone',
      ...manifest,
    },
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
  /**
   * SPA output: precache the app shell (`index.html`) and answer every failed
   * navigation with it, so any route loads offline and the client router takes
   * over. (Under SPA there is no per-route HTML to precache.)
   */
  shell?: boolean
}

/**
 * Files under `distDir` the worker precaches, as `dist`-relative POSIX
 * paths (sorted). Hashed assets under `assetsDir` (minus source maps and
 * the per-route OG images — social cards are for crawlers, not offline
 * use), plus prerendered `*.html` when `includeHtml`. Internal artifacts
 * (`_*`, `404.html`, `server/`, the worker itself) are never listed.
 * @internal
 */
export async function collectPrecacheFiles(
  distDir: string,
  opts: PrecacheScanOptions,
): Promise<string[]> {
  const assetsRoot = `${opts.assetsDir.replace(/^\/+|\/+$/g, '')}/`
  const files: string[] = []
  for (const full of await walk(distDir)) {
    const rel = relative(distDir, full).split(sep).join('/')
    const top = rel.split('/')[0]!
    if (top.startsWith('_') || top.startsWith('.') || top === 'server' || rel === PWA_SW_FILE)
      continue
    if (rel.startsWith(assetsRoot)) {
      if (rel.endsWith('.map') || rel.startsWith(`${assetsRoot}og/`)) continue
      files.push(rel)
    } else if (opts.includeHtml && rel.endsWith('.html') && rel !== '404.html') {
      files.push(rel)
    } else if (opts.shell && rel === 'index.html') {
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
  /** SPA: answer failed navigations with this precached shell URL (dist-relative). */
  shell?: string | undefined
  /** SSG: answer unmatched failed navigations with this prerendered page URL. */
  offlineFallback?: string | undefined
}): string {
  const precacheUrls = params.precache.map((f) => withBase(params.base, f))
  const assetPrefix = withBase(params.base, `${params.assetsDir.replace(/^\/+|\/+$/g, '')}/`)
  const cfg = {
    precache: precacheUrls,
    version: params.version,
    prefix: params.cacheName,
    assetPrefix,
    skipWaiting: params.skipWaiting,
    shell: params.shell === undefined ? null : withBase(params.base, params.shell),
    fallback: params.offlineFallback === undefined ? null : params.offlineFallback,
  }
  return `// Generated by @pyreon/zero (pwa). Do not edit.
const CFG = ${JSON.stringify(cfg)};
const PRECACHE = CFG.prefix + "-precache-" + CFG.version;
// Separate the public-only store from workers that cached private HTML.
const RUNTIME = CFG.prefix + "-runtime-public-v1";

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
        .filter((k) => (k.startsWith(CFG.prefix + "-precache-") && k !== PRECACHE) || k === CFG.prefix + "-runtime")
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
  const cache = await caches.open(PRECACHE);
  for (const k of keys) {
    // ignoreVary: a precached asset's identity is its URL. Servers commonly
    // send "Vary: Origin", and a module-script request carries an Origin
    // header the install-time fetch did not — without this every precached
    // module chunk misses offline (ERR_FAILED) while the page itself loads.
    const hit = await cache.match(k, { ignoreVary: true });
    if (hit) return hit;
  }
  return undefined;
}

// Cache API does not enforce HTTP cache directives. Navigation HTML must
// explicitly opt in, and must not vary by cookies, auth or other user state.
function publicNavigation(res) {
  const directives = (res.headers.get("cache-control") || "").toLowerCase().split(",").map((s) => s.trim().split("=")[0]);
  const vary = (res.headers.get("vary") || "").toLowerCase().split(",").map((s) => s.trim());
  return res.ok && directives.includes("public") &&
    !directives.some((d) => ["private", "no-store", "no-cache"].includes(d)) &&
    !vary.some((v) => v && v !== "accept-encoding") &&
    (res.headers.get("content-type") || "").toLowerCase().startsWith("text/html") &&
    !res.headers.has("set-cookie") &&
    !(res.headers.get("content-security-policy") || "").includes("'nonce-");
}

function remember(event, req, res) {
  // Keep writes alive, but quota/storage failures must not break a response.
  const copy = res.clone();
  event.waitUntil(caches.open(RUNTIME).then((c) => c.put(req, copy)).catch(() => undefined));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Network-first: only explicitly public HTML is retained offline.
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (publicNavigation(res)) remember(event, req, res);
        return res;
      } catch (err) {
        const runtime = await caches.open(RUNTIME);
        const hit = await runtime.match(req) || await matchAny(pageCandidates(url));
        if (hit) return hit;
        // SPA: every route is the same shell. SSG: the configured offline page.
        const fallback = CFG.shell
          ? await matchAny([CFG.shell])
          : CFG.fallback ? await matchAny(pageCandidates(new URL(CFG.fallback, self.location.origin))) : undefined;
        if (fallback) return fallback;
        throw err;
      }
    })());
    return;
  }

  if (url.pathname.startsWith(CFG.assetPrefix)) {
    // Cache-first: a content-hashed URL never changes its bytes.
    event.respondWith((async () => {
      const runtime = await caches.open(RUNTIME);
      const hit = await runtime.match(req, { ignoreVary: true }) || await matchAny([req]);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) remember(event, req, res);
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
  if (config.offlineFallback !== undefined && !opts.includeHtml) {
    throw new Error(
      '[Pyreon] zero({ pwa: { offlineFallback } }) is only supported with mode: "ssg" — SSR/ISR pages are rendered per request and SPA already falls back to the app shell. Remove `offlineFallback`.',
    )
  }
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
    shell: opts.shell ? 'index.html' : undefined,
    offlineFallback: config.offlineFallback,
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
      this.emitFile({
        type: 'asset',
        fileName: PWA_MANIFEST_FILE,
        source: buildWebManifest(config.manifest, zeroBase),
      })
    },
    transformIndexHtml() {
      const tags: { tag: string; attrs: Record<string, string>; injectTo: 'head' }[] = [
        {
          tag: 'link',
          attrs: { rel: 'manifest', href: withBase(zeroBase, PWA_MANIFEST_FILE) },
          injectTo: 'head',
        },
      ]
      if (config.manifest.theme_color) {
        tags.push({
          tag: 'meta',
          attrs: { name: 'theme-color', content: config.manifest.theme_color },
          injectTo: 'head',
        })
      }
      return tags
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        if (isSsrBuild || zeroMode !== 'spa') return
        await writeServiceWorker(distDir, config, {
          base: zeroBase,
          assetsDir,
          includeHtml: false,
          shell: true,
        })
      },
    },
  }
}
