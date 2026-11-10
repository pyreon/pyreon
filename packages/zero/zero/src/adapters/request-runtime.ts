/**
 * Request-target handling shared by every runner that turns a raw HTTP
 * request line into a URL: the node runner (`adapters/node.ts`), the deno /
 * bun static file servers, and zero's dev middleware (`vite-plugin.ts`).
 *
 * ## The contract
 *
 * The ORIGIN of a request comes from the transport and the `Host` header
 * (or trusted config); the request-target only ever contributes a PATH and a
 * QUERY. A request-target is NEVER resolved as a URL relative to a base:
 * `new URL(req.url, origin)` treats `//attacker.example/x` (and `/\attacker…`)
 * as a scheme-relative URL and `http://attacker.example/x` as an absolute
 * one, so the client picks the URL's origin. Server actions compare the
 * browser's `Origin` header against that origin (the CSRF baseline), so a
 * client-chosen origin turned the check into "Origin equals itself".
 *
 * Dotfile paths: the static servers never serve a path with a segment that
 * starts with `.` (`/.vite/manifest.json`, `/.env`, `/.git/…`), except the
 * standard `/.well-known/` directory. Such a request falls through to the
 * SSR handler (which answers 404 for an unknown route).
 */

/**
 * The request URL for a raw request-target, with the origin taken ONLY from
 * `origin` (`<proto>://<host>`). An origin-form target (`/path?q`) is appended
 * as-is (a leading `//` stays part of the PATH); an absolute-form target
 * (`http://host/path`) contributes only its path and query; anything else
 * (`*`, garbage) maps to `/`. Returns `null` when no valid URL results
 * (a malformed `Host`), which callers answer with 400.
 */
export function requestUrlFromTarget(target: string | undefined, origin: string): URL | null {
  let t = target || '/'
  if (t.charCodeAt(0) !== 47) {
    if (/^[a-z][a-z\d+.-]*:/i.test(t)) {
      try {
        const abs = new URL(t)
        t = abs.pathname.charCodeAt(0) === 47 ? abs.pathname + abs.search : '/'
      } catch {
        t = '/'
      }
    } else {
      t = '/'
    }
  }
  // The authority is the `Host` header: one carrying `/`, `?`, `#`, `@`, `\`
  // or whitespace would re-shape the URL (a path or userinfo in the origin).
  if (/[/?#@\\\s]/.test(origin.slice(origin.indexOf('//') + 2))) return null
  try {
    const url = new URL(origin + t)
    return url.origin === new URL(origin).origin ? url : null
  } catch {
    return null
  }
}

/**
 * Whether a URL pathname names a hidden file or directory (a segment that
 * starts with `.`, checked on both the raw and the percent-decoded path),
 * other than the top-level `/.well-known/`. Static servers skip such paths.
 */
export function isHiddenStaticPath(pathname: string): boolean {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // Malformed escapes: judge the raw path.
  }
  const segments = decoded.split(/[\\/]/)
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!
    if (s.charCodeAt(0) === 46 && !(i === 1 && s === '.well-known')) return true
  }
  return false
}

/**
 * Plain-JavaScript copies of {@link requestUrlFromTarget} and
 * {@link isHiddenStaticPath} for the emitted runners (they are generated
 * source, not bundled). Kept equivalent by a differential test that
 * evaluates this string against the TypeScript functions.
 */
export const REQUEST_RUNTIME = `function __pyreonRequestUrl(target, origin) {
  let t = target || "/"
  if (t.charCodeAt(0) !== 47) {
    if (/^[a-z][a-z\\d+.-]*:/i.test(t)) {
      try {
        const abs = new URL(t)
        t = abs.pathname.charCodeAt(0) === 47 ? abs.pathname + abs.search : '/'
      } catch {
        t = "/"
      }
    } else {
      t = "/"
    }
  }
  if (/[/?#@\\\\\\s]/.test(origin.slice(origin.indexOf("//") + 2))) return null
  try {
    const url = new URL(origin + t)
    return url.origin === new URL(origin).origin ? url : null
  } catch {
    return null
  }
}

function __pyreonIsHiddenPath(pathname) {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {}
  const segments = decoded.split(/[\\\\/]/)
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    if (s.charCodeAt(0) === 46 && !(i === 1 && s === ".well-known")) return true
  }
  return false
}
`
