# @pyreon/a11y

## 0.53.0

### Minor Changes

- [#3847](https://github.com/pyreon/pyreon/pull/3847) [`a110468`](https://github.com/pyreon/pyreon/commit/a1104680b3cf44b9d062ee4906b76a3ff09b2634) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native lowering for machine, i18n, toast, a11y, table, dnd and sync moves out of the compiler into package-owned plugins. A bare transform with no plugins no longer lowers these libraries; `<Toaster/>` must be imported from `@pyreon/toast`.

### Patch Changes

- Updated dependencies [[`c933f92`](https://github.com/pyreon/pyreon/commit/c933f92e20104aba2807e229f03b9f0530135cb3), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`068310d`](https://github.com/pyreon/pyreon/commit/068310dd9bd78663945348f579a7f5fd082c6944), [`c253ae2`](https://github.com/pyreon/pyreon/commit/c253ae23978b06904768d171f3eb7e2b7114e273), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`87879d0`](https://github.com/pyreon/pyreon/commit/87879d0a04b5e221482693596cff0f7352c1e3ed), [`4b207a7`](https://github.com/pyreon/pyreon/commit/4b207a7c56938fc326b79dae1d381b7af53c8681), [`792e27e`](https://github.com/pyreon/pyreon/commit/792e27ef09c9b3dcc88c85a7ab6d969f60388848), [`0c95de5`](https://github.com/pyreon/pyreon/commit/0c95de5911873d56543a28acc0bb23e0ad5b299c), [`6df4450`](https://github.com/pyreon/pyreon/commit/6df4450bb57c834997796f8f37c59bae3e743d74), [`9fed8dc`](https://github.com/pyreon/pyreon/commit/9fed8dc5982d850bf09a0d0afa95b6d0fc7e8bae), [`1ce711d`](https://github.com/pyreon/pyreon/commit/1ce711d63e715110f614fcc423530eb13ceee43a), [`f7b64d9`](https://github.com/pyreon/pyreon/commit/f7b64d9164eb34d202e3d84b0c729a8d6918a359), [`3ec86b7`](https://github.com/pyreon/pyreon/commit/3ec86b7d4fce4c2c2c19ae233e5387d112b97a9a), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`09839d5`](https://github.com/pyreon/pyreon/commit/09839d56f631df1743319211cd2c821c2f259990), [`a110468`](https://github.com/pyreon/pyreon/commit/a1104680b3cf44b9d062ee4906b76a3ff09b2634), [`b0d6ac0`](https://github.com/pyreon/pyreon/commit/b0d6ac0c32c0b678d97144f43e750683bf1225ae), [`cf21221`](https://github.com/pyreon/pyreon/commit/cf21221e4249823a8fd04be8601168817045f6eb), [`0c95de5`](https://github.com/pyreon/pyreon/commit/0c95de5911873d56543a28acc0bb23e0ad5b299c), [`09839d5`](https://github.com/pyreon/pyreon/commit/09839d56f631df1743319211cd2c821c2f259990), [`ed1e29d`](https://github.com/pyreon/pyreon/commit/ed1e29d20c98d7c6ae2c062c10aa73174afa35c3), [`9b84418`](https://github.com/pyreon/pyreon/commit/9b844189403ed062150edff9999d2cae7838f430), [`3de1c68`](https://github.com/pyreon/pyreon/commit/3de1c68b460f1f83deb9988192dfa4000ffb25b0)]:
  - @pyreon/native-compiler@0.53.0
  - @pyreon/router@0.53.0
  - @pyreon/core@0.53.0
  - @pyreon/reactivity@0.53.0

## 0.52.0

### Minor Changes

- [#3652](https://github.com/pyreon/pyreon/pull/3652) [`a156c40`](https://github.com/pyreon/pyreon/commit/a156c4069ad6882d9e402efa552566dd5714b94d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Hardening pass across five fundamentals packages. Behaviour changes are marked **(behaviour)**.

  **@pyreon/hooks**

  - **(behaviour)** Hook teardown is now owned by the component. Every hook registered its cleanup with `onCleanup` from `@pyreon/reactivity`, which only registers inside an effect run: a root-mounted component never cleaned up (the GPS watch, socket, window listeners and speech kept running after unmount), and a component inside a `<For>` / `<Show>` / routed page had its cleanup tied to that boundary's effect — adding one `<For>` row tore down the resources of every row that stayed. Teardown now runs exactly when the component unmounts.
  - `useGeolocation`: a TIMEOUT / POSITION_UNAVAILABLE error no longer drops the watch id (which left GPS on after unmount and let a retry open a second watch). Only a permission denial ends the watch, and it is cleared explicitly.
  - **(behaviour)** `useEventListener`: a `target` that is `null` at setup (a ref) is resolved at mount instead of silently falling back to `window`; if it is still `null`, nothing is bound and a dev warning fires. `target` may also be an `EventTarget` directly.
  - `useTimeAgo`: a reactive date getter is tracked, so a change re-renders immediately and restarts the timer. **(behaviour)** The "just now" bucket goes through a custom `formatter` as `(0, 'second', isPast)`.
  - `useSpeech`: only the hook's own current utterance drives `speaking()` (a replaced utterance's late `onend` no longer flips it off mid-speech), and **(behaviour)** `stop()` / unmount only cancel speech this hook started.
  - `useNotifications`: when the `Notification` constructor throws (Android Chrome), falls back to the service-worker registration's `showNotification`; `notify()` on a platform without the API warns in dev.
  - **(behaviour)** `useClickOutside`: listens for a single `pointerdown` instead of `mousedown` + `touchstart`, which fired the handler twice per touch tap.
  - `useInfiniteScroll`: keeps loading while the sentinel stays visible after a page lands (a first page that does not fill the container no longer stalls), and does not start a second load while one is in flight.
  - **(behaviour)** `useLinking().openUrl` refuses `javascript:` / `data:` and any scheme other than http(s), mailto and tel (relative URLs allowed), with a dev warning.
  - `useIntersection` / `useElementSize`: the element getter is tracked from mount, so an element that appears after mount is observed.
  - `useMediaQuery` accepts a query getter and re-subscribes when it changes. `useKeyboard` gains `ignoreInputs`. `useWebSocket` gains `maxMessages`. `useScrollLock` compensates for the removed scrollbar and also locks `<html>` (iOS Safari).
  - **(behaviour)** `useFetch`: `isPending` starts `true` on the server as well, matching the client's first render (was a hydration mismatch).

  **@pyreon/a11y**

  - **(behaviour)** `announce()`: both regions are created on the first call and messages are written ~100ms later, so the first announcement lands in a region the screen reader has already seen; messages announced together are joined instead of overwriting each other.
  - `<LiveRegion>`, `<VisuallyHidden>` and `<SkipLink>` no longer freeze reactive props at setup. `<LiveRegion>` accepts accessors for `politeness` / `atomic` / `role` / `visible`, and toggling `visible` restyles the region instead of remounting it.
  - **(behaviour)** `<SkipLink>` handles the jump itself (focus + scrollIntoView) and cancels the default hash navigation, which a hash-mode router read as a route.
  - `<RouteAnnouncer>` warns in dev when `<RouterView>`'s built-in announcer is also active. `createA11yId`'s docs no longer claim server/client ids always match.

  **@pyreon/toast**

  - **(behaviour)** A duration a timer cannot hold (`Infinity`, above 2^31-1 ms, `NaN`, negative) is treated as persistent — it used to overflow and dismiss the toast after ~1ms.
  - **(behaviour)** `toast()` is a no-op on the server (dev warning): the store is process-wide, so a server-side toast leaked into other requests.
  - **(behaviour)** An action's `onClick` receives `{ id, dismiss }`.
  - A second mounted `<Toaster>` warns in dev; a Toaster's `duration` default is restored on unmount; the Toaster now removes its portal host and visibility listener on unmount. Animations respect `prefers-reduced-motion`.

  **@pyreon/hotkeys**

  - A keydown without a `key` (Chrome autofill) no longer throws out of the shared listener; IME composition keystrokes never fire shortcuts; input detection uses `composedPath()[0]` so inputs inside a shadow root are recognised; `alt+<letter/digit>` matches on macOS via `event.code`.
  - `useHotkey`'s `target` may be a ref / getter, resolved at mount and tracked afterwards.

  **@pyreon/virtual**

  - **(behaviour)** Options are read once per pass and REPLACE the previous options, so a key you stop returning falls back to TanStack's default instead of lingering. `useVirtualizer` warns in dev when `getScrollElement()` is still `null` after mount.

- [#2786](https://github.com/pyreon/pyreon/pull/2786) [`02c2bd9`](https://github.com/pyreon/pyreon/commit/02c2bd9140968826fb1251f818dc5bb919e5ba78) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/a11y`'s `announce(...)` works on iOS + Android, and its native runtime is **co-located in the package** (`@pyreon/a11y/native/{swift,kotlin}/`) — the per-package architecture, not the monolithic `@pyreon/native-runtime-*`.

  **Runtime (co-located) — `PyreonA11y`:**
  - Swift: `announce(_:assertive:)` posts a VoiceOver announcement (`UIAccessibility.post(.announcement)`), raising the iOS 17+ speech priority when `assertive`.
  - Kotlin: `announce(message, assertive)` routes to a registered announcer (`PyreonA11y.setAnnouncer { rootView.announceForAccessibility(it) }`), the "Android needs a host" seam — a safe no-op before wiring.

  Ships in `@pyreon/a11y/native/`, declared via the `pyreon.native` field, so `pyreon-native wire` aggregates it from the installed package. The co-source verify gate (`scripts/check-native-cosource.ts`, wired into native-validate CI) compiles + smoke-runs it against the stub harness — the Kotlin announcer seam is asserted, the Swift wrapper typechecks.

  **Lowering:** `announce("m")` → `PyreonA11y.announce("m", assertive: false)`; `announce("m", { politeness: 'assertive' })` → `assertive: true`. Message is any expression; a renamed import (`announce as say`) is handled. A new `announce-call` ExprIR kind is threaded through `parse` (gated on the `@pyreon/a11y` import) + both emits + the `expr-utils` walkers + `infer-type`.

  The **DOM-based helpers stay web-only** — `VisuallyHidden` / `LiveRegion` / `SkipLink` / `createA11yId` still warn (per-export, `announce` excepted).

  Proven R2 (emit) + R3 (typecheck vs the compiler's `PyreonA11y` stubs on swiftc + kotlinc); `native-a11y.test.ts` 7 cases + the co-source gate. Full native-compiler suite 2818 pass (fixing two tests that had encoded the old "announce warns" behavior). No device proof yet; `politeness` isn't distinguished on Android.

- [#2798](https://github.com/pyreon/pyreon/pull/2798) [`e56b865`](https://github.com/pyreon/pyreon/commit/e56b865f08946b7f848906bf2562911fa7f95066) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Derive the native compiler's web-only warning set from the package manifests

  Importing a web-only `@pyreon/*` package into shared source is meant to warn at
  parse time, naming the `<Web>` escape hatch. Four packages — `@pyreon/url-state`,
  `@pyreon/head`, `@pyreon/hotkeys` and `@pyreon/feature` — declared
  `multiplatform: { tier: 'web-only' }` but were absent from the compiler's
  hand-written `WEB_ONLY_PACKAGES` literal, so importing one produced **no
  diagnostic at all**: the call emitted verbatim and the native build failed with
  `cannot find 'x' in scope`, pointing nowhere near the cause.

  The set is now derived from the manifests (`tier === 'web-only'` and no
  `nativeFrontend`) and regenerated by `check-multiplatform-tier`, which gates that
  it stays in sync. The hand-written list had already been repaired twice by hand —
  `@pyreon/sync` and `@pyreon/rich-text` were missing, `@pyreon/toast` went stale
  the other way once its core lowered — each time with a comment recording the
  incident rather than closing the class.

  A cross-check test existed but ran in one direction only (every compiler entry
  must declare web-only), and its comment waved the other direction through as
  acceptable. That was the direction that shipped the bug; it now asserts equality.

  Two supporting changes:

  - `multiplatform` gains an optional `nativeFrontend` field for packages that
    lower part of their surface. The three-value tier vocabulary could not express
    partial crossing, which is what made `@pyreon/toast` go stale. `toast`, `a11y`,
    `query` and `validation` now declare it.
  - The blanket warning defers to `UNLOWERED_PYREON_MODULES`, the finer per-symbol
    mechanism, so packages covered there (`validate`, `validation`, `http`, `rx`)
    warn exactly once with their specific advice instead of twice.

  `@pyreon/query` and `@pyreon/validation` also had factually stale rationales:
  query's said native fetching is `useFetch/PyreonFetch` although `PyreonQuery`
  shipped and `useQuery` is lowered, and validation's said per-validator lowering
  was "not shipped" although the Gap-4 schema forms emit native validators.

  ## Lower `@pyreon/validate`'s `s` DSL to native validators

  A top-level `const X = s.object({ … })` declaration now emits a Swift `Codable`
  struct and a Kotlin `data class`, each with `parse` / `safeParse` and real
  constraint enforcement — from the same source, on both targets. Before this,
  `@pyreon/validate` had no native story at all: a native app could not validate
  data, and the schema emitted verbatim.

  It reuses the existing Gap-4 schema pipeline (recognizer → IR → per-target
  emit) rather than adding a second one. The only structural difference from
  zod / valibot / arktype is that `s.object({ … })` arrives with no wrapper call —
  it already IS a Standard Schema — so the shared walker's `schemaFn` became
  nullable instead of being copied.

  Scope, stated plainly: the DECLARATION form lowers. Inline uses
  (`s.string().parse(x)`), the JIT, JSON-schema export and the v1/mini compat
  surfaces stay web, and still warn.

  The recognizer gates on the IMPORT, not the bare name: `zodSchema(...)` is a
  distinctive wrapper but a lone `s` is not, and claiming it would silently
  rewrite a user's own binding.

  ## Native router: implement the `query` it has always advertised

  `PyreonRouter`'s header has listed `query` (typed search params) since the C1
  scaffold on BOTH platforms, and neither implemented it. Worse than missing: a
  path carrying `?…` was handed to `matchPath` whole, so `/users/42?tab=a`
  captured `id == "42?tab=a"` and a static route stopped matching altogether.
  Every deep link with a query string — an OAuth callback, a shared link — hit
  that, on iOS and Android alike.

  Both routers now parse the query alongside `params`, in the same step, so the
  two always describe one navigation. New surface, identical on each side:
  `query`, `setQueryParam(key, value)` (replace semantics — changing a filter must
  not add a back-stack entry per keystroke), plus `splitPathAndQuery` /
  `parseQuery` / `serializeQuery`. `parseQuery` follows `URLSearchParams`: a bare
  key is present-with-empty-value, a repeated key keeps the last. `serializeQuery`
  sorts, so the rewritten URL is stable. The query survives an unmatched path — a
  404 page usually needs the parameters it was called with.

  ## `useUrlState` lowers to the native router's search parameters

  `const q = useUrlState('q', 'all')` now binds one search parameter on iOS and
  Android, from the same source: `q()` reads and `q.set(v)` writes, exactly as on
  the web. Built on the router `query` support above.

  The helper type is emitted INLINE rather than shipped as a co-located runtime,
  because it needs the ACTIVE router — a standalone runtime would have to import
  PyreonRouter and stop being self-contained. Same reasoning as `PyreonSchemaError`.

  Scope: string-valued keys with literal arguments. A non-string default declines
  WITH a reason rather than coercing silently, and a non-literal key declines
  because it cannot be baked into the emit — the conservative rule `useFetch`
  applies to its URL and `useStorage` to its key. History entries, `popstate`,
  `batchUrlUpdates` and the pluggable serializers stay web.

  ## `<Transition name>` resolves to a native transition instead of always fading

  The native `<Transition>` emit ignored `name` and animated every show/hide as a
  fade. An author who wrote a slide-up got a fade on device — and because an
  animation still played, nothing looked broken enough to investigate.

  `name` is the Vue-style prop `@pyreon/runtime-dom`'s Transition already honours
  on the web, and `@pyreon/kinetic` ships its presets under the same vocabulary,
  so it is the one shape an author writes once. `fade` · `scale-in` · `slide-up` ·
  `slide-down` · `slide-left` · `slide-right` now map to SwiftUI transitions and
  Compose enter/exit pairs respectively. An unknown name still falls back to a
  fade — a custom CSS animation has no native translation, and a fade beats
  refusing to compile — and a `<Transition>` with NO name emits byte-identically
  to before.

  `kinetic()` itself stays web: the chainable class/style factory has no native
  model. What crosses is the preset vocabulary.

  ## An unlowered package's diagnostic names ITS alternative

  `@pyreon/table` was told it "renders via the DOM / a browser-only library".
  TanStack Table is HEADLESS — that claim is simply false — and the message
  stopped short of naming the native answer this package's own manifest states.

  It now says the real thing: the row model (`getRowModel` / `getVisibleCells` /
  `flexRender`) is a WEB render surface with no native analogue, while sort and
  filter state is ordinary logic to hold in signals and render with
  `<For each={rows}>` + `@pyreon/primitives`.

  The hook arc now reads the same per-package advice, so this improves every
  package that has an entry (rx, validate, permissions, storage, http, table) —
  not just the one that surfaced it.

### Patch Changes

- [#2704](https://github.com/pyreon/pyreon/pull/2704) [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration).

- [#2759](https://github.com/pyreon/pyreon/pull/2759) [`a6e9c1a`](https://github.com/pyreon/pyreon/commit/a6e9c1a428aaec7de6d6ecd76e7601d2c7f41b48) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Test-infrastructure only — no runtime or consumer-facing behavior change. The happy-dom spec-parity `hashchange`-echo guard (happy-dom fires a deferred synthetic `hashchange` for hash-changing `history.pushState`/`replaceState`; real browsers never do) was extracted from `@pyreon/router`'s test setup into the shared internal `@pyreon/test-utils` and installed in every suite that drives a real router in happy-dom: router (unchanged behavior), a11y (fixes a load-dependent CI flake where a stale echo made the route announcer fire for a traversal the test never made, plus a deterministic regression spec), and testing's own suite (internal devDep on the private `@pyreon/test-utils`; the shipped `/vitest` setup module is unchanged).

- [#3674](https://github.com/pyreon/pyreon/pull/3674) [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Documentation-only: filled in manifest `api[]` gaps against each package's real `src/index.ts` exports. No runtime behavior changes.

  Notable additions: `@pyreon/hooks`'s 10 web-half hooks that had no manifest entry (`useGeolocation`, `useMap`, `useWebSocket`, `useAuth`, `usePush`, `usePayments`, `useDatabase`, `useCrashReporter`, `useAppState`, `setCrashTransport`); `@pyreon/http`'s typed error hierarchy, URL/transport utilities, and `defineEndpoint`; `@pyreon/router`'s active-router, link-classification, redirect-safety, and loader-serialization utilities; `@pyreon/reactivity`'s `registerSingleton`/context-owner APIs and `defineCrossModuleState`; `@pyreon/core`'s `Defer`, `registerErrorHandler`/`reportError`, `isClient`/`isServer`; `@pyreon/zero`'s theme system, locale runtime, `Meta`, typed-routes codegen, and `generateRssFeed`; `@pyreon/zero-content`'s remaining docs components (`Details`, `Tabs`, `PropTable`, `APICard`, `CompatMatrix`, `PackageBadge`, `Mermaid`, `Math`, `Sidebar`, `Breadcrumbs`, `PrevNext`, `Toc`, `Playground`, `Search`/`useSearch`, `getEntry`/`getEntries`); `@pyreon/form`'s `<Form>`/`<Submit>` components; smaller additions to `@pyreon/store`, `@pyreon/validate`, `@pyreon/validation`, `@pyreon/a11y`, `@pyreon/i18n`, `@pyreon/code`, `@pyreon/feature`, `@pyreon/charts`, `@pyreon/hotkeys`, `@pyreon/virtual`, `@pyreon/sync`, and `@pyreon/server`.

  Also corrected an inaccurate claim in `@pyreon/zero`'s `i18nRouting` manifest entry: it said components read the detected locale via `createLocaleContext`, but nothing in the framework reads `req.__localeContext` back out today — the working app-facing API is `useLocale()`/`setLocale()`. Verified `@pyreon/reactivity`'s `onCleanup` documentation is accurate (not outdated as initially suspected) via `effect.test.ts`'s explicit "onCleanup outside an effect is a silent no-op" test.

  `packages/tools/mcp/src/api-reference.ts` is the generated output of `bun run gen-docs` reflecting the above.

- [#3634](https://github.com/pyreon/pyreon/pull/3634) [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Signal-driven props now stay live on `<Dynamic>`, `<VisuallyHidden>`, `<LiveRegion>` and `<SkipLink>`. Each destructured its props, which reads every getter-backed prop once at setup: the documented `<Dynamic component={components[current()]} />` never switched component, and forwarded attributes (and `LiveRegion`'s `politeness`, `SkipLink`'s `href`) froze at their first value. They now use `splitProps`/`mergeProps`. A static `component` on `<Dynamic>` still renders a plain node; a reactive one renders through an accessor so a change remounts the new component (SSR and hydration verified).

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

- Updated dependencies [[`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`d5f19b9`](https://github.com/pyreon/pyreon/commit/d5f19b9700962305b1cc4fd0e5da603ec884e759), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9045709`](https://github.com/pyreon/pyreon/commit/9045709020995c37692eb2a9a6ecd65f6b8c6e30), [`57b94ed`](https://github.com/pyreon/pyreon/commit/57b94ed8cd4b2aa9d5bd16e52d39edcdb7056c62), [`1c70f68`](https://github.com/pyreon/pyreon/commit/1c70f68b69a7e9f60eb7d565bf8797a155353743), [`99a1888`](https://github.com/pyreon/pyreon/commit/99a188821c005c4750c3daf98fd2d0863a0e3b58), [`e56abb6`](https://github.com/pyreon/pyreon/commit/e56abb6b44873164473b085e0e64838e7d9e7012), [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b), [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93), [`96426be`](https://github.com/pyreon/pyreon/commit/96426bef7ac3c86cf60ab898813dde449b1b0954), [`b7bd8e8`](https://github.com/pyreon/pyreon/commit/b7bd8e86a8eb9f5fbcd3e145f467e0789ab6c3d0), [`9f02726`](https://github.com/pyreon/pyreon/commit/9f0272677bd083fb50998335257e31e44766e85d), [`cc455e8`](https://github.com/pyreon/pyreon/commit/cc455e84d9ed7d682d963d44b25cd3c4bb89c7c8), [`6a7c0f1`](https://github.com/pyreon/pyreon/commit/6a7c0f1bb21f285fce47fe67492ce9a14c20fd6a), [`a6e9c1a`](https://github.com/pyreon/pyreon/commit/a6e9c1a428aaec7de6d6ecd76e7601d2c7f41b48), [`cf50c79`](https://github.com/pyreon/pyreon/commit/cf50c79668fa46510df17f76906520c53d6e0e4a), [`f2194d5`](https://github.com/pyreon/pyreon/commit/f2194d544ca7fc10dcc64b2aeb1c97dc923eabfe), [`e6b70a5`](https://github.com/pyreon/pyreon/commit/e6b70a5c80ed7c9f338a6a750296ebe89e9dd9c2), [`cbd6459`](https://github.com/pyreon/pyreon/commit/cbd6459970423b7f7d94883685ae7c753895f1d9), [`ce819ca`](https://github.com/pyreon/pyreon/commit/ce819cadd41f50af25200da1cc130a35c52ab523), [`ea4e50a`](https://github.com/pyreon/pyreon/commit/ea4e50ab7d97d84f2bd5518ea747280c34805611), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`d114ff8`](https://github.com/pyreon/pyreon/commit/d114ff8c83ac98acb0c421d0ee3217e43d4d713b), [`50d9324`](https://github.com/pyreon/pyreon/commit/50d93245d8e28ba0a3c8217bd83a50d3dd6719d3), [`317367a`](https://github.com/pyreon/pyreon/commit/317367a9ade57b9aefd036441ebb397c8e3d1dc2), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`773f9df`](https://github.com/pyreon/pyreon/commit/773f9dfaafaed05a06b252b1f83a0f7d970dbb8d), [`3dba9dc`](https://github.com/pyreon/pyreon/commit/3dba9dceec5dc96c34686b70604b6d79939655a2), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e44dcc7`](https://github.com/pyreon/pyreon/commit/e44dcc7124a5617f95ddb69786be262a35280d5f), [`768f104`](https://github.com/pyreon/pyreon/commit/768f104018ced7568dde1c99990a21c273e924ec), [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760), [`0e434c8`](https://github.com/pyreon/pyreon/commit/0e434c89a2d317a2862d56cc8d1e623a68d9b332), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`80e2ce2`](https://github.com/pyreon/pyreon/commit/80e2ce2a77551338b3bf58c5bb6ef88236e5e285), [`6b84f8a`](https://github.com/pyreon/pyreon/commit/6b84f8aeca2303abb29e4a70b35cc664f790d256), [`db410a0`](https://github.com/pyreon/pyreon/commit/db410a0c599fde5df971c2d4ba3d95e18f7f62fb), [`a0611c4`](https://github.com/pyreon/pyreon/commit/a0611c4d5a9afa2472502f5d932e1ac152861e1e), [`b030408`](https://github.com/pyreon/pyreon/commit/b0304087973b540fa75fc0d627fd3a1dd120d1c1), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`9593fbc`](https://github.com/pyreon/pyreon/commit/9593fbc44375cc00f57865790a798bd53e479551), [`24c4019`](https://github.com/pyreon/pyreon/commit/24c4019d3e2527bf063d65d62bf574b00965d1e4), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`d0e57b2`](https://github.com/pyreon/pyreon/commit/d0e57b27ccbf9b4b90521235186a003f3d6bc3ca), [`fabd888`](https://github.com/pyreon/pyreon/commit/fabd888ac865155a5af687f1706bf918c6419f19), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`5438e9a`](https://github.com/pyreon/pyreon/commit/5438e9a7496e4c6e5dac43bc03ab90459d147a59), [`5af143d`](https://github.com/pyreon/pyreon/commit/5af143d746be81a4a0d688243f123d532c455553), [`2bef24d`](https://github.com/pyreon/pyreon/commit/2bef24df3d5c86d709509906d4d1e831357b41c6), [`f4e9268`](https://github.com/pyreon/pyreon/commit/f4e9268a750318ceb5f7d2dc40c185a53e6b5299), [`c26fcef`](https://github.com/pyreon/pyreon/commit/c26fcef861ec794ca7f0e0b2163d84f7b58c0866), [`214097a`](https://github.com/pyreon/pyreon/commit/214097ae90b62dcc59d5b098b027fb5c39055c74), [`127e5d6`](https://github.com/pyreon/pyreon/commit/127e5d65cd2a3cea8457a1bd6f397b75c0ad4597), [`50caf2d`](https://github.com/pyreon/pyreon/commit/50caf2d3f97fefa7afa6105e38c7f5940c427b5d), [`c7feb0b`](https://github.com/pyreon/pyreon/commit/c7feb0b726ea78ef7b6a4d3a17e8ae85df471a67), [`dc580fc`](https://github.com/pyreon/pyreon/commit/dc580fc13327c7a1ca1f23dc0ee5c25921470d1e), [`b263f82`](https://github.com/pyreon/pyreon/commit/b263f82effa16d780f47f5d87f8d4a7a2f77602e)]:
  - @pyreon/core@0.52.0
  - @pyreon/router@0.52.0
  - @pyreon/reactivity@0.52.0

## 0.51.0

### Patch Changes

- Every package manifest now declares its MULTIPLATFORM story as data: (4e53471)
  `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
  (a discriminated union — `web-only` REQUIRES the rationale sentence). The
  assignments transcribe the classification the multiplatform docs and the PMTC
  compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
  `check-multiplatform-tier` gate (validate-fast family) holds the contract:
  a manifest without a tier, a published package with neither manifest nor
  explicit exemption, a `web-only` without a rationale, or a stale generated
  tier table all fail CI — so a new package can never again silently default
  to web-only while the ecosystem advertises "one codebase, three targets".

  No runtime change in any package: manifests are docs-pipeline inputs and are
  stripped from published tarballs; every generated surface (llms, MCP
  api-reference, reference pages) is byte-identical.

- Updated dependencies:
  - @pyreon/reactivity@0.51.0
  - @pyreon/core@0.51.0
  - @pyreon/router@0.51.0

## 0.50.0

### Patch Changes

- [#2458](https://github.com/pyreon/pyreon/pull/2458) [`24df62e`](https://github.com/pyreon/pyreon/commit/24df62ee3e27d1cc624f627c1277fbed4866e91e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Focus-management hardening (audited a11y gaps):

  - **`useFocusTrap` upgraded to focus-scope quality.** Concurrent traps now form a scope STACK — one shared pair of document listeners, only the most recently activated trap whose container exists handles events, and deactivating/unmounting it reactivates the trap beneath (stacked modals no longer fight over the same Tab event). NEW focusin containment: a programmatic `.focus()` or mouse click that lands focus outside the container is recaptured back in (Tab-only trapping missed those escapes); the recapture is microtask-deferred and re-checked so a close flow that restores focus + unmounts in the same flush is never fought. `initialFocus: true` now prefers a `[data-autofocus]` descendant over the first tabbable. Existing call shapes (`useFocusTrap(getEl)`, positional `active`, options object) are unchanged.
  - **New `useInertOthers(getEl, options?)` hook** — applies the native `inert` attribute to every sibling subtree outside the given element (walking up to `document.body`), making `aria-modal="true"` actually true for sighted keyboard users AND assistive tech. Exact-restore on cleanup (elements that were already `inert` stay inert), per-element refcount so stacked overlays never un-inert what an outer overlay still needs, live regions (`[aria-live]`) skipped so announcements keep working, reactive application via a signal-backed getter.
  - `@pyreon/ui-primitives` `ModalBase` (private) now wires `useInertOthers` behind its open lifecycle and arms its focus trap in OPEN order.
  - `@pyreon/a11y` README: documents the shipped `<LiveRegion>` + `<SkipLink>` (previously absent) and the `<RouteAnnouncer>` ↔ `RouterView announceRouteChanges` double-announcement overlap.

- Updated dependencies [[`f3f5d3b`](https://github.com/pyreon/pyreon/commit/f3f5d3b70d2bd19b23b802ea21ad8ba9d5e416a7)]:
  - @pyreon/core@0.50.0
  - @pyreon/reactivity@0.50.0
  - @pyreon/router@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [[`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85), [`d935083`](https://github.com/pyreon/pyreon/commit/d935083033edd2c0e74c8fa71e46d9dfcdb661e7)]:
  - @pyreon/core@0.49.0
  - @pyreon/router@0.49.0
  - @pyreon/reactivity@0.49.0

## 0.48.0

### Patch Changes

- [#2369](https://github.com/pyreon/pyreon/pull/2369) [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Whole-class bundle-size fix: every module-level `nativeCompat(X)` STATEMENT (28 sites across 16 packages) converted to the `/* @__PURE__ */` assignment form. Inside a built lib's shared chunk the bare statement is an unremovable side effect that retains the component's body in every consumer bundle that never imports it — measured ~1.2KB gz of dead transition machinery in a mount-only app from runtime-dom's three sites alone; the sweep applies the same fix to ErrorBoundary, HeadProvider, Router components, RouteAnnouncer, Form components, providers across i18n/permissions/query (6 sites)/toast's Toaster, and the ui-system providers. Marker semantics are unchanged (`nativeCompat` returns the same fn; live-probed and locked by the existing native-marker suites). Two new locks: a lib-level tree-shake spec (mount-only bundle must not contain transition machinery, with a positive control) and a repo-wide census guard that fails on any new bare statement.

- Updated dependencies [[`0ba8da3`](https://github.com/pyreon/pyreon/commit/0ba8da3c22bdf722b5f6a6aea11ee7a9e53a2e7d), [`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`c3dab73`](https://github.com/pyreon/pyreon/commit/c3dab7368cb22ea2229b5d5a03e7f86b94098cd6), [`c1f398a`](https://github.com/pyreon/pyreon/commit/c1f398aff02411a49c922902be7721a253ba2443), [`068754c`](https://github.com/pyreon/pyreon/commit/068754caba2fbea93a794342f6d6ccdf87d047c1), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/router@0.48.0
  - @pyreon/reactivity@0.48.0
  - @pyreon/core@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715)]:
  - @pyreon/core@0.47.0
  - @pyreon/reactivity@0.47.0
  - @pyreon/router@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [[`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04), [`f807c5e`](https://github.com/pyreon/pyreon/commit/f807c5e4e1f64da2a1786b1c3578861c77749d8d), [`cfb2862`](https://github.com/pyreon/pyreon/commit/cfb2862480f48fa3eeaf647e17e25c70e8bb5a3d), [`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`33d9b55`](https://github.com/pyreon/pyreon/commit/33d9b555bb501b4341c1c5cc92400b162323ced5), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435), [`6164409`](https://github.com/pyreon/pyreon/commit/6164409767c2b7a9668a004ab085406ae8e2178b)]:
  - @pyreon/router@0.46.0
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0
  - @pyreon/router@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`28fbd77`](https://github.com/pyreon/pyreon/commit/28fbd7799f015503d45c8642d8822bff64e9e155), [`9ef1b14`](https://github.com/pyreon/pyreon/commit/9ef1b1422313b49a020b7deb1ffa0871a5cc012a), [`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/router@0.44.0
  - @pyreon/reactivity@0.44.0
  - @pyreon/core@0.44.0

## 0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0
  - @pyreon/router@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/router@0.42.0
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0
  - @pyreon/router@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`d61d3d9`](https://github.com/pyreon/pyreon/commit/d61d3d9e3acb483b1b5fa8b79f23c03c309ab2c5), [`0ea9c60`](https://github.com/pyreon/pyreon/commit/0ea9c6006f19489eb42af9146b790ff826f2a0a3), [`0dc1f13`](https://github.com/pyreon/pyreon/commit/0dc1f1379434bbc855ee4e7a7a585759dfc2836e), [`8a7bff0`](https://github.com/pyreon/pyreon/commit/8a7bff0dda93f15afbee9a0d9ab040e2e8969ff0), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0
  - @pyreon/router@0.40.0
  - @pyreon/core@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a), [`8e8a0de`](https://github.com/pyreon/pyreon/commit/8e8a0de48a1c4aba4e09fc8e72fb72bc0c1ec68e)]:
  - @pyreon/reactivity@0.39.0
  - @pyreon/router@0.39.0
  - @pyreon/core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/core@0.38.0
  - @pyreon/router@0.38.0

## 0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0
  - @pyreon/router@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0
  - @pyreon/router@0.36.0

## 0.35.0

### Minor Changes

- [#1813](https://github.com/pyreon/pyreon/pull/1813) [`7a97c3e`](https://github.com/pyreon/pyreon/commit/7a97c3e3e64b2dab0fd9cc135a319270651ce19a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `<LiveRegion>` — a declarative `aria-live` region, the persistent and reactive complement to the imperative `announce()`. Place it once in your tree and drive its children with a signal; the browser announces every content change automatically (no `announce()` call, no effect to wire) — for status that lives somewhere specific in the layout: a form's validation summary, a "Saving…" → "Saved" indicator, an async result count, a connection-status banner. Screen-reader-only by default (reuses `VisuallyHidden`'s clipping); pass `visible` for status text that should also be seen. `politeness` accepts `'polite'` (default → `role="status"`), `'assertive'` (→ `role="alert"`), or `'off'` (silences without unmounting). Renders on the server too, so the region exists at hydration and the first reactive update is announced. SSR-safe.

- [#1765](https://github.com/pyreon/pyreon/pull/1765) [`8116eaf`](https://github.com/pyreon/pyreon/commit/8116eaf7c0a5dd1953b13da7655a06b3d8cc39b4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `<RouteAnnouncer>` + `useRouteAnnouncer()` (new `@pyreon/a11y/router` subpath) — announce client-side route changes to screen-reader users, closing the canonical SPA accessibility gap (single-page navigations change the URL + DOM but fire no page-load event, so assistive tech never announces the new page).

  Drop one `<RouteAnnouncer />` near the router root: it registers a single router `afterEach` hook that pushes the destination route's `meta.title` (or `"Navigated to <path>"`) to a polite `aria-live` region via the zero-setup `announce()`. Customize the message with a `format` callback; opt into `assertive` politeness, `clearAfter`, or `announceInitial` as needed.

  The router integration lives in the `@pyreon/a11y/router` subpath (with `@pyreon/router` as an **optional** peer dependency), so the base `@pyreon/a11y` entry stays router-free for consumers who only use `announce()` / `<VisuallyHidden>` / `createA11yId` — the `@pyreon/i18n` vs `@pyreon/i18n/core` split precedent. SSR-safe (the hook registers only in `onMount`; `announce()` no-ops on the server).

- [#1798](https://github.com/pyreon/pyreon/pull/1798) [`8f51ac7`](https://github.com/pyreon/pyreon/commit/8f51ac7e381a91eedf0412368bfa9e47d753c6c6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `<SkipLink>` — a keyboard "skip to content" link (WCAG 2.4.1 Bypass Blocks). Render it as the first focusable element on the page: it stays clipped out of view until focused (first Tab), then appears at the top-left, and activating it moves BOTH scroll and keyboard focus to the target landmark (default `#main`) — adding a programmatic-focus `tabindex` automatically when the target isn't natively focusable. A `style` object merges over the built-in reveal styles to restyle the focused appearance without losing the hide-until-focus behavior.

- [#1743](https://github.com/pyreon/pyreon/pull/1743) [`4c021f1`](https://github.com/pyreon/pyreon/commit/4c021f17e3405e34f71a8266ab1dda45d99ff100) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New package `@pyreon/a11y` — zero-setup accessibility primitives:

  - **`announce(message, options?)`** — speak status updates and errors to
    screen readers via an `aria-live` region created lazily on first call. No
    provider, no component to mount; SSR-safe (no-op on the server). `polite`
    (default, queued) / `assertive` (interrupts) politeness, optional
    `clearAfter`, and identical consecutive messages re-announce (clear-then-set).
  - **`<VisuallyHidden>`** — content invisible on screen but kept in the
    accessibility tree (unlike `display:none` / `hidden`).
  - **`createA11yId(prefix?)`** — stable, SSR-safe ids for ARIA relationship
    attributes (`aria-labelledby` / `aria-describedby` / `for`).

  The shared foundation other Pyreon packages build on for out-of-the-box
  accessibility (router announcements, form field wiring, etc.).

### Patch Changes

- Updated dependencies [[`06971cc`](https://github.com/pyreon/pyreon/commit/06971cc33850a70dbf5ab335e491a535823dd576), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`af85ce3`](https://github.com/pyreon/pyreon/commit/af85ce3dfc590db06838834c32d88f434e7f2769)]:
  - @pyreon/router@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0
