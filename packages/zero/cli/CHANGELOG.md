# zero-cli

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.26.2
  - @pyreon/cli@0.26.2
  - @pyreon/create-zero@0.26.2
  - @pyreon/zero@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [[`1779b84`](https://github.com/pyreon/pyreon/commit/1779b84c2719c1e0745ce2630d8940ff3bc25ed0)]:
  - @pyreon/create-zero@0.26.1
  - @pyreon/server@0.26.1
  - @pyreon/cli@0.26.1
  - @pyreon/zero@0.26.1

## 0.26.0

### Patch Changes

- [#946](https://github.com/pyreon/pyreon/pull/946) [`1385728`](https://github.com/pyreon/pyreon/commit/1385728abb19c6a51498df9dec7fc4b51136a115) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero-cli): `zero preview` now serves built output (no more HTTP 404 on the homepage)

  `zero build` writes the client bundle to `dist/client/` (see [packages/zero/cli/src/commands/build.ts](packages/zero/cli/src/commands/build.ts)), but `zero preview` was wrapping `vite preview` with no `outDir` override — so vite served from `dist/` (which only contains the `client/`, `server/`, `output/` subdirectories). Every scaffolded SSR / SSG / SPA project returned HTTP 404 from `bun run preview` on the homepage. The build artefact was correct; the preview command just looked in the wrong place.

  `zero preview` now detects `dist/client/` and passes it as `build.outDir` to vite preview. The 30 prior published `@pyreon/zero-cli` releases all had this bug; this lands as part of the next 0.x.

  **DX improvements bundled in `@pyreon/create-zero`:**

  - Every template (`app`, `blog`, `dashboard`) now ships a `README.md` with project-name substitution, getting-started commands, per-template "what's in this project" section, scripts table, deploy notes, and doc links. Previously only the `monorepo` template had a README — the flat templates landed with no documentation at the project root.

  - `scripts/scaffold-smoke.ts` gained a `previewSmoke?:` hook that spawns `bun run preview` against the built output, waits for the local URL, fetches the homepage, and asserts HTTP 200 + non-empty HTML body. Wired into 3 representative cells (app+vercel, blog+cloudflare, dashboard+vercel+full integrations). Bisect-verified: reverting the `zero preview` fix fails `cpa-smoke-app-vercel` with `preview HTTP 404 from http://localhost:NNNN (expected 200)`; restored → passes.

- Updated dependencies [[`cbef2e7`](https://github.com/pyreon/pyreon/commit/cbef2e7b016da3ac515099f9f403807baeeb4589), [`5602146`](https://github.com/pyreon/pyreon/commit/5602146b7ccac45d3d9ee0b752b00a5f702821e9), [`95663b9`](https://github.com/pyreon/pyreon/commit/95663b943be3f02f61fce7b7532df8c2efa153b4), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`c2d0f34`](https://github.com/pyreon/pyreon/commit/c2d0f34578624f7284842f4f8558e613e969053d), [`537f0a5`](https://github.com/pyreon/pyreon/commit/537f0a5e326a6cc37dd95dd978b474c9a51867e6), [`5ee742a`](https://github.com/pyreon/pyreon/commit/5ee742aa8a83e66664220494dc0e20a3bb16d8b7), [`f911be8`](https://github.com/pyreon/pyreon/commit/f911be8f4ac99f3bcecb35d93d765b8fb1ae4ca0), [`4204f49`](https://github.com/pyreon/pyreon/commit/4204f49f1dad0997b77fd6a9a90d047f8621010d), [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c), [`1385728`](https://github.com/pyreon/pyreon/commit/1385728abb19c6a51498df9dec7fc4b51136a115), [`52c1298`](https://github.com/pyreon/pyreon/commit/52c1298e0a2be04bd62b35f43416ecb9bb16b451), [`9ef3922`](https://github.com/pyreon/pyreon/commit/9ef3922a1849aa36aa012284aae6922cdf1715cd), [`a27d7db`](https://github.com/pyreon/pyreon/commit/a27d7db43509c02b29ec59af18e5da18d7d57d41), [`3ebd25f`](https://github.com/pyreon/pyreon/commit/3ebd25fbdd06f8d9f473e8a9281bce27effca209), [`eaa36d7`](https://github.com/pyreon/pyreon/commit/eaa36d720210e8bed9676692fcb819c063dd91c6), [`c19018d`](https://github.com/pyreon/pyreon/commit/c19018ddad0577c82caaa63414ceea6e792d5244)]:
  - @pyreon/zero@1.0.0
  - @pyreon/create-zero@1.0.0
  - @pyreon/server@1.0.0
  - @pyreon/cli@1.0.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/server@0.25.1
  - @pyreon/cli@0.25.1
  - @pyreon/create-zero@0.25.1
  - @pyreon/zero@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`4d5d5ec`](https://github.com/pyreon/pyreon/commit/4d5d5ec334b0916e42cfe73d2100596920478024), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/cli@0.25.0
  - @pyreon/server@0.25.0
  - @pyreon/zero@0.25.0
  - @pyreon/create-zero@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.24.6
  - @pyreon/cli@0.24.6
  - @pyreon/create-zero@0.24.6
  - @pyreon/zero@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.24.5
  - @pyreon/cli@0.24.5
  - @pyreon/create-zero@0.24.5
  - @pyreon/zero@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.24.4
  - @pyreon/cli@0.24.4
  - @pyreon/create-zero@0.24.4
  - @pyreon/zero@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.24.3
  - @pyreon/cli@0.24.3
  - @pyreon/create-zero@0.24.3
  - @pyreon/zero@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.24.2
  - @pyreon/cli@0.24.2
  - @pyreon/create-zero@0.24.2
  - @pyreon/zero@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies [[`48ac675`](https://github.com/pyreon/pyreon/commit/48ac6758f266843d9b8db679cf19cee29b3a309d)]:
  - @pyreon/zero@0.24.1
  - @pyreon/server@0.24.1
  - @pyreon/cli@0.24.1
  - @pyreon/create-zero@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/cli@0.24.0
  - @pyreon/zero@0.24.0
  - @pyreon/server@0.24.0
  - @pyreon/create-zero@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`51b81f0`](https://github.com/pyreon/pyreon/commit/51b81f0d92bdbc9c4fd6acc3b5b9b0a8043078a9), [`1bb5988`](https://github.com/pyreon/pyreon/commit/1bb598872a7178a5c20af257c49e62a6ae82bf36), [`5934570`](https://github.com/pyreon/pyreon/commit/59345703bcf7a4d946ace655a69514ee438e9006), [`6454cb7`](https://github.com/pyreon/pyreon/commit/6454cb794bb82db11e7842cb4a62a3765e3dd3ac), [`97b0e19`](https://github.com/pyreon/pyreon/commit/97b0e19533056e9cb3d9997401effc79b0f6760b), [`f833a99`](https://github.com/pyreon/pyreon/commit/f833a997bbc04aa5ba94d0d5dd334628871aaa9a), [`e1939bd`](https://github.com/pyreon/pyreon/commit/e1939bd49d185c6522b61f06c5a27cf2b91392a4), [`0036dfc`](https://github.com/pyreon/pyreon/commit/0036dfcb58a0ad33bce8118a3d927f1c09c63b27), [`36767f6`](https://github.com/pyreon/pyreon/commit/36767f69887f8da39c2a14c57da2ca59f3780b3d), [`c459330`](https://github.com/pyreon/pyreon/commit/c459330e248397438892c9a8c1817bd75cfb8b3e), [`2976aa8`](https://github.com/pyreon/pyreon/commit/2976aa84213b479b4d045a83143b3a4a3d89aedf), [`802e88b`](https://github.com/pyreon/pyreon/commit/802e88b3d132d5c73901571c805e8987eec4612a), [`8e81b4a`](https://github.com/pyreon/pyreon/commit/8e81b4a268507b9c9981ba47087c70b7f36a4fc1), [`f0a33da`](https://github.com/pyreon/pyreon/commit/f0a33daff7826cd12bcbc5e6ae96ca161723d89a), [`7632934`](https://github.com/pyreon/pyreon/commit/763293492a26d48e4a7b1b28e42a519677702b35), [`6eb1f57`](https://github.com/pyreon/pyreon/commit/6eb1f5745dde032dd94b91965f5299ea54ab5a63), [`1a23287`](https://github.com/pyreon/pyreon/commit/1a23287ebd180aeae14a31eca21fd490145b989e)]:
  - @pyreon/zero@0.23.0
  - @pyreon/server@0.23.0
  - @pyreon/cli@0.23.0
  - @pyreon/create-zero@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.22.0
  - @pyreon/zero@0.22.0
  - @pyreon/cli@0.22.0
  - @pyreon/create-zero@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [[`95ff116`](https://github.com/pyreon/pyreon/commit/95ff1160e43adceb024c0a897353fb675d20c7bf), [`82b2e3b`](https://github.com/pyreon/pyreon/commit/82b2e3b983d97039999da8d5a1518a387ad683a3), [`9204800`](https://github.com/pyreon/pyreon/commit/9204800d79b5c8167ff176e78ba5f324f43de9e2)]:
  - @pyreon/zero@0.21.0
  - @pyreon/server@0.21.0
  - @pyreon/cli@0.21.0
  - @pyreon/create-zero@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`abda63c`](https://github.com/pyreon/pyreon/commit/abda63c541343cfe967a5c70ce223a6675ceaa8e), [`cc3003c`](https://github.com/pyreon/pyreon/commit/cc3003c3e7ab2e8b9649c3aa6b5e001506916a0d), [`cc3003c`](https://github.com/pyreon/pyreon/commit/cc3003c3e7ab2e8b9649c3aa6b5e001506916a0d)]:
  - @pyreon/cli@0.20.0
  - @pyreon/zero@0.20.0
  - @pyreon/server@0.20.0
  - @pyreon/create-zero@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`dcd2136`](https://github.com/pyreon/pyreon/commit/dcd21360cca7528cbfe87020428394a11aa30ea0), [`c8d6f27`](https://github.com/pyreon/pyreon/commit/c8d6f27b8d207b25a2f378eedc21af11adfe3653), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`0b3e2b3`](https://github.com/pyreon/pyreon/commit/0b3e2b387d4cd6debe6a466877d2100a96ceceb9), [`078b1e7`](https://github.com/pyreon/pyreon/commit/078b1e72343828b2d73f97c03e0b5b0f335fe979), [`e8e95bc`](https://github.com/pyreon/pyreon/commit/e8e95bc2d6785d397f4b8f85039ce76c2a7f6cea), [`5d40b3f`](https://github.com/pyreon/pyreon/commit/5d40b3f70ba50ecd5adbff505db45e38975f61a8), [`7eaa4f0`](https://github.com/pyreon/pyreon/commit/7eaa4f03c6a9e0d48f38647127e1fd5998dc09d1), [`5d40b3f`](https://github.com/pyreon/pyreon/commit/5d40b3f70ba50ecd5adbff505db45e38975f61a8)]:
  - @pyreon/server@0.19.0
  - @pyreon/zero@0.19.0
  - @pyreon/cli@0.19.0
  - @pyreon/create-zero@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/cli@0.18.0
  - @pyreon/zero@0.18.0
  - @pyreon/server@0.18.0
  - @pyreon/create-zero@0.18.0

## 0.17.0

### Patch Changes

- [#580](https://github.com/pyreon/pyreon/pull/580) [`816753b`](https://github.com/pyreon/pyreon/commit/816753b0d10cb55ce41e6ad64aff18bd41e925d6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Honour `zero({ port })` from `vite.config.ts` in `zero dev` / `zero preview`.

  Pre-fix the CLI always bound the CAC-baked default 3000 (or whatever `--port` passed) — `zero({ port: 8080 })` in `vite.config.ts` was silently ignored when the user ran `zero dev`. Post-fix precedence is `CLI flag > zero({ port }) > 3000 default`:

  ```ts
  // vite.config.ts
  plugins: [pyreon(), zero({ port: 8080 })];
  ```

  ```sh
  zero dev               # → 8080 (reads vite.config.ts)
  zero dev --port 5191   # → 5191 (CLI override)
  ```

  Two changes:

  1. **Removed the CAC `default: 3000`** on the `--port` flag. The default made `options.port` always-defined, which meant the config-file fallback could never fire.
  2. **New `loadZeroConfigPort(root)`** in `packages/zero/cli/src/commands/load-config.ts` — loads `vite.config.ts` via `vite.loadConfigFromFile`, walks the plugin list, finds the zero plugin instance, reads its captured `ZeroConfig.port`. Falls back to `undefined` gracefully when no zero plugin is present (consumer is using `pyreon()` only) so the framework's 3000 default kicks in.

  Composes with PR [#582](https://github.com/pyreon/pyreon/issues/582)'s plugin-side argv detection: `vite --port 517N` (plain Vite invocation) is handled by the plugin; `zero dev --port 5191` (CLI invocation) is handled here. Both paths converge on the same precedence model.

  Bisect-verified: pre-fix `zero dev` in a project with `zero({ port: 8080 })` in vite.config.ts binds 3000 (CAC default wins, configPort never consulted). Post-fix binds 8080. `--port 5191` still wins both before and after.

- Updated dependencies [[`c79ade7`](https://github.com/pyreon/pyreon/commit/c79ade7d8384ff7a0afe1a972db2db8c8fd18c88), [`6960087`](https://github.com/pyreon/pyreon/commit/6960087fe09f984636c0ab0ef440280744f19a67), [`acaa216`](https://github.com/pyreon/pyreon/commit/acaa216fb312e8da8f87125b9961834195c8e970), [`af6faf7`](https://github.com/pyreon/pyreon/commit/af6faf78ce02dae1973ed845459bf714adad4fac), [`53b264b`](https://github.com/pyreon/pyreon/commit/53b264b87897a35d8418ad37ce85c805a5b7874f)]:
  - @pyreon/cli@0.17.0
  - @pyreon/zero@0.17.0
  - @pyreon/server@0.17.0
  - @pyreon/create-zero@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`f82584b`](https://github.com/pyreon/pyreon/commit/f82584b3dfb1362d376065354d023647fdbdfa02)]:
  - @pyreon/zero@0.16.0
  - @pyreon/server@0.16.0
  - @pyreon/cli@0.16.0
  - @pyreon/create-zero@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`f3c3644`](https://github.com/pyreon/pyreon/commit/f3c3644499b89d4c72644ed8fad112e15fb0f7b0), [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d)]:
  - @pyreon/create-zero@0.14.0
  - @pyreon/cli@0.14.0
  - @pyreon/zero@0.14.0
  - @pyreon/server@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.13.0
  - @pyreon/cli@0.13.0
  - @pyreon/create-zero@0.13.0
  - @pyreon/zero@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/zero@0.12.15
  - @pyreon/server@0.12.15
  - @pyreon/cli@0.12.15
  - @pyreon/create-zero@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies [[`779f61f`](https://github.com/pyreon/pyreon/commit/779f61f99e1f403485871c1848fc82489d20960f), [`290ea64`](https://github.com/pyreon/pyreon/commit/290ea64ee90b5e749008d2b437084fc001ad24f1)]:
  - @pyreon/server@0.12.14
  - @pyreon/zero@0.12.14
  - @pyreon/cli@0.12.14
  - @pyreon/create-zero@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.12.13
  - @pyreon/cli@0.12.13
  - @pyreon/create-zero@0.12.13
  - @pyreon/zero@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.12.12
  - @pyreon/cli@0.12.12
  - @pyreon/create-zero@0.12.12
  - @pyreon/zero@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.12.11
  - @pyreon/cli@0.12.11
  - @pyreon/create-zero@0.12.11
  - @pyreon/zero@0.12.11

## 0.5.0

### Minor Changes

- Bump ecosystem to latest, UI system ^0.3.0, Dependabot, template fixes
  - Bump UI system to ^0.3.0, core ^0.7.12, fundamentals ^0.10.0
  - Add Dependabot for automated dependency updates
  - Fix template for @pyreon/store 0.10.0 API (useAppStore returns { store })
  - Use `latest` in static template to prevent version drift
  - Fix camelCase JSX attributes in templates (onClick, srcSet)

### Patch Changes

- Updated dependencies []:
  - @pyreon/zero@0.5.0
  - @pyreon/create-zero@0.5.0

## 0.4.1

### Patch Changes

- Pin GitHub Actions to SHA hashes, add security policy

- Updated dependencies []:
  - @pyreon/zero@0.4.1
  - @pyreon/create-zero@0.4.1

## 0.4.0

### Minor Changes

- Bump to Pyreon 0.7.5 core + 0.9.0 fundamentals, add state-tree, strict types
  - Bump core @pyreon/\* to ^0.7.5, fundamentals to ^0.9.0, UI system ^0.2.0
  - Use @pyreon/typescript preset for strict type checking
  - Add @pyreon/state-tree to meta re-exports
  - Fix all noUncheckedIndexedAccess and exactOptionalPropertyTypes errors
  - Add VNodeChild return types to JSX components
  - Fix integration tests with pyreon() compiler plugin
  - Bump TypeScript to 6.0.2, vitest to 4.1.1
  - Add explicit jsxImportSource + customConditions to root tsconfig (bun compat)

### Patch Changes

- Updated dependencies []:
  - @pyreon/zero@0.4.0
  - @pyreon/create-zero@0.4.0

## 0.3.0

### Minor Changes

- Bump Pyreon ecosystem to 0.7.0 core, add charts/hotkeys/storage/flow/code
  - Bump all core @pyreon/\* deps to ^0.7.0
  - Bump fundamentals to ^0.6.0, UI system to ^0.2.0
  - Add @pyreon/charts, @pyreon/hotkeys, @pyreon/storage to meta re-exports
  - Add @pyreon/flow and @pyreon/code to meta re-exports
  - Add package strategy choice in create-zero (meta barrel vs individual packages)
  - Add charts, hotkeys, storage, flow, code as create-zero feature options
  - Use pinned version ranges instead of 'latest' in scaffolded projects
  - Fix signal setter API for Pyreon 0.7.0 (count.set/count.update)
  - Document provide() helper and onCleanup() in anti-patterns
  - Add Pyreon MCP server config (.mcp.json)

### Patch Changes

- Updated dependencies []:
  - @pyreon/zero@0.3.0
  - @pyreon/create-zero@0.3.0

## 0.2.0

### Minor Changes

- ## @pyreon/zero

  ### New Features

  - **API routes** — file-based `.ts` handlers in `src/routes/api/` with HTTP method exports (GET, POST, PUT, DELETE)
  - **Server actions** — `defineAction()` with automatic client/server boundary detection (direct execution on server, fetch on client)
  - **Per-route middleware** — route files export `middleware` dispatched via `virtual:zero/route-middleware`
  - **Per-route renderMode** — `renderMode` export wired into route `meta.renderMode`
  - **CORS middleware** — configurable origins (string/array/function), credentials, preflight
  - **Rate limiting** — in-memory per-client limiting with `X-RateLimit-*` headers
  - **Compression** — gzip/deflate via native `CompressionStream`
  - **Testing utilities** — `createTestContext`, `testMiddleware`, `createTestApiServer`, `createMockHandler`
  - **Dev error overlay** — styled HTML overlay with source-mapped stack traces for SSR errors
  - **Dev route table** — `zero dev` prints page + API routes on startup

  ### Improvements

  - Bumped all @pyreon/\* core deps to ^0.5.4
  - Added `./actions`, `./api-routes`, `./cors`, `./rate-limit`, `./compression`, `./testing` subpath exports
  - Fixed static adapter build skip for SSG mode
  - 238 unit tests + 11 integration tests (boot real Vite dev server)

  ## @pyreon/zero-cli

  ### New Commands

  - `zero doctor` — detect React patterns (proxies @pyreon/cli)
  - `zero context` — generate AI project context
  - `zero create <name>` — scaffold a new project

  ### Improvements

  - Dev server prints route table on startup (page routes + API routes)

  ## @pyreon/create-zero

  ### New Features

  - **Interactive scaffolding** with @clack/prompts — pick rendering mode, features, AI toolchain
  - Generates customized package.json, vite.config.ts, entry files based on selections
  - AI toolchain opt-in: .mcp.json, CLAUDE.md, doctor scripts

  ## @pyreon/meta

  ### New Packages

  - `@pyreon/machine` — reactive state machines (`createMachine`)
  - `@pyreon/permissions` — reactive permissions (`createPermissions`, `usePermissions`)

  ### Updates

  - All fundamentals: query ^0.5.0, virtual ^0.5.0
  - All UI system: ^0.1.1 (styler, hooks, elements, coolgrid, kinetic, etc.)
  - 75 export verification tests

### Patch Changes

- Updated dependencies []:
  - @pyreon/zero@0.2.0
  - @pyreon/create-zero@0.2.0

## 0.2.0

### Minor Changes

- Initial public release under @pyreon scope.

### Patch Changes

- Updated dependencies []:
  - @pyreon/zero@0.2.0

## 0.1.0

### Minor Changes

- Initial public release of Pyreon Zero meta-framework with SSR/SSG/ISR/SPA modes, file-system routing, optimized components (Image, Link, Script), theme system, font optimization, SEO utilities, cache middleware, and Node/Bun/static deployment adapters.

### Patch Changes

- Updated dependencies []:
  - @pyreon/zero@0.1.0
