/**
 * Adapter OUTPUT-PATH contract — the single source of truth for where
 * each deploy adapter stages its artifacts inside the build's `outDir`
 * (`dist/` by default; the zero SSR/SSG plugins invoke adapters with
 * `clientOutDir === outDir === distDir`).
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
   * Build Output API tree, staged INSIDE outDir (`dist/.vercel/output`).
   * NOTE (known limitation, tracked): Vercel only auto-detects
   * `.vercel/output` at the PROJECT root, so the scaffolded
   * `vercel.json` deploys `dist` statically (`outputDirectory: "dist"`)
   * and the SSR function inside `dist/.vercel/output` is not reachable
   * without a manual copy to the root. Fixing that requires the adapter
   * to learn the project root (an `AdapterBuildOptions` change).
   */
  outputDir: '.vercel/output',
})
