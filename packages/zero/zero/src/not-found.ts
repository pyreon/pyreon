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

/**
 * Render a 404 component to a full HTML string.
 * If no component is provided, returns a default 404 page.
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

	if (template?.includes("<!--pyreon-app-->")) {
		return template.replace("<!--pyreon-app-->", body);
	}

	return `<!DOCTYPE html>
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
