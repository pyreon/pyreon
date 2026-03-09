/**
 * HTML template processing for SSR/SSG.
 *
 * Templates use comment placeholders:
 *   <!--nova-head-->     — replaced with <head> tags (title, meta, link, etc.)
 *   <!--nova-app-->      — replaced with rendered application HTML
 *   <!--nova-scripts-->  — replaced with client entry script + inline loader data
 */

export const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--nova-head-->
</head>
<body>
  <div id="app"><!--nova-app--></div>
  <!--nova-scripts-->
</body>
</html>`

export interface TemplateData {
  head: string
  app: string
  scripts: string
}

export function processTemplate(template: string, data: TemplateData): string {
  return template
    .replace("<!--nova-head-->", data.head)
    .replace("<!--nova-app-->", data.app)
    .replace("<!--nova-scripts-->", data.scripts)
}

/**
 * Build the script tags for client hydration.
 *
 * Emits:
 *   1. Inline script with serialized loader data (if any)
 *   2. Module script tag pointing to the client entry
 */
export function buildScripts(
  clientEntry: string,
  loaderData: Record<string, unknown> | null,
): string {
  const parts: string[] = []

  if (loaderData && Object.keys(loaderData).length > 0) {
    // Escape </script> inside JSON to prevent premature tag close
    const json = JSON.stringify(loaderData).replace(/<\//g, "<\\/")
    parts.push(`<script>window.__NOVA_LOADER_DATA__=${json}</script>`)
  }

  parts.push(`<script type="module" src="${clientEntry}"></script>`)

  return parts.join("\n  ")
}
