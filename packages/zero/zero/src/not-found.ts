import type { ComponentFn } from "@pyreon/core";
import { h } from "@pyreon/core";
import { renderToString } from "@pyreon/runtime-server";

// ─── 404 Not Found rendering ────────────────────────────────────────────────
//
// Shared utility for rendering 404 pages in both dev (vite-plugin) and
// production (entry-server). Renders the notFoundComponent into HTML
// and wraps it in a minimal document if no template is provided.

const DEFAULT_404_BODY =
	"<h1>404 — Not Found</h1><p>The page you requested does not exist.</p>";

const NOINDEX_META = '<meta name="robots" content="noindex, nofollow">';

// Case-insensitive detector for an existing `<meta name="robots">` tag.
// Matches the WHATWG HTML serialization (attribute order, whitespace,
// single vs double quotes, optional self-close `/`) without being so
// permissive that it triggers on attribute names that merely contain
// the substring `robots` (e.g. a hypothetical `data-robots-config`).
//
// The pattern: `<meta` then ANY combination of attrs, with at least one
// being `name=` (case-insensitive) followed by `"robots"` (with optional
// whitespace + quote style). Anchored to `<meta` so it doesn't fire on
// link-rel-robots-txt or similar adjacent constructs.
const ROBOTS_META_REGEX = /<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>/i;

// Extracts the `content="…"` value from a single matched `<meta>` tag
// (case-insensitive, either quote style).
const ROBOTS_CONTENT_REGEX = /\bcontent\s*=\s*["']([^"']*)["']/i;

// A robots value already prevents indexing when it carries the `noindex`
// directive or the `none` shorthand (`none` ≡ `noindex, nofollow` per the
// robots spec). Tokens are split on `,`, trimmed, and matched exactly so
// `noindex` is never confused with an unrelated token.
function robotsPreventsIndexing(metaTag: string): boolean {
	const content = metaTag.match(ROBOTS_CONTENT_REGEX)?.[1];
	// No / empty `content` → treat as index-permitting (override to noindex).
	if (!content) return false;
	return content
		.split(',')
		.map((directive) => directive.trim().toLowerCase())
		.some((directive) => directive === 'noindex' || directive === 'none');
}

/**
 * Guarantee a rendered 404 HTML document carries a `noindex` robots meta.
 *
 * Why a framework-level enforce rather than a `_404.tsx` template helper:
 * the framework KNOWS it's emitting a 404 — `render404Page()` and the
 * SSG plugin's per-locale `__renderNotFound` walker both go through this
 * boundary. The `<Meta>` component's default of `'index, follow'` is
 * correct for regular pages but actively wrong on a 404; the user
 * shouldn't have to remember to override it in every `_404.tsx`.
 *
 * **A 404 is never indexable — so an index-permitting robots meta is
 * OVERRIDDEN, not respected.** If the rendered head already contains a
 * `<meta name="robots">` whose value permits indexing (the `<Meta>`
 * default `'index, follow'`, an explicit `'index, follow'`, or the `'all'`
 * shorthand), it is rewritten to `noindex, nofollow`. This closes the gap
 * where a `_404.tsx` using `<Meta>` silently shipped `index, follow`
 * because the component's default emitted a robots tag that the old
 * "bail if any robots meta exists" contract then passed through.
 *
 * **Deliberate non-indexing directives still win.** A value that already
 * carries `noindex` (e.g. `<Meta robots="noindex, nofollow, noarchive">`)
 * or `none` passes through UNCHANGED — the framework only corrects the
 * index-permitting case, never clobbers a sophisticated app's directive.
 * This also keeps the helper idempotent against its own injection.
 *
 * **Inject when absent.** When no robots meta is present, the default
 * `noindex, nofollow` tag is inserted before `</head>`.
 *
 * **Safe on fragment HTML.** When no robots meta is present AND no
 * `</head>` is found (e.g. body-only fragments from a misconfigured
 * template), returns the input unchanged rather than emitting a stray
 * `<meta>` outside any document structure.
 */
export function ensureNoindexMeta(html: string): string {
	const existing = html.match(ROBOTS_META_REGEX);
	if (existing) {
		// Deliberate noindex/none → leave untouched (also idempotent for
		// our own inject). Index-permitting → rewrite to the noindex tag.
		// `String#replace` with a string first arg replaces the literal
		// matched tag exactly once — no regex re-interpretation.
		if (robotsPreventsIndexing(existing[0])) return html;
		return html.replace(existing[0], NOINDEX_META);
	}
	const headCloseMatch = html.match(/<\/head\s*>/i);
	if (!headCloseMatch || headCloseMatch.index === undefined) return html;
	const idx = headCloseMatch.index;
	return html.slice(0, idx) + `  ${NOINDEX_META}\n  ` + html.slice(idx);
}

/**
 * Render a 404 component to a full HTML string.
 * If no component is provided, returns a default 404 page.
 *
 * The framework injects `<meta name="robots" content="noindex, nofollow">`
 * into the rendered head when no robots meta is already present — see
 * `ensureNoindexMeta` for the contract (user override wins; idempotent;
 * safe on fragments).
 */
export async function render404Page(
	component: ComponentFn | undefined,
	template?: string,
): Promise<string> {
	let body: string;
	if (component) {
		body = await renderToString(h(component, null));
	} else {
		body = DEFAULT_404_BODY;
	}

	let html: string;
	if (template?.includes("<!--pyreon-app-->")) {
		html = template.replace("<!--pyreon-app-->", body);
	} else {
		html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 — Not Found</title>
</head>
<body>
  ${body}
</body>
</html>`;
	}

	return ensureNoindexMeta(html);
}
