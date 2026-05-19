# @pyreon/zero

## 0.20.0

### Patch Changes

- [#655](https://github.com/pyreon/pyreon/pull/655) [`cc3003c`](https://github.com/pyreon/pyreon/commit/cc3003c3e7ab2e8b9649c3aa6b5e001506916a0d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `faviconPlugin`: (1) fail the production build loudly when `sharp` is missing instead of silently shipping zero favicons; (2) cache-bust injected favicon `<link>` hrefs with a content-hash `?v=` query so a changed icon is actually re-downloaded by returning visitors.

  Previously, if a `source` was configured but `sharp` wasn't installed, the plugin emitted a single swallow-able `console.warn` and generated nothing — `vite build` "succeeded" and the deployed site had **no favicons at all**, with no signal. That's the footgun.

  Now: **dev** keeps the soft one-time warning (favicons just don't appear locally — iteration isn't blocked). A **production `vite build`** with a configured `source` and `sharp` missing is a **hard, actionable error** (`this.error` in `generateBundle`) — the build aborts with the install command, the source path, and the opt-out. To intentionally build without favicons, remove `faviconPlugin()`.

  Bisect-proven via real `vite build`:

  - `sharp` missing → build aborts with the actionable message, **no `dist`** (won't silently ship faviconless).
  - `sharp` installed → build succeeds; all 8 assets (`favicon.ico/.svg`, 16/32 png, apple-touch-icon, icon-192/512, `site.webmanifest`) emitted **and** every `<head>` tag injected (`icon` svg+png, `apple-touch-icon`, `manifest`, `theme-color`).

  **Cache-busting (same PR):** browsers cache favicons extremely aggressively, so a changed icon was never re-fetched by returning visitors (stable URLs, no hash). The injected `<link>` hrefs now carry a `?v=<hash>` derived from the source file content (FNV-1a) — same bytes → identical query (no cache churn), changed bytes → new query → browser re-downloads. The dev middleware strips the query before name-matching (dev serves fresh anyway). Theme-reactive favicons are unaffected — the light/dark swap toggles the `media` attribute, not `href`, so it's orthogonal. Documented caveat: the bare `/favicon.ico` convention request (no `<link>`) and the `site.webmanifest`'s internal icon entries keep stable URLs (host cache headers / re-resolved on PWA reinstall). Proven: real 3-build stable→change→revert; bisect-verified (stamp removed → 0 stamped links); pure unit test `favicon-version.test.ts` locks the hash contract.

  Docs: new **Favicons** section in `docs/docs/zero.md` (one-source → full set + auto-injected head tags; `sharp` requirement + the dev-warn vs build-fail contract; cache-busting + caveats). No API change.

- [#655](https://github.com/pyreon/pyreon/pull/655) [`cc3003c`](https://github.com/pyreon/pyreon/commit/cc3003c3e7ab2e8b9649c3aa6b5e001506916a0d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `imagePlugin`: resolve `?optimize` / `?component` imports importer-relative + alias-aware (the way Vite resolves `?url`).

  `resolveId` embedded the raw, unresolved import id into the virtual id, so `load()` had to guess the path with cwd/`public` string math. Two documented patterns were broken (reported on bokisch.com, `@pyreon/zero@0.19.0`):

  - `import x from './img.png?optimize'` — `load()` resolved `./img.png` against **cwd** (project root), not the **importer's** directory → `ENOENT` for the exact src-tree pattern the JSDoc advertises. (`?url` worked because Vite resolves it itself.)
  - `import x from '~/assets/img.png?optimize'` (alias) — arrived already-absolute, then `join(root,'public',absPath)` **doubled** the path → `ENOENT`.

  Only an image physically in `public/` imported as `/foo.png?optimize` worked.

  Fix: `resolveId(id, importer)` now resolves the bare specifier via `this.resolve(bare, importer, { skipSelf: true })` (importer-relative + alias + extension resolution, identical to `?url`) and carries the **absolute** path through the virtual id. `load()` trusts an existing absolute path and only falls back to `<root>/public/…` for an unresolved leading-slash web path (`/foo.png?optimize`, where `this.resolve` returns null) — so that case keeps working. The same fix covers the SVG `?component` branch (same bug class).

  Regression test `image-plugin-resolve.test.ts` (sharp-free): asserts the resolveId contract for relative + alias + public-path, and exercises `load()` end-to-end through the `?component` branch. Bisect-verified: reverting `resolveId` to the raw-id form fails 3/4 (the relative, alias, and load cases); restored → 4/4.

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`2f38584`](https://github.com/pyreon/pyreon/commit/2f3858453c00e901b134dd4c15dad1eb3f793189), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7), [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f), [`e348599`](https://github.com/pyreon/pyreon/commit/e3485990cb52c414efb4217d40d3ed24e9c461b7)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/runtime-dom@0.20.0
  - @pyreon/vite-plugin@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/head@0.20.0
  - @pyreon/router@0.20.0
  - @pyreon/runtime-server@0.20.0
  - @pyreon/server@0.20.0
  - @pyreon/meta@0.20.0

## 0.19.0

### Minor Changes

- [#595](https://github.com/pyreon/pyreon/pull/595) [`0b3e2b3`](https://github.com/pyreon/pyreon/commit/0b3e2b387d4cd6debe6a466877d2100a96ceceb9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `imagePlugin` — implement the `'color'` placeholder strategy + add per-format quality. Closes a typed-but-unimplemented bug.

  **Closed bug (the `audit-types` class):** `PlaceholderStrategy` typed `'dominant-color'` from the plugin's inception but no code path ever implemented it — the CDN, dev, and build paths each open-coded `generateBlurPlaceholder`, so `placeholder: 'dominant-color'` silently produced a blur and `placeholder: 'none'` was silently ignored in build mode (only the CDN path honored it). All three paths now route through one `generatePlaceholder` dispatcher:

  - `'blur'` (default, unchanged) — downscaled + blurred WebP base64
  - `'color'` — sharp `.stats().dominant` → ~200-byte flat-fill SVG data URI (instant paint, zero layout shift, constant size regardless of source complexity)
  - `'dominant-color'` — **deprecated alias of `'color'`**, normalized via `normalizePlaceholder`
  - `'none'` — now honored in every path, not just CDN

  **Better API — per-format quality.** `quality` now accepts a per-format map in addition to a single number:

  ```ts
  imagePlugin({ formats: ["avif", "webp"], quality: { avif: 55, webp: 75 } });
  ```

  AVIF reaches WebP-equivalent perceived quality at a much lower number, so one flat value either over-spends bytes on AVIF or under-delivers on WebP. Formats omitted from the map fall back to 80. A bare number still works unchanged (backward-compatible). Resolved once into a per-format lookup (`resolveQuality`) threaded through the CDN / dev / build paths.

  Backward-compatible: default placeholder stays `'blur'`, default quality stays `80`, the `placeholder` string contract is unchanged so `<Image>` consumes every strategy identically. `generatePlaceholder` / `resolveQuality` / `normalizePlaceholder` are `@internal` exports for unit testing (19 specs, including the bisect-locking `'none' produces no placeholder` regression that fails against the pre-dispatcher build path).

  ThumbHash placeholders, rich import queries (`?inline` / `?url` / `?meta`), and a wasm sharp-fallback are deliberately deferred to follow-up PRs.

- [#607](https://github.com/pyreon/pyreon/pull/607) [`5d40b3f`](https://github.com/pyreon/pyreon/commit/5d40b3f70ba50ecd5adbff505db45e38975f61a8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Icon>` + `createIcon` — renders a FULL loaded SVG (Image/Link/Script family).

  `<Icon>` does **not** synthesize its own `<svg>` around hand-authored `<path>`
  children. You load a complete svg (it already contains the `<svg>` root) and
  Icon makes it container-sizable + theme-aware. Two source props:

  - `as` — an imported SVG **component** (`import X from './x.svg?component'`).
    Rendered **directly, no host wrapper**; svg attributes forward. Recommended.
  - `svg` — the raw `<svg>…</svg>` **markup string**
    (`import x from './x.svg?raw'`). Inlined via a single `<span>` host (a markup
    string can't mount without a parent — this one host is unavoidable).

  ```tsx
  import { Icon, createIcon } from '@pyreon/zero'
  import Check from './check.svg?component'
  import checkRaw from './check.svg?raw'

  <span style="width:2rem"><Icon as={Check} /></span>      // no wrapper
  <span style="width:2rem"><Icon svg={checkRaw} /></span>  // one <span> host

  export const Star = createIcon(Check)      // component → rendered directly
  export const Tick = createIcon(checkRaw)   // raw string → inlined
  ```

  Container-fill defaults (`fill="currentColor"`,
  `display:block;width:100%;height:100%`) spread-overridable; no fixed size (the
  consumer's wrapper sizes it); `fill="currentColor"` themes via CSS `color`.
  Two layers (mirrors `createLink`/`Link`, `createImage`/`Image`):
  `createIcon(source)` per-glyph factory + `Icon` one-off. Intentionally **no
  `useIcon` hook** — an icon has no composable behaviour. New exports: `Icon`,
  `createIcon`, `IconProps` (extends `SvgAttributes`), `SvgComponent`.
  Backward-compatible; no existing API changed.

  Verification: real-`h()` happy-dom mount tests in
  `packages/zero/zero/src/tests/icon.test.ts` (component form renders direct / no
  host, raw form inlines via `<span>`, defaults + prop override, `createIcon`
  both source kinds, no-source → null); manifest entries (`Icon`, `createIcon`) +
  regenerated MCP api-reference; snapshot count 25 → 27.

- [#609](https://github.com/pyreon/pyreon/pull/609) [`7eaa4f0`](https://github.com/pyreon/pyreon/commit/7eaa4f03c6a9e0d48f38647127e1fd5998dc09d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `iconsPlugin` named multi-sets — per-set typed components, no `IconName` clash.

  Builds on `iconsPlugin` (single-set). New `sets` form:

  ```ts
  iconsPlugin({
    sets: {
      ui: { dir: "./src/icons/ui" },
      brand: { dir: "./src/icons/brand", mode: "image" },
    },
  });
  ```

  ```tsx
  import { UiIcon, BrandIcon } from './icons.gen'
  <UiIcon name="arrow-left" />     // typed UiIconName
  <BrandIcon name="logo-mark" />   // typed BrandIconName — independent union
  ```

  One generated file, one `createNamedIcon` import, a strictly-typed component
  PER set under **namespaced** names so two sets never clash: `ui` →
  `<UiIcon>` + `type UiIconName`, `brand` → `<BrandIcon>` + `type
BrandIconName`. Per-set binding prefixes (`ui_check` / `brand_check`) keep two
  sets sharing a glyph filename collision-free. `mode` is per-set (a colorful
  brand set can be `image` while the system set stays `inline`).

  `dir` and `sets` are mutually exclusive — the plugin throws `[Pyreon]
iconsPlugin: provide EXACTLY ONE of dir or sets` at config time if both or
  neither is given. The dev watcher watches every set's folder; regeneration is
  still idempotent. New exports: `IconSetConfig`, `NamedSetInput`,
  `generateNamedIconSetsSource`, `componentNameFromSetKey` (server entry);
  `IconsPluginConfig.dir` is now optional alongside the new `sets` field.
  Backward-compatible — the single-`dir` form is unchanged.

  **Not in this PR (explicit follow-up):** monorepo package-sourced sets +
  copy-to-public for `mode: 'image'` assets (Vite `emitFile` / stable-URL
  contract — its own design).

  Verification: pure-generator unit tests (`src/tests/icons-plugin.test.ts` —
  `componentNameFromSetKey` PascalCase + sanitize, `generateNamedIconSetsSource`
  namespaced-per-set + one shared import + no bare `Icon`/`IconName` + per-set
  binding-prefix collision-freedom, `iconsPlugin` dir/sets XOR throw + both
  accept-forms); manifest `iconsPlugin` entry updated for the multi-set form +
  regenerated MCP api-reference; CLAUDE.md updated. typecheck 0, lint 0,
  gen-docs --check clean.

- [#607](https://github.com/pyreon/pyreon/pull/607) [`5d40b3f`](https://github.com/pyreon/pyreon/commit/5d40b3f70ba50ecd5adbff505db45e38975f61a8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `iconsPlugin` + `createNamedIcon` — point at a folder of SVGs, get a strictly-typed `<Icon name="…" />`.

  `iconsPlugin({ dir })` (from `@pyreon/zero/server`) scans `*.svg`, derives a
  kebab `name` from each filename, and writes a gitignored generated
  `icons.gen.tsx` that exports a strictly-typed `<Icon>`. Add an svg → the `name`
  union widens; remove one → an invalid `name` fails typecheck. Regenerates on
  add/unlink in dev (idempotent — never rewrites identical content).

  ```ts
  // vite.config.ts
  import { iconsPlugin } from "@pyreon/zero/server";
  plugins: [iconsPlugin({ dir: "./src/icons" })];
  ```

  ```tsx
  // app — autocompletes, rejects typos, real go-to-definition:
  import { Icon } from "./icons.gen";
  <span style="width:2rem">
    <Icon name="check-circle" />
  </span>;
  ```

  The generated file calls `createNamedIcon(REGISTRY)`, so `keyof typeof
REGISTRY` IS the type surface — zero per-app wiring. It writes a **real file**
  (not a virtual module) deliberately: the published `@pyreon/zero` can't
  `import` a plugin virtual module (Rolldown resolves static imports before
  plugin `resolveId` — the same constraint that makes islands need
  `hydrateIslandsAuto(registry)` with an explicit import).

  Two render modes per the colorful-vs-system split:

  - `mode: 'inline'` (default) — **system icons**. Each svg inlined as `?raw`
    markup via `Icon`; `currentColor`-themeable, recolor via CSS `color`.
  - `mode: 'image'` — **colorful / brand icons**. Each svg emitted as a static
    asset, rendered `<img>`. NO mutation, original colors preserved.

  `createNamedIcon<R>(registry, { mode? })` is the exported runtime half (typed
  by `keyof R`) — normally called by the generated file, callable directly for a
  hand-maintained set. New exports: `iconsPlugin`, `iconNameFromFile`,
  `scanIconDir`, `generateIconSetSource`, `IconsPluginConfig` (server entry);
  `createNamedIcon`, `IconMode`, `NamedIconProps` (client entry). Builds on the
  `Icon` / `createIcon` leaf; backward-compatible, no existing API changed.

  **Not in this PR (explicit follow-up):** named multi-sets (per-set typed
  `<UiIcon>` / `<BrandIcon>`, no `IconName` clash) + monorepo package-sourced
  sets + copy-to-public for `mode: 'image'` assets.

  Verification: pure scanner/generator unit tests
  (`src/tests/icons-plugin.test.ts` — `iconNameFromFile` kebab cases,
  `scanIconDir` filter/sort/missing-dir, `generateIconSetSource` inline vs image

  - binding-collision guard + empty set) and real-`h()` happy-dom mount tests for
    `createNamedIcon` both modes (`src/tests/icon.test.ts`); manifest entries
    (`iconsPlugin`, `createNamedIcon`) + regenerated MCP api-reference; snapshot
    count 27 → 29.

### Patch Changes

- [#612](https://github.com/pyreon/pyreon/pull/612) [`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Security / memory-leak / correctness hardening sweep across core, fundamentals, and zero. 12 source-grounded defects fixed; every fix has a bisect-verified regression test (revert → fail → restore → pass).

  **Security (prototype pollution / XSS / DoS)**

  - `@pyreon/reactivity` `reconcile()` + `createStore` set trap — a documented "apply an untrusted API response into a store" path (`reconcile(JSON.parse(body), store)`) had no `__proto__`/`constructor`/`prototype` guard. Added on both the write and stale-key-removal passes + defense-in-depth in the proxy set trap.
  - `@pyreon/i18n` `addMessages` — `nestFlatKeys` (dotted-key expansion) ran BEFORE `deepMerge`, so deepMerge's own pollution filter never saw the dotted form; `__proto__.x` walked into `Object.prototype` and wrote onto it. Message JSON is routinely CDN/community-sourced. Guarded.
  - `@pyreon/document` HTML renderer — `language` was interpolated raw into `<html lang="…">` and `styleStr` emitted string values raw into `style="…"`; a CMS/author-supplied value containing `"><script>` broke out → stored XSS. `lang` is now charset-restricted + escaped; style values route through the renderer's existing `sanitizeCss`.
  - `@pyreon/zero` rate-limit — `MAX_STORE_SIZE` was a declared-but-unenforced constant; the cleanup only evicted EXPIRED entries, so a flood of unique keys within one window (spoofable `X-Forwarded-For`) grew the Map unbounded — an unauthenticated memory-exhaustion DoS. Added a hard cap with oldest-first eviction (mirrors the ISR cache's proven `set()`).
  - `@pyreon/zero` ISR — the cache stored ANY response and replayed it as a 200 for the whole revalidate window: a transient 5xx/3xx became a self-inflicted outage, and a `Set-Cookie` response was replayed cross-user. Now only 2xx, cookie-free responses are cached; everything else passes through verbatim with its original status (`x-isr-cache: BYPASS`).
  - `@pyreon/server` `prerender` + `@pyreon/zero` SSG plugin (3 sites) — the path-traversal guard used a bare `startsWith(resolve(outDir))` (string-prefix, not path containment): a `getStaticPaths` slug resolving to the SIBLING `dist-evil/` passed and wrote outside the output root. Now separator-terminated containment (`isInsideDist`).
  - `@pyreon/zero` API-route matcher — dangerous param names from the route pattern guarded (defense-in-depth; consistent with the reconcile / i18n guards).

  **Memory leaks**

  - `@pyreon/reactivity` `signal._d` — direct-updater disposal nulled an array slot but never compacted, so a long-lived signal (theme/locale/auth, or signals read in `<For>` rows) bound by churning components accumulated one permanent dead slot per ever-mounted binding — an app-lifetime leak that ALSO degraded the signal-write hot path (`notifyDirect` iterated O(total-ever), not O(live)). Switched to a `Set` (same as `_s`): O(1) disposal, O(live) iteration, bounded growth. Proven structurally — `_d.size` stays 0 after 10 000 register/dispose cycles.
  - `@pyreon/dnd` `useSortable` — `itemRef` pushed every pdnd registration onto a shared array and the unmount (`ref(null)`) branch was a no-op, so a churning `<For>` sortable (todo list / kanban — the documented usage) leaked every removed item's draggable/dropTarget registration until the whole sortable unmounted. Now per-key disposal on unmount and re-register.
  - `@pyreon/zero` ISR — a hung revalidation handler pinned its key in the in-flight set forever (`finally` never ran), so the entry could never recover from stale. Background revalidation is now timeout-bounded (`ISRConfig.revalidateTimeoutMs`, default 30 s).

  **Correctness / silent-failure**

  - `@pyreon/router` `stringifyLoaderData` — the cycle detector used an all-seen `WeakSet` that was never pruned, so a shared (DAG) reference — extremely common, e.g. `{ author: user, lastEditor: user }` from an ORM — falsely threw "circular reference" and 500'd the SSR response. Replaced with true ancestor-path detection (the original code's own comment anticipated exactly this remedy). **Behaviour change (bug fix, strictly more permissive):** payloads that previously 500'd now serialize; real cycles still throw.
  - `@pyreon/server` `processTemplate` — used `String.prototype.replace` with string replacements, so rendered HTML containing literal `$&` / `$$` / `` $` `` / `$'` (prices, code, math) was corrupted by regex-pattern substitution. Switched to function replacements.
  - `@pyreon/i18n` `interpolate` — a serialization failure (circular value, throwing `toString`) was swallowed silently, rendering `{{key}}` to end users with no signal. Now dev-warns (fallback behaviour unchanged).
  - `@pyreon/query` `useSSE` — the reactive effect unconditionally reset `intentionalClose = false`, so an explicit `close()` was silently overridden by any later reactive `url`/`enabled` change. Now respects `intentionalClose` (mirrors `useSubscription`); `reconnect()` is the explicit resume.

  **Disclosures (honest scope)**

  - **An attempted SWR-swallow fix (surface the empty `.catch` via `__DEV__` warn + `_onError`) was REVERTED from this PR.** Probing empirically proved `revalidateSwrLoaders` is invoked **0 times** even by the canonical `staleWhileRevalidate` nav pattern: `resolveRoute` returns fresh `RouteRecord` objects per resolution, so `runLoaders`' `r.staleWhileRevalidate && router._loaderData.has(r)` gate is never true across navigations — the SWR branch is **dead code**, and the existing "revalidates in background" test's count actually comes from the blocking path running twice. Adding error-surfacing to provably-unreachable code is not hardening (and it dropped router coverage). **The real bug — `staleWhileRevalidate` is effectively non-functional for the nav-away/back case (record-identity-keyed gate)** — is a distinct, significant finding whose correct fix (key the gate by a stable path/loaderKey) is a non-trivial router behaviour change deserving its own focused, aligned PR. Documented in `router/src/tests/loader.test.ts` as a flagged follow-up; deliberately not bundled here (scope/risk).
  - One audit finding (`decodeKeyFromMarker`) was investigated and **dropped as a false positive** — `%2D` never appears in `encodeURIComponent` output, so the manual substitution is uniquely reversible.
  - Z5 (API-route param guard) is defense-in-depth: a string param value assigned to `__proto__` is a silent JS no-op (not exploitable); the guard prevents the real own-prop shadow for `constructor`/`prototype` and matches the repo-wide convention.

  Validation: lint 0 errors; typecheck clean (8 touched packages); gen-docs in sync; audit-types `--all --strict` 0 HIGH; bundle-budgets 54/54 within budget. Per-package suites all green (reactivity 294, router 520, server 78, i18n 155, document 269, dnd 111, query 151, zero 884).

- [#641](https://github.com/pyreon/pyreon/pull/641) [`078b1e7`](https://github.com/pyreon/pyreon/commit/078b1e72343828b2d73f97c03e0b5b0f335fe979) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Repo sweep: duplication removal + two SSG correctness/robustness fixes.

  **`@pyreon/document` — duplication removal (behaviour-preserving).**

  - `getTextContent` (recursive node-tree → text flatten) was copy-pasted **byte-identically into 13 of the 18 renderers** (svg/pdf/pptx/xlsx/docx + every chat target). Consolidated into the package's `nodes.ts` as the single source of truth; the 13 copies replaced with an import. (text/markdown/html deliberately walk the tree differently and were left untouched.)
  - The HTML/XML escape function (`& < > "`) was copy-pasted **4×** under three names (`escapeHtml`/`escapeXml`/`esc`) into html/svg/email/telegram. Consolidated into `sanitize.ts` as `escapeXml`; renderers import it (aliased to their local names — zero call-site churn). The intentionally-distinct escapes (csv quoting, runtime-server's 5-char+perf-counter variant, the standalone compiler escapes) were correctly left alone — different algorithm/layer.
  - Net: ~80 LOC of true duplication removed, no API/behaviour change. Proven by the full `@pyreon/document` suite (441/441) — the per-renderer text/escape tests exercise the consolidated path; identical-body removal verified by `diff` (0 lines).

  **`@pyreon/zero` — sitemap duplicate `<url>` (correctness bug).** `generateSitemap` built `allPaths = [...routeScan, ...additionalPaths]` with **no dedup**. The i18n cluster path dedups via `byUnPrefixed`, but the non-i18n branch is a raw 1:1 map — so a static route present in BOTH the route scan AND `additionalPaths` (routine: SSG-emitted paths merged via `seoPlugin`) emitted a **duplicate `<url>`/`<loc>`**. (The nearby "merge dedups" comment was itself inaccurate — that merge is a plain spread.) Now deduped by path (first-wins, order-preserving) at the single source, covering both branches. Regression test: a path in both inputs → exactly one `<loc>`, `<url>` count correct. Bisect-verified.

  **`@pyreon/zero` — SSG path-escape + duplicate-path robustness (edge cases).**

  - `expandUrlPattern` substituted `getStaticPaths` param values verbatim into what becomes a `dist/<path>/index.html` write target. An unsanitized CMS slug containing `/` (in a single non-catch-all `:slug`) or `.`/`..` traversal segments would escape the intended structure. Now rejected with a clear error (catch-all `:rest*` still spans segments but still rejects `.`/`..`). Bisect-verified.
  - `autoDetectStaticPaths` had no dedup — a `getStaticPaths` returning a duplicate slug (CMS dup, pagination overlap) or i18n fan-out collision rendered the same `dist/<path>/index.html` twice (wasted work + last-write race) and fed a duplicate into the SSG→sitemap merge. Now order-preserving deduped. Bisect-verified.

  Validation: lint 0 errors; typecheck clean (document + zero); `bun run coverage` exit 0 (document 94.27 %, zero 89.24 %, all thresholds met); `verify-modes` 16/16 (all SSG cells incl. `cpa-pw-blog × ssg` which exercises `getStaticPaths` dynamic-slug enumeration end-to-end through the changed path); zero suites seo 40/40 + ssg-plugin 111/111; document 441/441.

  **Deferred (own focused PRs — analysis preserved):** router `findNotFoundFallback` cache — my earlier "just add a WeakMap" estimate was WRONG; its result depends on `urlPath` (not a pure fn of `routes`), so a correct cache needs an enumerate-candidates / pick-by-urlPath refactor, too risky for a sweep. `react-compat`/`preact-compat` `shallowEqual` + React-attr-mapping duplication → core consolidation (medium-risk cross-package). The [#626](https://github.com/pyreon/pyreon/issues/626)-documented styler `insertCache`/DOM-rule unbounded growth + `internElementBundle` css-prop. No new memory leak found this round (prior sweeps already fixed signal.\_d / computed.direct / useSortable / ISR).

- [#596](https://github.com/pyreon/pyreon/pull/596) [`e8e95bc`](https://github.com/pyreon/pyreon/commit/e8e95bc2d6785d397f4b8f85039ce76c2a7f6cea) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Component-level HMR for zero/router apps — editing a route/page component now updates the DOM in place without a manual refresh, preserving module-scope signal state.

  Previously `@pyreon/vite-plugin`'s `injectHmr` emitted a bare `import.meta.hot.accept()` (no callback): Vite re-evaluated the edited module but nothing re-rendered the mounted tree, and the self-accept suppressed Vite's full-reload fallback — so every component/JSX edit produced a silently-stale UI until a manual browser refresh.

  Now the accept callback hands the fresh module to `globalThis.__pyreon_hmr_swap__` (registered by `@pyreon/router` in a dev browser, zero import coupling). The coordinator finds every active matched lazy route whose `_hmrId` matches (emitted by `@pyreon/zero`'s fs-router as `lazy(() => import(…), { hmrId })`), swaps the component, and bumps the loading signal so `RouterView` re-renders only that subtree in place — no page reload, so module-scope signals keep their values via the existing `__pyreon_hmr_registry__`. Edits outside the active route tree (nested components, unrelated routes, signal-only modules) or apps without the coordinator fall back to `import.meta.hot.invalidate()` → an automatic full reload (still no manual refresh). Production is unaffected (dev+browser gated).

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`b4de7e0`](https://github.com/pyreon/pyreon/commit/b4de7e0f0eb9134325eb6d87db6250064a494d51), [`8e4b607`](https://github.com/pyreon/pyreon/commit/8e4b607b01c6399153bd504f1411f213db987a9a), [`7150368`](https://github.com/pyreon/pyreon/commit/7150368f85daa783e55f05541d0c45356c13b00d), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`8a300bf`](https://github.com/pyreon/pyreon/commit/8a300bf0e6fe7532bb6ae4670a8d64258d64e25f), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838), [`2ee82eb`](https://github.com/pyreon/pyreon/commit/2ee82eb340c515c16aaa7a652ffc5b0c97b59ed6), [`4f410b6`](https://github.com/pyreon/pyreon/commit/4f410b6403ce1c033f049aa6cd2700f64193b2d1), [`e8e95bc`](https://github.com/pyreon/pyreon/commit/e8e95bc2d6785d397f4b8f85039ce76c2a7f6cea)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/router@0.19.0
  - @pyreon/server@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/head@0.19.0
  - @pyreon/runtime-server@0.19.0
  - @pyreon/vite-plugin@0.19.0
  - @pyreon/runtime-dom@0.19.0
  - @pyreon/meta@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [[`f35e69b`](https://github.com/pyreon/pyreon/commit/f35e69b2ab53474ecf0ffb792866bc27215b68c3)]:
  - @pyreon/vite-plugin@0.18.0
  - @pyreon/runtime-dom@0.18.0
  - @pyreon/core@0.18.0
  - @pyreon/head@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/router@0.18.0
  - @pyreon/runtime-server@0.18.0
  - @pyreon/server@0.18.0
  - @pyreon/meta@0.18.0

## 0.17.0

### Minor Changes

- [#583](https://github.com/pyreon/pyreon/pull/583) [`af6faf7`](https://github.com/pyreon/pyreon/commit/af6faf78ce02dae1973ed845459bf714adad4fac) Thanks [@vitbokisch](https://github.com/vitbokisch)! - SSG mode now does route-level code splitting by default — parity with SSR/SPA/ISR modes which already had it.

  Pre-this-PR, SSG mode hardcoded `staticImports: true` in the route generator, bundling every route component into the main client chunk. Trade-off was instant post-hydration navigation, but the initial bundle grew linearly with route count — a 50-route docs site shipped all 50 route components on first paint. The pre-existing 3-tier `generateRouteEntry` already handled `lazy(() => import(...))` correctly for SSR/SPA; SSG was an outlier that opted out.

  Now SSG uses the same lazy-splitting logic by default. Only the landing route + its deps load up front; other routes fetch on navigation. Crossover point is ~5-8 routes: below that, single-chunk is fine and the navigation chunk-fetch is the only cost; above that, lazy splitting shrinks the initial bundle by a meaningful amount.

  New opt-out: `ssg.splitChunks: false` restores the pre-2026-Q3 single-chunk behaviour for tiny sites (2-5 pages) that prefer the bundle-everything-then-instant-nav trade.

  ```ts
  // vite.config.ts — opt out for a 3-page marketing site
  zero({
    mode: "ssg",
    ssg: { splitChunks: false },
  });
  ```

  Verified end-to-end against all 7 SSG verify-modes cells including `cpa-pw-blog` (dynamic routes + `getStaticPaths` — the case that exercises the lazy-route + namespace-import-for-build-time-export path). ISR, SSR, SPA modes are unchanged — they already had lazy splitting.

  **Migration**: zero behavior change for existing apps. To preserve the pre-this-PR behaviour, set `ssg.splitChunks: false`. The default flip is the win.

### Patch Changes

- [#582](https://github.com/pyreon/pyreon/pull/582) [`53b264b`](https://github.com/pyreon/pyreon/commit/53b264b87897a35d8418ad37ce85c805a5b7874f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/zero` Vite plugin now defaults to port 3000 — matching `zero dev` / `zero preview` (already 3000), the runtime adapter (already 3000), and Next.js / Remix / Astro convention.

  Precedence (verified end-to-end against a running example):

  1. **Vite CLI `--port N` flag** — the plugin's `config()` hook detects `--port` / `--port=N` / `-p N` / `-p=N` in `process.argv` and omits its `server.port` entirely so Vite's CLI parsing wins (proven empirically: `vite --port 5174 --strictPort` binds 5174, not 3000).
  2. **User `vite.config.ts` `server: { port: N }`** — user config beats plugin in Vite's merge order.
  3. **`zero({ port: N })`** — resolved into `config.port` and applied unconditionally (even when CLI has `--port` — explicit user intent in vite.config.ts wins over the argv detection).
  4. **Default 3000** — applied when no other source set a port (proven empirically: bare `vite` against `zero({})` binds 3000).

  The argv-detection layer is load-bearing — PR [#579](https://github.com/pyreon/pyreon/issues/579) closed because returning `server.port: 3000` from `config()` unconditionally clobbered `vite --port 517N --strictPort` in the e2e webServer (Vite's CLI flag does NOT override a plugin `config()` hook's `server.port` return — counterintuitive but empirically confirmed). The new approach uses `argvHasPortFlag(process.argv)` at the hook's firing point to decide whether to apply the default.

  Bisect-verified across 7 unit tests + 6 helper-fn tests + 2 real-Vite end-to-end runs (no flag → 3000, `--port 5174` → 5174).

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/head@0.17.0
  - @pyreon/router@0.17.0
  - @pyreon/runtime-dom@0.17.0
  - @pyreon/runtime-server@0.17.0
  - @pyreon/server@0.17.0
  - @pyreon/reactivity@0.17.0
  - @pyreon/vite-plugin@0.17.0
  - @pyreon/meta@0.17.0

## 0.16.0

### Patch Changes

- [#555](https://github.com/pyreon/pyreon/pull/555) [`f82584b`](https://github.com/pyreon/pyreon/commit/f82584b3dfb1362d376065354d023647fdbdfa02) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `router.preload(path, request?, options?)` gains an optional third `options` argument with `skipLoaders: true` — bypasses the loader-running step while keeping lazy-component resolution intact (so the synthetic chain still renders cleanly). The SSG plugin's `__renderNotFound` now passes `{ isNotFound: true }` through `renderPath` → `router.preload(probePath, undefined, { skipLoaders: true })`, so auth-touching parent-layout loaders (`fetchUser`, session reads, private APIs) no longer fire during static 404 generation. Closes the documented "Loaders on parent layouts run during 404 render" limitation. Runtime SSR intentionally still runs loaders for 404 — analytics / audit-logging hooks that fire per-request should keep firing even when the request resolves to a not-found. Bisect-verified at the unit layer (4 new specs in `router.preload — PR C — skipLoaders`). Back-compat: the new arg is positional and optional, so 2-arg callers (`router.preload(path, request)`) continue to work unchanged.

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`321bac0`](https://github.com/pyreon/pyreon/commit/321bac062b68cabf66357f0362385384a96b5692), [`f82584b`](https://github.com/pyreon/pyreon/commit/f82584b3dfb1362d376065354d023647fdbdfa02)]:
  - @pyreon/core@0.16.0
  - @pyreon/router@0.16.0
  - @pyreon/meta@0.16.0
  - @pyreon/server@0.16.0
  - @pyreon/head@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/runtime-dom@0.16.0
  - @pyreon/runtime-server@0.16.0
  - @pyreon/vite-plugin@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6), [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4), [`83aa9ab`](https://github.com/pyreon/pyreon/commit/83aa9abbc52d423dfc9d45a3b0a4e048b161186d)]:
  - @pyreon/runtime-dom@0.14.0
  - @pyreon/runtime-server@0.14.0
  - @pyreon/vite-plugin@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/head@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/router@0.14.0
  - @pyreon/server@0.14.0
  - @pyreon/meta@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`ec30b4e`](https://github.com/pyreon/pyreon/commit/ec30b4e2188fb493fdde77a77f521abe000beae0), [`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/router@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/meta@0.13.0
  - @pyreon/head@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/runtime-dom@0.13.0
  - @pyreon/runtime-server@0.13.0
  - @pyreon/server@0.13.0
  - @pyreon/vite-plugin@0.13.0

## 0.12.15

### Patch Changes

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero/isr): bound the in-memory ISR cache with LRU eviction

  `createISRHandler` kept an unbounded `Map<pathname, CacheEntry>` — on
  parametrised routes like `/user/:id` where `:id` is free-form, the
  cache grew without limit over the server's lifetime. Long-running
  deployments accumulated one entry per distinct URL forever.

  Fix: added `ISRConfig.maxEntries` (default: `1000`) with LRU eviction.
  Every cache read `.delete()` + `.set()`s the entry to bump it to newest
  (preserving insertion-order LRU). Writes evict the oldest entries
  until size is under the cap.

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero/link): evict DOM `<link>` nodes when the prefetch cache rolls over

  `doPrefetch` injected `<link rel="prefetch">` and `<link rel="modulepreload">`
  elements into `document.head` with NO cleanup. The in-memory `prefetched`
  Set was capped at 200 with FIFO eviction, but the matching DOM nodes
  stayed forever. Long SPA sessions accumulated thousands of stale
  `<link>` nodes in `<head>`.

  Fix: `prefetched` is now a `Map<href, Element[]>` — when the cache
  evicts the oldest href, its matching `<link>` elements are also
  `.remove()`d from `document.head`.

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero/theme): make `resolvedTheme()` reactive to OS color-scheme changes

  `resolvedTheme()` read `window.matchMedia('(prefers-color-scheme: dark)').matches`
  as a one-shot check — no signal tracked the OS preference. Components
  reading `resolvedTheme()` subscribed only to the `theme` signal (explicit
  user choice). When the user flipped dark mode at the OS level, the
  `<html data-theme>` attribute updated (via the `onChange` handler in
  `initTheme`), but every component using `resolvedTheme()` stayed on
  stale state — inverse theme effectively not reactive.

  Fix: introduced an `_osPrefersDark` signal that `initTheme` seeds from
  `matchMedia.matches` and updates on every `'change'` event. When
  `theme === 'system'`, `resolvedTheme()` reads `_osPrefersDark()` —
  subscribing components to both the user preference AND the OS
  preference. Changing either now re-renders the whole tree.

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/router@0.12.15
  - @pyreon/runtime-dom@0.12.15
  - @pyreon/runtime-server@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/head@0.12.15
  - @pyreon/reactivity@0.12.15
  - @pyreon/server@0.12.15
  - @pyreon/vite-plugin@0.12.15
  - @pyreon/meta@0.12.15

## 0.12.14

### Patch Changes

- [#251](https://github.com/pyreon/pyreon/pull/251) [`290ea64`](https://github.com/pyreon/pyreon/commit/290ea64ee90b5e749008d2b437084fc001ad24f1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Zero meta-framework anti-pattern cleanup + lint rule precision

  `@pyreon/zero`:

  - `link.tsx` `doPrefetch`: added `typeof document === 'undefined'` early-return.
    Prefetch only fires from browser-mounted Link interactions but the explicit
    guard documents the SSR-safety contract.
  - `client.ts` `startClient`: added `typeof document === 'undefined' → throw`
    early-return. Browser entry point hard-fails in SSR with a clearer error
    than `document is not defined`.
  - `script.tsx` `loadScript`: typeof-document early-return at function entry
    (the function is only invoked from `onMount` but the rule can't
    AST-trace the indirect call).
  - Error prefix normalisation: `[zero]` / `[zero:adapter]` / `[zero:image]` /
    etc. → `[Pyreon]` across 9 source files. Test assertions updated.
  - `font.ts`: added `[Pyreon] ` prefix to two `Failed to fetch / download`
    errors.

  `@pyreon/lint`:

  - `no-window-in-ssr` and `no-dom-in-setup`: early-return-guard heuristic
    now recognises `throw` as a function-terminating statement (in addition
    to `return`). Common in entry-point functions like `startClient` that
    hard-fail in SSR rather than silently no-op.
  - `no-dom-in-setup`: added the same early-return-on-typeof-document/window
    guard tracking that `no-window-in-ssr` already had — `if (typeof document
=== 'undefined') return …` at function head implicitly guards the rest
    of the body for both rules now.
  - `BROWSER_GLOBALS`: removed `fetch`. It's a universal global in Node 18+,
    Bun, Deno, browsers, and edge runtimes. Code using `fetch` isn't
    browser-specific. (`XMLHttpRequest` and `WebSocket` remain DOM-only.)

  5 new bisect-verified regression tests for the rule changes.

- Updated dependencies [[`95e7e00`](https://github.com/pyreon/pyreon/commit/95e7e00bd3e3b3926bd8348cf91f88494605ccc6), [`779f61f`](https://github.com/pyreon/pyreon/commit/779f61f99e1f403485871c1848fc82489d20960f)]:
  - @pyreon/router@0.12.14
  - @pyreon/server@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/head@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/runtime-dom@0.12.14
  - @pyreon/runtime-server@0.12.14
  - @pyreon/vite-plugin@0.12.14
  - @pyreon/meta@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/head@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/router@0.12.13
  - @pyreon/runtime-dom@0.12.13
  - @pyreon/runtime-server@0.12.13
  - @pyreon/server@0.12.13
  - @pyreon/vite-plugin@0.12.13
  - @pyreon/meta@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/head@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/router@0.12.12
  - @pyreon/runtime-dom@0.12.12
  - @pyreon/runtime-server@0.12.12
  - @pyreon/server@0.12.12
  - @pyreon/vite-plugin@0.12.12
  - @pyreon/meta@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/head@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/router@0.12.11
  - @pyreon/runtime-dom@0.12.11
  - @pyreon/runtime-server@0.12.11
  - @pyreon/server@0.12.11
  - @pyreon/vite-plugin@0.12.11
  - @pyreon/meta@0.12.11

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
  - @pyreon/meta@0.5.0

## 0.4.1

### Patch Changes

- Pin GitHub Actions to SHA hashes, add security policy

- Updated dependencies []:
  - @pyreon/meta@0.4.1

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
  - @pyreon/meta@0.4.0

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
  - @pyreon/meta@0.3.0

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
  - @pyreon/meta@0.2.0

## 0.2.0

## 0.1.0

### Minor Changes

- Initial public release of Pyreon Zero meta-framework with SSR/SSG/ISR/SPA modes, file-system routing, optimized components (Image, Link, Script), theme system, font optimization, SEO utilities, cache middleware, and Node/Bun/static deployment adapters.
