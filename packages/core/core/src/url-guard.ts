// URL-attribute injection guard — single source of truth shared by BOTH
// renderers: `@pyreon/runtime-dom`'s client `setStaticProp` + DOMParser
// sanitizer, AND `@pyreon/runtime-server`'s SSR `renderProp`. Keeping the
// logic in one place is deliberate: the placeholder-stripping bug
// (`data:image/*` allowed on the client but stripped from SSG static HTML)
// was caused by the two renderers carrying independent copies that drifted.
// Pure string logic, zero deps — runs identically in the browser and Node.

/** URL-bearing attributes guarded against `javascript:` / `data:` injection. */
export const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'data'])

/** Matches the `javascript:` / `data:` URI prefixes the guard rejects by default. */
export const UNSAFE_URL_RE = /^\s*(?:javascript|data):/i

// A `data:image/...` URI on an image-source attribute renders as a static,
// non-executing image — the framework's own imagePlugin ships exactly these as
// blur/color placeholders (`data:image/webp;base64,…`, `data:image/svg+xml,…`).
// Those contexts are safe, so the guard allows them while still blocking
// `data:text/html` on <iframe>/<object>/<embed>, `javascript:` everywhere, and
// scripted SVG.
const IMAGE_SRC_ATTRS = new Set(['src', 'srcset', 'poster'])
const IMAGE_CONTEXT_TAGS = new Set(['img', 'source', 'video'])
// Raster image data URIs can never carry executable content — always safe.
const SAFE_RASTER_DATA_RE =
  /^\s*data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)\s*[;,]/i
const SVG_DATA_RE = /^\s*data:image\/svg\+xml\s*[;,]/i
// SVG loaded via <img> is sandboxed (scripts don't run), but we still reject
// SVGs carrying <script> or on*= handlers — defense in depth, and safe if the
// URI ever reaches a script-executing context.
const SVG_SCRIPT_RE = /<\s*script\b|\son[a-z-]+\s*=/i

/**
 * True when `value` is an image `data:` URI on an image-source attribute
 * (`src` / `srcset` / `poster`) of an image-context element
 * (`<img>` / `<source>` / `<video>`) and therefore safe to write/emit despite
 * the guarded `data:` prefix.
 *
 * `tagName` is matched case-insensitively, so callers may pass either the DOM
 * `Element.tagName` (uppercase, `@pyreon/runtime-dom`) or a raw JSX tag string
 * (lowercase, `@pyreon/runtime-server`).
 *
 * Raster types (png/jpeg/webp/…) can't execute. SVG is allowed only when it
 * carries no `<script>` / `on*=` handlers (base64 and url-encoded payloads are
 * decoded and scanned; malformed payloads are treated as unsafe). Every other
 * `data:` URI — and any `data:` on a navigable/executing element (iframe,
 * object, anchor, …) — stays blocked.
 *
 * @internal Shared by `@pyreon/runtime-dom` + `@pyreon/runtime-server`.
 */
export function isSafeImageDataUri(tagName: string, key: string, value: string): boolean {
  if (!IMAGE_SRC_ATTRS.has(key) || !IMAGE_CONTEXT_TAGS.has(tagName.toLowerCase())) return false
  if (SAFE_RASTER_DATA_RE.test(value)) return true
  if (SVG_DATA_RE.test(value)) return !svgDataUriHasScript(value)
  return false
}

/** Decode an `image/svg+xml` data URI payload and test for executable content. */
function svgDataUriHasScript(value: string): boolean {
  const comma = value.indexOf(',')
  if (comma === -1) return true // malformed — treat as unsafe
  const isBase64 = /;base64/i.test(value.slice(0, comma))
  let payload = value.slice(comma + 1)
  if (isBase64) {
    try {
      payload = atob(payload)
    } catch {
      return true // undecodable base64 — treat as unsafe
    }
  } else {
    try {
      payload = decodeURIComponent(payload)
    } catch {
      // keep the raw (still-encoded) payload — the scan below runs on it as-is
    }
  }
  return SVG_SCRIPT_RE.test(payload)
}
