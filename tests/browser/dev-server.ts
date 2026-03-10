/**
 * Dev server for Playwright browser tests.
 *
 * Bundles the Pyreon framework for the browser and serves test pages.
 * Each test navigates to "/" and uses the window.__PYREON__ global.
 */

import { join, resolve } from "node:path"
import type { BunPlugin } from "bun"

const ROOT = import.meta.dir
const PROJECT_ROOT = resolve(ROOT, "../..")

// Plugin that resolves @pyreon/* imports to their source entry points.
// Bun.build doesn't use the "bun" export condition from workspace package.json,
// so we manually rewrite them to packages/*/src/index.ts.
const pyreonResolvePlugin: BunPlugin = {
  name: "pyreon-resolve",
  setup(build) {
    build.onResolve({ filter: /^@pyreon\// }, (args) => {
      const pkg = args.path.replace("@pyreon/", "")
      return {
        path: resolve(PROJECT_ROOT, "packages", pkg, "src", "index.ts"),
      }
    })
  },
}

// Bundle Pyreon for browser consumption
const buildResult = await Bun.build({
  entrypoints: [join(ROOT, "pyreon-entry.ts")],
  target: "browser",
  minify: false,
  format: "esm",
  sourcemap: "inline",
  plugins: [pyreonResolvePlugin],
})

if (!buildResult.success) {
  console.error("Pyreon bundle build failed:")
  for (const log of buildResult.logs) {
    console.error(log)
  }
  process.exit(1)
}

const pyreonBundle = await buildResult.outputs[0].text()

const HTML_PAGE = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Pyreon Browser Tests</title></head>
<body>
  <div id="app"></div>
  <script type="module">${pyreonBundle}</script>
</body>
</html>`

const server = Bun.serve({
  port: 3799,
  fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/pyreon.js") {
      return new Response(pyreonBundle, {
        headers: { "Content-Type": "application/javascript" },
      })
    }

    // Serve the hydration test page with pre-rendered HTML
    if (url.pathname === "/hydration") {
      const ssrHtml = url.searchParams.get("html") ?? ""
      return new Response(
        `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Pyreon Hydration Test</title></head>
<body>
  <div id="app">${ssrHtml}</div>
  <script type="module">${pyreonBundle}</script>
</body>
</html>`,
        { headers: { "Content-Type": "text/html" } },
      )
    }

    // Default page
    return new Response(HTML_PAGE, {
      headers: { "Content-Type": "text/html" },
    })
  },
})

console.log(`Pyreon test server running on http://localhost:${server.port}`)
