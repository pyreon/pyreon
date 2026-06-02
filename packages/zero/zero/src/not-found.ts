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

/**
 * Inject a `<meta name="robots" content="noindex, nofollow">` tag into
 * a rendered 404 HTML document IF no robots meta is already present.
 *
 * Why a framework-level inject rather than a `_404.tsx` template helper:
 * the framework KNOWS it's emitting a 404 — `render404Page()` and the
 * SSG plugin's per-locale `__renderNotFound` walker both go through
 * this boundary. The `<Meta>` component's default of `'index, follow'`
 * is correct for regular pages but actively wrong on a 404; the user
 * shouldn't have to remember to override it in every `_404.tsx`.
 *
 * **User override wins.** If the rendered head already contains ANY
 * `<meta name="robots">` (case-insensitive, single OR double quotes,
 * any attribute order), the document passes through unchanged. This
 * lets a sophisticated app emit `<Meta robots="noindex, nofollow,
 * noarchive">` and have it stick — the framework only fills in the
 * default when the user said nothing.
 *
 * **Defense-in-depth: idempotent.** Calling this on already-injected
 * HTML returns it verbatim (the regex matches our own inject).
 *
 * **Safe on fragment HTML.** When no `</head>` is found (e.g. body-only
 * fragments from a misconfigured template), returns the input unchanged
 * rather than emitting a stray `<meta>` outside any document structure.
 */
export function ensureNoindexMeta(html: string): string {
	if (ROBOTS_META_REGEX.test(html)) return html;
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
