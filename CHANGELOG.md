# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **@pyreon/manifest** (private) — Internal type package providing `PackageManifest`, `ApiEntry`, and `defineManifest()`. Foundation for T2.1 single-source doc manifest pipeline. No external consumers in this release; follow-up PRs add the generator and migrate individual packages.
- **`scripts/gen-docs.ts` + `bun run gen-docs`** — Walks every `packages/<category>/<pkg>/src/manifest.ts` and regenerates `llms.txt` bullets + `llms-full.txt` per-package sections in place. `--check` flag exits non-zero when files are out of sync (local equivalent of the CI `Docs Sync` gate). First real consumer: `@pyreon/flow` — both its `llms.txt` entry and `llms-full.txt` section now generate from the manifest. Contributors editing migrated packages edit the manifest, not the generated output.
- **`PackageManifest.longExample` + `title` optional fields** — `longExample` provides a narrative TypeScript code block that the `llms-full.txt` renderer emits verbatim (use for packages whose idiomatic usage is best shown end-to-end rather than as disjoint per-API snippets). `title` provides a short section header; falls back to `tagline` when omitted. `renderLlmsFullSection(manifest)` composes them into the full section shape: `## name — title`, description prose, code block, `> **<Label>**: ...` blockquotes.
- **`Gotcha` type** — Gotcha entries accept two forms: bare `string` (renders as `> **Note**: <text>`) or `{ label, note }` (renders as `> **<label>**: <note>`). The labeled form preserves the descriptive-heading specificity the hand-written `llms-full.txt` used ("Note on JSX generics", "Peer dep rationale", "Migration v1→v2"). `renderLlmsTxtLine` teaser always uses the `note` text, never the label — the label is a heading cue for llms-full blockquotes, not for the one-line bullet. Non-breaking: `gotchas: string[]` still compiles.
- **`description` field now rendered** — previously present on `PackageManifest` but unused by any generator output. `renderLlmsFullSection` now emits it as a prose paragraph between the header and the code block. Empty, whitespace-only, or missing descriptions suppress the paragraph entirely — no silent fallback. Authors who want prose set `description` to a real sentence; everyone else gets `## header → code block` directly.
- **CI `Docs Sync` job** — Runs `bun run gen-docs --check` and fails on drift. `--check` flag prints a unified diff (LCS-based) of exactly what would change, so reviewers see the fix without re-running the generator locally.
- **`@pyreon/query` manifest migration** — `@pyreon/query` now ships a `src/manifest.ts`; both its `llms.txt` bullet and `llms-full.txt` section regenerate from it. The previously-split hand-written `llms-full.txt` sections ("TanStack Query Adapter" + "useSSE (Server-Sent Events)") are consolidated into one with a single end-to-end `longExample` covering `useQuery` / `useMutation` / `useSubscription` / `useSSE` / `useSuspenseQuery` / `useInfiniteQuery`. Inline-snapshot test (`manifest-snapshot.test.ts`) mirrors the flow reference so manifest edits surface locally before the CI `Docs Sync` gate.
- **`@pyreon/form` manifest migration** — `@pyreon/form` now ships a `src/manifest.ts`; both its `llms.txt` bullet and `llms-full.txt` section regenerate from it. End-to-end `longExample` covers `useForm` / `useField` / `useFieldArray` / `useWatch` / `useFormState` / `FormProvider` + `useFormContext`. Five structured gotchas: the `validateOn: 'blur'` default, independent per-field signals, stable-key contract for `useFieldArray`, version-tracked async validators + `debounceMs`, and server-error flows via `setFieldError` / `setErrors`. Inline-snapshot test locks the rendered output; CLAUDE.md `### @pyreon/form` section expanded with the same foot-guns.
- **`@pyreon/hooks` manifest migration** — `@pyreon/hooks` now ships a `src/manifest.ts`; both its `llms.txt` bullet and `llms-full.txt` section regenerate from it. The package previously had only a `llms.txt` bullet (no `llms-full` section); migration introduces the section in the appropriate position alongside other fundamentals. End-to-end `longExample` walks 35 hooks across six categories (state / DOM / responsive / timing / interaction / composition); 14 `api[]` entries cover the highest-leverage hooks (`useControllableState`, `useEventListener`, `useClickOutside`, `useElementSize`, `useFocusTrap`, `useBreakpoint`, `useDebouncedValue`, `useClipboard`, `useDialog`, `useTimeAgo`, `useInfiniteScroll`, `useMergedRef`, `useUpdateEffect`, `useIsomorphicLayoutEffect`); five structured gotchas: `useControllableState` as the canonical pattern, signal-not-plain return shapes, SSR-by-construction guarantee, never-`addEventListener`-directly rule, and `useBreakpoint` (theme-driven) vs `useMediaQuery` (raw) distinction. Inline-snapshot test locks the rendered output; CLAUDE.md `### @pyreon/hooks` section rewritten to mirror the new categorization.
- **MCP api-reference generation (T2.5.1, flow-first)** — `bun run gen-docs` now also regenerates `packages/tools/mcp/src/api-reference.ts` between `// <gen-docs:api-reference:start @pyreon/<name>>` / `// <gen-docs:api-reference:end @pyreon/<name>>` marker pairs. Migration is opt-in per package: a region-wrapped package gets its entries generated from the manifest's `api[]` (`signature` → `signature`, `example` → `example`, `summary` → `notes`, `mistakes[]` → `- item` bulleted string); a package without markers stays hand-written. Two new exports from `@pyreon/manifest`: `renderApiReferenceEntries(manifest)` returns the MCP record shape for programmatic use; `renderApiReferenceBlock(manifest)` returns the source-code block the generator slots between markers. `@pyreon/flow` is the first package to flip — its `api[]` is enriched to MCP density (8 entries: `createFlow`, `useFlow`, `Flow`, `Background`, `Controls`, `MiniMap`, `Handle`, `Panel`; each with a 2-3 sentence `summary` that becomes MCP `notes` + a per-API `mistakes` catalog). The previous hand-written flow block (`createFlow` + `useFlow` only) is replaced by the strict superset — every child component and every foot-gun is now documented by the same manifest that drives `llms.txt` / `llms-full.txt`. CI `Docs Sync` job guards three generated files instead of two.
- **`@pyreon/query` MCP flip (T2.5.1)** — `@pyreon/query`'s manifest `api[]` enriched to MCP density (16 entries, up from 2 hand-written). Summaries expanded to 2-3 sentences with architectural rationale; `mistakes[]` added to all flagship entries (`useQuery`: 5, `useSubscription`: 3, `QueryClientProvider`: 3, `useMutation`: 3, `useSSE`: 2, `QuerySuspense`: 2, `useSuspenseQuery`: 2, `useInfiniteQuery`: 2, `useQueries`: 1, `useQueryClient`: 1). Region markers wrap the query block; orphaned `query/useSSE` section removed (consolidated into the main region). Second package fully on the T2.5.1 pipeline after flow.

### Changed (internal convention)

- **Manifests now live at `packages/<category>/<pkg>/src/manifest.ts`** (previously at package root). Matches each package's `rootDir: "./src"` tsconfig constraint — `tsc --noEmit` now type-checks manifests uniformly with the rest of the package sources, and test files importing a manifest stay inside rootDir. No API change; the generator walks the new location and the integration test iterates it.

### Security

- **@pyreon/runtime-server** — `<For>` SSR key markers (`<!--k:KEY-->`) now URL-encode keys and replace every `-` with `%2D` so user-controlled keys can never form `-->` and break out of the HTML comment. Previously, a key of `'--><script>…</script><!--'` from untrusted data (DB, URL params, user input) produced executable markup when the browser parsed the SSR output. The fix ships with a symmetric `decodeKeyFromMarker` helper for future hydration or devtools consumers.
- **@pyreon/runtime-server** — Dev-mode warning when `vnode.type` (tag name) contains characters that would break HTML structure (`<`, `>`, spaces, etc.). The framework does not HTML-escape tag names (matches React/Vue/Solid) — responsibility is on the caller — but the warning surfaces the mistake before it reaches production.

### Changed (Breaking)

- **@pyreon/core** — `RefProp<T>` narrowed from `Ref<T> | RefCallback<T> | ((el: T) => void)` to `Ref<T> | RefCallback<T>`. The mount-only `(el: T) => void` arm lied to consumers: since PR #233 the runtime always invokes callback refs with `null` on unmount, so the narrow type (which rejected `null`) silently produced runtime bugs. Migration: change `ref={(el: HTMLDivElement) => ...}` handlers to `ref={(el: HTMLDivElement | null) => ...}` and handle the null case (null means unmount). Alternatively, use an object `Ref<T>` and read `ref.current`.

### Fixed

- **@pyreon/runtime-dom** — Reactive `style` object now removes stale keys when they disappear between renders. `{ color, fontSize }` → `{ color }` previously left `fontSize` on the element; now the key is removed via `el.style.removeProperty`. Matches React/Vue/Solid behavior.
- **@pyreon/runtime-dom** — Callback refs now receive `null` on unmount (matches React/Solid/Vue `RefCallback<T>` shape). Previously only object refs had `.current` nulled; function refs were called on mount but never on unmount, silently leaking resources held in user closures (observers, event listeners, DOM refs).
- **@pyreon/runtime-dom** — `Transition`/`TransitionGroup` 5s safety timer is now cleared when `transitionend` fires normally. Previously each completed transition leaked one pending 5s timer; heavy animations accumulated 100s of timer refs + closures.
- **@pyreon/core** — `mergeProps` now forces `configurable: true` on copied property descriptors. Without this, a getter with unset `configurable` (default `false`) caused `TypeError: Cannot redefine property` when a later source overrode that key.
- **@pyreon/core** — `splitProps` and `mergeProps` now preserve symbol-keyed properties via `Reflect.ownKeys`. Framework brands (`REACTIVE_PROP`, `PROPS_SIGNAL`) were previously dropped on split and merge.
- **@pyreon/fundamentals/storage** — Cross-tab `storage` event listener now refcounts active subscribers and detaches when the count hits zero. Previously the listener attached on first `useStorage()` and stayed for the app lifetime, holding closures over the key registry.
- **@pyreon/fundamentals/flow** — Added `useFlow(config)` — component-scoped wrapper around `createFlow` that auto-disposes on unmount.

## [0.1.1] - 2026-03-15

### Added

- **@pyreon/reactivity** — Signal-based fine-grained reactivity: `signal`, `computed`, `effect`, `batch`, `createSelector`, `createStore`, `createResource`
- **@pyreon/core** — Component model with `h()`, JSX runtime, `Fragment`, `For`, `Show`, `Portal`, `Suspense`, `ErrorBoundary`, `lazy`, context, lifecycle hooks
- **@pyreon/runtime-dom** — DOM renderer: `mount`, `hydrateRoot`, `Transition`, `TransitionGroup`, `KeepAlive`, configurable HTML sanitization
- **@pyreon/runtime-server** — SSR primitives: `renderToString`, `renderToStream` with Suspense streaming
- **@pyreon/compiler** — JSX transform with `shouldWrap` optimization and static node hoisting
- **@pyreon/router** — Client-side router: hash/history modes, nested routes, navigation guards, data loaders, link prefetching, scroll restoration, typed params
- **@pyreon/head** — Document head management: `useHead`, `HeadProvider`, `renderWithHead` for SSR
- **@pyreon/server** — SSR framework: `createHandler`, `prerender` (SSG), `island()` architecture with load/idle/visible/media/never hydration strategies
- **@pyreon/vite-plugin** — Vite integration: JSX transform, `.pyreon` file support, HMR with signal state preservation
- **@pyreon/react-compat** — React API shims: `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`, `lazy`, `Suspense`, `memo`, `createContext`
- **@pyreon/vue-compat** — Vue 3 Composition API shims
- **@pyreon/solid-compat** — SolidJS API shims
- **@pyreon/preact-compat** — Preact API shims
