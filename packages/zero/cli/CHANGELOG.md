# zero-cli

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
