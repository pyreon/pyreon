# @pyreon/playwright-config

Private, internal helpers for the repo's root-level `playwright.*.config.ts`
files. The Playwright sibling of `@pyreon/vitest-config` — one canonical
source for the boilerplate every e2e config otherwise duplicated
(`testDir`, `retries`, `use`, `reuseExistingServer`, and the
`bun run --filter=… dev -- --port … --strictPort` webServer template).

Not published.

## Usage

```ts
// playwright.config.ts
import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

export default definePlaywrightConfig({
  projects: [
    { name: 'playground', testMatch: /e2e\/reactivity\.spec\.ts$/, port: 5173 },
  ],
  webServer: [viteDevServer('@pyreon/example-playground', 5173)],
})
```

`definePlaywrightConfig` bakes the shared defaults; each config states only
what differs (projects + webServers). A project's `port` becomes its
`use.baseURL`. webServer entries get `reuseExistingServer: !process.env.CI`
+ a default `timeout` injected.

### Bespoke servers

For the few non-`vite dev` boots (build-then-serve SSG, `vite preview`,
`node …/vite`), pass a raw entry:

```ts
webServer: [
  {
    command:
      'bun run --filter=@pyreon/example-ssr-showcase build:i18n && bun scripts/serve-ssg.ts examples/ssr-showcase/dist 5199',
    port: 5199,
    timeout: 180_000,
  },
]
```

## Why a `default` exports condition

Playwright's config loader resolves imports via Node's CJS resolver — it
reads the `default` (not `import`) exports condition. The package therefore
exports `src/index.ts` under `types` / `bun` / `import` / `default` so it's
resolvable by Playwright, Vite, Bun, and `tsc` alike, with no build step
(Playwright transpiles the workspace `.ts` directly).
