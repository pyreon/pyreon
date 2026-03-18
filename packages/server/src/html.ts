/**
 * HTML template processing for SSR/SSG.
 *
 * Templates use comment placeholders:
 *   <!--pyreon-head-->     — replaced with <head> tags (title, meta, link, etc.)
 *   <!--pyreon-app-->      — replaced with rendered application HTML
 *   <!--pyreon-scripts-->  — replaced with client entry script + inline loader data
 */

export const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--pyreon-head-->
</head>
<body>
  <div id="app"><!--pyreon-app--></div>
  <!--pyreon-scripts-->
</body>
</html>`

export interface TemplateData {
  head: string
  app: string
  scripts: string
}

/**
 * Pre-compiled template — splits the template string once so that
 * each request only concatenates 6 parts instead of scanning 3x with `.replace()`.
 */
export interface CompiledTemplate {
  /** [before-head, between-head-app, between-app-scripts, after-scripts] */
  parts: [string, string, string, string]
}

export function compileTemplate(template: string): CompiledTemplate {
  if (!template.includes("<!--pyreon-app-->")) {
    throw new Error("[pyreon/server] Template must contain <!--pyreon-app--> placeholder")
  }
  const [beforeHead, afterHead] = splitOnce(template, "<!--pyreon-head-->")
  const [betweenHeadApp, afterApp] = splitOnce(afterHead, "<!--pyreon-app-->")
  const [betweenAppScripts, afterScripts] = splitOnce(afterApp, "<!--pyreon-scripts-->")
  return { parts: [beforeHead, betweenHeadApp, betweenAppScripts, afterScripts] }
}

function splitOnce(str: string, delimiter: string): [string, string] {
  const idx = str.indexOf(delimiter)
  if (idx === -1) return [str, ""]
  return [str.slice(0, idx), str.slice(idx + delimiter.length)]
}

export function processTemplate(template: string, data: TemplateData): string {
  return template
    .replace("<!--pyreon-head-->", data.head)
    .replace("<!--pyreon-app-->", data.app)
    .replace("<!--pyreon-scripts-->", data.scripts)
}

/** Fast path using a pre-compiled template */
export function processCompiledTemplate(compiled: CompiledTemplate, data: TemplateData): string {
  const [p0, p1, p2, p3] = compiled.parts
  return p0 + data.head + p1 + data.app + p2 + data.scripts + p3
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
    parts.push(`<script>window.__PYREON_LOADER_DATA__=${json}</script>`)
  }

  parts.push(`<script type="module" src="${clientEntry}"></script>`)

  return parts.join("\n  ")
}

/** Pre-build the static client entry script tag (invariant across requests) */
export function buildClientEntryTag(clientEntry: string): string {
  return `<script type="module" src="${clientEntry}"></script>`
}

/** Fast path: build scripts with a pre-built client entry tag */
export function buildScriptsFast(
  clientEntryTag: string,
  loaderData: Record<string, unknown> | null,
): string {
  if (loaderData && Object.keys(loaderData).length > 0) {
    const json = JSON.stringify(loaderData).replace(/<\//g, "<\\/")
    return `<script>window.__PYREON_LOADER_DATA__=${json}</script>\n  ${clientEntryTag}`
  }
  return clientEntryTag
}
