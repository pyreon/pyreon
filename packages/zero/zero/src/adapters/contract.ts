/**
 * Adapter OUTPUT-PATH contract — the single source of truth for where
 * each deploy adapter stages its artifacts. Most segments are RELATIVE to
 * the build's `outDir` (`dist/` by default; the zero SSR/SSG plugins
 * invoke adapters with `clientOutDir === outDir === distDir`). The ONE
 * exception is the Vercel adapter, which — per Vercel's Build Output API
 * v3 — stages `.vercel/output` at the PROJECT ROOT (`options.projectRoot`,
 * a SIBLING of `outDir`), not inside `outDir`; see `VERCEL_ADAPTER_OUTPUT`.
 *
 * Consumers:
 *   - the adapters themselves (`node.ts` / `bun.ts` / `netlify.ts` /
 *     `cloudflare.ts` / `vercel.ts`) build every staging path from these
 *     constants, and
 *   - `@pyreon/create-zero`'s scaffolded deploy configs (Dockerfiles,
 *     `netlify.toml`, `wrangler.toml`, `vercel.json`) are locked against
 *     them by a contract test (`create-zero/src/tests/
 *     adapter-contract.test.ts`).
 *
 * HISTORY: the scaffolder's deploy configs hardcoded these paths
 * independently and drifted — the node/bun Dockerfiles ran
 * `dist/server.js` (a file NO adapter has ever emitted; the runners are
 * `dist/index.js` / `dist/index.ts`), and `netlify.toml` published
 * `dist` with functions at `dist/.netlify/functions` + a redirect to a
 * function named `server` while the adapter stages `dist/publish` +
 * `dist/netlify/functions` with a function named `ssr`. Every scaffolded
 * node/bun/netlify deploy was broken from inception. One shared module +
 * a structural test makes that drift impossible (the same one-source
 * lesson as `scripts/test-paths.ts`).
 *
 * These are RELATIVE segments under `outDir` — adapters `join()` them;
 * the scaffolder's configs prefix them with the app's `dist/`.
 */

/**
 * Staging subdir (under `outDir`) where the SSR plugin writes the EDGE server
 * bundle when an adapter needs one. Internal staging, not a deploy output:
 * every adapter's client stage preserves it so it never lands in a public
 * static dir.
 */
export const EDGE_SERVER_SUBDIR = 'server-edge'

/** node adapter (`nodeAdapter`) — standalone `node:http` runner. */
export const NODE_ADAPTER_OUTPUT = Object.freeze({
  /** Emitted runner: `node dist/index.js`. */
  runnerEntry: 'index.js',
  /** Staged clean copy of the client assets the runner serves. */
  clientDir: 'client',
  /** Server bundle dir (`entry-server.js` + `template.html`). */
  serverDir: 'server',
})

/** bun adapter (`bunAdapter`) — standalone `Bun.serve()` runner. */
export const BUN_ADAPTER_OUTPUT = Object.freeze({
  /** Emitted runner: `bun dist/index.ts`. */
  runnerEntry: 'index.ts',
  clientDir: 'client',
  serverDir: 'server',
})

/** deno adapter (`denoAdapter`) — `Deno.serve()` runner over the edge bundle. */
export const DENO_ADAPTER_OUTPUT = Object.freeze({
  /** Emitted runner: `deno run -A dist/main.js` (or `deno serve`-less Deploy entry). */
  runnerEntry: 'main.js',
  /** Staged clean copy of the client assets the runner serves. */
  clientDir: 'client',
  /**
   * The runner imports the EDGE server bundle in place — the web-worker build
   * with every dependency bundled and no `node:*` import (the SSR plugin
   * writes it to `EDGE_SERVER_SUBDIR`). The Node bundle is not used.
   */
  serverDir: EDGE_SERVER_SUBDIR,
})

/** netlify adapter (`netlifyAdapter`) — Netlify Functions v2. */
export const NETLIFY_ADAPTER_OUTPUT = Object.freeze({
  /** Static publish dir staged under outDir (SSR/ISR modes). */
  publishDir: 'publish',
  /** Functions dir staged under outDir (`ssr.mjs` + `_server/`). */
  functionsDir: 'netlify/functions',
  /** The SSR function's name — redirects target `/.netlify/functions/<name>`. */
  functionName: 'ssr',
  /** Server-bundle dir inside functionsDir. */
  serverDir: '_server',
  /**
   * Edge Functions dir staged under outDir — emitted only when an edge
   * function is (`netlifyAdapter({ edge: true })` or a route declaring
   * `export const runtime = 'edge'`); `netlify.toml` then gains
   * `edge_functions = "<this>"`.
   */
  edgeFunctionsDir: 'netlify/edge-functions',
  /** The edge function: `<edgeFunctionsDir>/<name>/<name>.js`. */
  edgeFunctionName: 'ssr-edge',
  /** Scheduled-function filename prefix: `<functionsDir>/<prefix><slug>.mjs`. */
  scheduledFunctionPrefix: 'cron-',
})

/** cloudflare adapter (`cloudflareAdapter`) — Cloudflare Pages + Functions. */
export const CLOUDFLARE_ADAPTER_OUTPUT = Object.freeze({
  /** Pages worker written at the outDir root. */
  workerFile: '_worker.js',
  /**
   * Pages routing config, written at the outDir root by the ADAPTER
   * (both SSR and SSG branches). Cloudflare Pages reads `_routes.json`
   * from the deploy OUTPUT directory (`pages_build_output_dir`), never
   * from the repo root — scaffolds must NOT ship their own copy.
   */
  routesFile: '_routes.json',
  /** Server-bundle dir staged under outDir. */
  serverDir: '_server',
})

/** vercel adapter (`vercelAdapter`) — Vercel Build Output API v3 shape. */
export const VERCEL_ADAPTER_OUTPUT = Object.freeze({
  /**
   * Build Output API v3 tree, staged at the PROJECT ROOT
   * (`<projectRoot>/.vercel/output`) — NOT inside `outDir`. Vercel only
   * auto-detects `.vercel/output` at the project root (it reads
   * `<projectRoot>/.vercel/output/{config.json,static/,functions/}` and
   * ignores anything under `outDir`), so the adapter uses
   * `AdapterBuildOptions.projectRoot` for BOTH build kinds:
   *   - SSR: `config.json` (`version: 3`) + `static/` (client assets) +
   *     `functions/ssr.func/{.vc-config.json,index.js}` (the SSR function).
   *   - SSG: `config.json` + `static/` (a copy of the prerendered dist);
   *     no functions.
   * With the tree at the root, Vercel deploys via the Build Output API and
   * the scaffolded `vercel.json`'s `outputDirectory` is only a fallback for
   * builds that run no adapter (e.g. SPA mode). This RELATIVE segment is
   * joined onto `projectRoot`, not `outDir`.
   */
  outputDir: '.vercel/output',
  /** The default SSR function: `functions/ssr.func`, routed as `/ssr`. */
  functionName: 'ssr',
  /** Routes declaring `runtime = 'edge'` (Node default): `functions/ssr-edge.func`. */
  edgeFunctionName: 'ssr-edge',
  /** Routes declaring `runtime = 'nodejs'` under `vercelAdapter({ runtime: 'edge' })`. */
  nodeFunctionName: 'ssr-node',
})

