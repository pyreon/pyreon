---
title: "SSR-rendering Mistakes"
description: "Common ssr-rendering mistakes in Pyreon and how to fix them."
---

# SSR-rendering Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### [FIXED, 2026-11] A process-wide counter used to mint ids that must match across the server render and hydration (`createUniqueId`).

One module-level counter, never reset: the server's kept growing across requests, the client's restarted at 0 on every page load, so the `id` in the server HTML and the id the hydrated component held in its closure were different strings (`aria-controls="pyreon-2-listbox"` against a listbox that later rendered `pyreon-7-listbox`); `_resetIdCounter` had no caller and two concurrent renders shared one counter. **Fix: the counter is a CONTEXT value** (`IdScope`), not module state. The server seeds each request stack with a fresh page scope (`_requestIdFrame`, in `renderToString`, `runWithRequestContext` and `renderToStream`), so every request counts from 1; the client's default scope starts at 0 on a page load, so both count the same components in the same synchronous order. **An island is the case a counter alone cannot solve**: it hydrates later as a SEPARATE root, so the page's walk never reaches its subtree, and the server's page counter had advanced through it. Each island therefore gets its own namespace (`pyreon-i1-…`, taken in document order BEFORE the loader awaits, so a slow chunk cannot reorder it), written to `data-id-prefix`; `_IslandIds` provides it around the island on the server and around the island's root when it hydrates. No per-component cost: only `createUniqueId` reads the scope. **Known limit, stated rather than hidden**: it holds while the components that call it render in the same order on both sides; a streamed Suspense boundary that resolves out of order is the exception. **A bare `hydrateRoot` counter reset was rejected** — islands hydrate as separate roots against one server sequence, so a reset collides them. Reference: `packages/core/core/src/props.ts` (`IdScope`, `_requestIdFrame`, `_IslandIds`), `core/server/src/{island,client}.ts`; locks `runtime-dom/src/tests/unique-id-hydration.test.tsx` (per-request, concurrency, SSR→hydrate), `server/src/tests/island-ids{,-hydrate}.test.ts` — bisect-verified (ignoring the scope fails three specs; ignoring `data-id-prefix` on hydrate fails with `expected [ 'pyreon-4' ] to deeply equal [ 'pyreon-i2-1' ]`).

---

### [FIXED, 2026-11] A client that adopts server markup by a marker the server never writes duplicates instead of hydrating

(`@pyreon/head`). `dom.ts` seeds its managed set from `[data-pyreon-head]`, but the SSR serializer emitted bare tags, so every hydrated page (pyreon.dev included) held two of each `<meta>`/`<link>`/JSON-LD `<script>`: the static HTML was right, and nothing failed. **Rule: an adoption key is a contract with two halves; define it once in a module both import (`HEAD_ATTR` in `head/src/context.ts`, so the client never imports the serializer) and test it by running the SERVER output under the CLIENT in a real browser.** Locks: `head/src/tests/head.browser.test.tsx` ("hydrating over server-rendered head tags"), `e2e/ssr-showcase.spec.ts` ("head tags after hydration"), and the marker test in `head.test.ts`.

---

### A cursor that skips a byte-ambiguous node unconditionally cannot honour a client child that IS that node — decide by the VNODE, never the DOM

(hydration whitespace, #3832). `firstReal`/`nextReal` skip whitespace-only text because server formatting whitespace is ignorable, but SSR of an explicit `{' '}` emits the SAME bytes, so `<First/>{' '}<span/>` skipped the server's space, warned `expected TextNode, got 1` and inserted a duplicate. The DOM cannot disambiguate; only the parallel vnode walk can. **Fix**: a whitespace-only text vnode looks BACK (`skippedWhitespaceBefore`) for the node the cursor walked past, adopts it (splitting a parser-merged run), and marks it in a `WeakSet` so no later whitespace vnode re-claims it; every other vnode keeps skipping. Walk back over formatting comments AND empty text nodes — `isWhitespaceOnly('')` is vacuously true, and hydration itself inserts empty nodes for `''` children (the fuzzer found this on its first run). Pure compiled templates were never affected (the verifier's template match already tolerates their baked whitespace); only the h()/component walk was. **Detection lesson: the parity fuzzers could not have caught it — the grammar's text pool had no whitespace-only string.** A differential fuzzer is only as strong as its INPUT alphabet; add the byte-ambiguous values (` `, `\n`, `\t`, empty) to every text pool. Reference: `runtime-dom/src/hydrate.ts:skippedWhitespaceBefore`; locks `hydrate-explicit-whitespace{,-compiled}.test.tsx` (bisect-verified: 29/42 fail on revert) + both parity fuzzers at 5000 seeds.

---

### [FIXED, 2026-09] `<Suspense>` saw only its DIRECT child; a boundary that REPLACES its content to suspend for a nested descendant tears down the descendant's ancestors.

A lazy nested inside the content never triggered the fallback. The naive fix — the boundary's accessor returns the fallback while a registered descendant is pending — unmounts every ancestor of that descendant (state lost, setup and `onMount` run twice, and it can only be discovered by mounting first). The fix keeps the content MOUNTED and moves its DOM range into a detached fragment while the fallback shows (`core/src/suspense-attach.ts`, reached by runtime-dom through the `Symbol.for('pyreon:suspense-attach')` handler on the component), the Vue model; every Pyreon boundary resolves its live parent through its own marker, so off-screen content stays reactive. Descendants register with the nearest boundary through context (`SuspenseBoundaryContext`). Second trap in the same change: the fallback is mounted into a LIVE parent, where `mountChild` hands back a no-op remover at `_elementDepth > 0` — bracket it and remove explicitly (the Portal-dispose rule). Locked by `suspense-nested.test.tsx` + a Chromium off-screen spec, bisect-verified.

---

### [FIXED, 2026-09] A hydration cursor that doubles as the insert anchor goes stale once range adoption consumes it

`hydrateMountHole` passes the hole's cursor as BOTH `domNode` and `anchor`. A trailing `<Suspense>` absorbed into `_mountChild` (`templatizeComponentChildren`, default-on) had no `next`, so it inserted its `/suspense` end marker before `anchor` — the `<!--$-->` its own range adoption had just removed → `NotFoundError`, the component failed to hydrate and its content vanished. Rule: after a walk that may REMOVE nodes, re-validate any reference before using it as an insertion point; `anchor` is only an end delimiter while it is a LATER live sibling (`anchor !== domNode && anchor.parentNode === parent`), else append (a hole is trailing). Found only by the playground e2e. Reference: `runtime-dom/src/hydrate.ts:hydrateComponent` + `tests/suspense-mount-hole-hydrate.test.tsx` (bisect-verified).

---

### [FIXED, 2026-09] A still-loading `lazy()` rebuilt its server range at hydration, and a boundary that SUBSCRIBES to its child's loading state remounts it on load.

The server waits for every lazy, so its HTML holds real content; the client chunk usually has not landed when `hydrateRoot` runs. The lazy's first client render was nothing, so the range was discarded (identity, focus, typed input lost) — and a bare core `lazy()` never rendered at all afterwards, because its wrapper read `loaded()` once in a component body. Two layers had to change. (1) The lazy PROTOCOL is the oracle a generic accessor lacks: a type with `__load` reporting pending (`__pending ?? __loading`) over a `<!--$-->` range is not run; the range is skipped and hydrated once `__load()` settles, inside the context owner captured at the walk (`hydrate.ts:hydrateDeferredLazy`). The lazy's output became an ACCESSOR to give it that range on the server. (2) `<Suspense>` must render the child during a walk AND not read `__loading()` there — a tracked read re-runs the accessor on load and REMOUNTS the child over the nodes it just adopted; a VNode is not identity-skipped by `mountReactive`. **Rule: a reactive parent of a deferred-hydration child must not subscribe to the state the deferral waits on.** Locked by `runtime-dom/src/tests/lazy-hydration-deferred*.tsx`, the lazy arm of `hydration-parity-fuzz.test.tsx`, and a real-Chromium typed-input spec (all bisect-verified).

---

### [FIXED, 2026-09] A security gate placed AFTER the endpoints it guards, or matched on a path that includes the query.

Zero's `createServer` mounted API routes, actions, island fragments and the `/_pyreon/data` single-fetch endpoint BEFORE route and app-wide middleware, and matched route middleware against `ctx.path` (`pathname + search`). So `/admin?x=1` skipped `/admin`'s auth middleware, `/_pyreon/data?path=/admin` returned its serverLoader data with no middleware at all (every client-side navigation takes that path), and the documented `rateLimitMiddleware({ include: ['/api/*'] })` never ran for `/api`. **Rules: (1) middleware that can refuse a request runs before every handler that can answer one; (2) match on the pathname, never on a string that carries the query; (3) an endpoint that serves data FOR another path (a data/fragment/preview endpoint) must be gated by THAT path's middleware.** The same audit found the sibling "the build and the runtime disagree" class: the generated server entry could not import `vite.config.ts`, so `zero({ mode: 'isr', base, routeRules })` shaped the build and did nothing in production — fixed by injecting the serializable config as a define (`__ZERO_SERVER_CONFIG__`). Why it shipped: every gate ran dev servers, unit calls or node-invoked functions, and the one production e2e asserted "same HTML twice", which uncached SSR also satisfies. Reference: `packages/zero/zero/src/entry-server.ts:routingPathname` + `server-config.ts`; locked by `tests/request-pipeline.test.ts` and the `ssr-node`/`isr-node` e2e guarded-route + `x-isr-cache` specs (all bisect-verified).

---

### Quantified regex over an ambiguous character class is polynomial ReDoS

`/^[\u0000-\u0020\s]+|[\u0000-\u0020\s]+$/g` looks like a safer `trim()` but is O(n²), because `\u0000-\u0020` already contains every `\s` character below U+0080, so the engine retries from every position. A hardening function is the worst place for this: its input is attacker-supplied by design (here a `?next=` redirect target on every SSR redirect).
  - Keep every quantified class unambiguous (no member reachable two ways).
  - For a leading/trailing scan, prefer an index walk: `while (i < end && s.charCodeAt(i) <= 0x20) i++` cannot backtrack. `<= 0x20` is also exactly the "C0 control or space" set the URL parser strips.
  - Numeric attributes have the same trap: optional punctuation between two digit runs, or optional units between two whitespace runs. Trim and strip units separately, then use disjoint decimal alternatives and reject non-finite values. Native Flow SVG locks this with a bounded worker through the published API (`flow-svg-number-regressions.test.ts`).
  - A CodeQL check reporting "New alerts in code changed by this pull request" is never a pre-existing alert; read the annotation.
  - Fix: `packages/core/router/src/redirect.ts:normaliseTarget`. Test: `router/src/tests/redirect-normalisation.test.ts`.

---

### An unanchored "opener, negated run, closer" regex is quadratic when the closer is missing

In `/<[^>]+>/g`, `/!?\[([^\]]*)\]\([^)]*\)/g` or `/\{([^}]*)\}/g` the negated class admits the OPENER, so on `'['.repeat(1e5)` every opener scans to the end, fails, and the engine retries at the next one (4 s). The same shape: `/([A-Za-z][\w-]*)=…/g` retries at every letter of a long run, and `^\s*` under `m` restarts at every line start and sweeps all following blank lines (`\s` contains `\n`). Markdown, code-fence meta and frontmatter are author content and may come from contributors or a CMS.
  - Bound line-start runs to one line: `[^\S\n\r\u2028\u2029]*` (`\r` and U+2028/9 are line starts under `m` too, so excluding only `\n` stays quadratic on CR input).
  - For delimited spans, use a scanner that remembers the next closer (no closer after one opener means none after any later one): `zero-content/src/_shared/linear-scan.ts`. Prove a rewrite exact with a seeded differential against the old regex plus a real-content corpus, and lock it with a 1e5-character timing case that fails on the old regex: `zero-content/src/tests/_linear-scan-equivalence.test.ts`.

---

### URL guard that classifies the handed string, not the browser-preprocessed one

The WHATWG URL parser first strips leading/trailing C0 controls and space, then removes all ASCII tab/newline from anywhere. `trim()` covers neither fully, so `"\u0000//evil"` and `"/<TAB>/evil"` resolve off-origin, and `"java<TAB>script:alert(1)"` resolves to a live `javascript:` URL.
  - Normalise exactly as the consumer does, then return the normalised value — inspecting one string and returning another is a bypass by construction.
  - Use the platform URL parser as the test oracle, not a hand-written table.
  - Fix: `packages/core/router/src/redirect.ts:normaliseTarget` (used by `classifyRedirectTarget`). Test: `router/src/tests/redirect-normalisation.test.ts`.

---

### `</`-only escaping of JSON in an inline `<script>` is bypassable

`<!--` followed by `<script` puts the tokenizer in script-data-double-escaped state without any slash, so `<!--<script>alert(1)//` survives. Raw U+2028/U+2029 in JSON are line terminators in a script and cause a `SyntaxError`.
  - For DATA (JSON): `.replace(/</g, '\\u003C').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')`. `JSON.parse` round-trips it byte-identically.
  - For CODE (raw JS source): escape only `</`. `\u003C` in raw JS breaks every `<` operator. The `scriptSafe` helpers in `packages/fundamentals/{code,charts,rich-text,flow}/src/webview.ts` are correct as they are.
  - `__PYREON_LOADER_DATA__` (`html.ts`, `render-page.ts`) and `__PYREON_STORE_STATE__` (`render-page.ts`) all go through `stringifyLoaderDataForScript` (which wraps `stringifyLoaderData`) in `packages/core/router/src/loader.ts`. So does `@pyreon/atlas`'s `bakedRpcScript` (`build/bake.ts`, the static-site RPC payload: component names and answers are user-shaped).
  - Tests: `router/src/tests/loader.test.ts` (`inline-<script> context escaping (security)`), `server/src/tests/server.test.ts` (`buildScripts neutralises the <!--<script> script-data bypass`).

---

### JSON interpolated into an executable script is a JS object literal, not JSON

In `<script>window.X=${json}</script>` a `"__proto__":` key SETS THE PROTOTYPE instead of creating the key. A user-keyed map holding that key (usernames, tags, slugs, uploaded JSON) loses it on the client and every missing-key lookup inherits its fields, while a `res.json()` reader of the same data keeps it, so SSR-hydrated and client-navigated pages disagree.
  - Emit the key as the computed `["__proto__"]` (an ordinary own property in a literal), only for KEY tokens, never inside string contents: `stringifyLoaderDataForScript` in `packages/core/router/src/loader.ts`. Output without that key is byte-identical to the JSON. Keep `stringifyLoaderData` (JSON text) for JSON responses and `type="application/json"` blocks, which `JSON.parse` reads correctly.
  - Lock: `server/src/tests/script-embed-oracle.test.ts` — a seeded fuzz that parses every embed with parse5 (no breakout element) and EVALUATES each script, asserting the same own keys and only standard prototypes at every depth.

---

### Per-key registry caching resolved values leaks across SSR requests

A module-level `Map` keyed by a user key (`defineStore('cart')`, `useCookie('session')`, `Model.asHook('cart')`) is correct in a browser and a cross-request bleed on a server. A cache of resolved values also makes any accessor-shaped seam beneath it unreachable (`setCookieSource`'s per-request accessor was read once, then short-circuited).
  - Isolate both the cached value and the bytes under it (e.g. `useMemoryStorage`'s backend map) behind the same per-request map.
  - A provider must be able to return `undefined` ("no request scope, use process default"). `() => als.getStore() ?? new Map()` fabricates a throwaway map outside a render and breaks refcounts and singletons.
  - Wire from the choke point: `@pyreon/runtime-server`'s `withIsolatedRegistries` (inside `renderToString`/`renderToStream`/`runWithRequestContext`) picks up each package's `globalThis` setter.
  - Sweep siblings with `grep -rn "new Map<" packages/fundamentals/*/src` when fixing one.
  - happy-dom hides this (`isServer` is false, `useCookie` reads `document.cookie`); regression specs use `// @vitest-environment node`.
  - Code: `packages/fundamentals/storage/src/{registry,custom}.ts`, `packages/fundamentals/state-tree/src/model.ts`. Tests: `storage/src/tests/ssr-request-isolation.test.ts`, `state-tree/src/tests/ssr-request-isolation.test.ts`.

---

### A JSON data block given the generic script-body rewrite

`<\!--` breaks the comment opener in script CODE (where `\!` is an identity escape), but `\!` is not a JSON escape, so a JSON-LD, speculation-rules or import-map block whose data contained `<!--` stopped parsing and was dropped silently. Pick the escape by what reads the body back: a `JSON.parse`d block takes `escapeJsonForScript` from `@pyreon/core` (`<` → `\u003C`, U+2028/U+2029), the one helper `@pyreon/head` and `@pyreon/zero`'s `jsonLd()` share. Fix: `packages/core/head/src/serialize.ts` (`isJsonScriptType`). Lock: `head/src/tests/script-json-and-title.test.ts` (parse5 + `JSON.parse` oracle).

---

### A user string passed as a `String.prototype.replace` replacement

`$&`, `` $` ``, `$'` and `$$` in the replacement are patterns, even when the search is a literal string, so a title like `Sale $' today` pulled the template's tail into `<title>`, and rendered HTML spliced into a template re-inserted the placeholder. Pass data through a function replacer: `s.replace(re, () => value)`. Funnels: `packages/core/head/src/title.ts` (`applyTitleTemplate`, shared by SSR and client), `server/src/html.ts:processTemplate`, `zero/src/not-found.ts`. Sweep: `grep -rnE '\.replace(All)?\([^,]+, *[a-zA-Z_`]'` over runtime code.

---

### Opt-in per-page hook wired by only some callers

`renderPage`'s `collectStyles` was passed only by SSG, so SSR shipped styler class names with no `<style>` (wrong first paint only).
  - Give such hooks a safe default at the choke point: `renderPage` defaults to `globalThis.__PYREON_STYLER_COLLECT__`, registered by `@pyreon/styler` on SSR init (string-mode twin of `__PYREON_STYLER_FLUSH__`; the two seams are independent).
  - A defect masked by another has no symptom until the mask is removed; this FOUC appeared only once hydration adopted server DOM.
  - Assert "every styler class in SSR HTML has a matching rule" on the raw HTTP response, not the hydrated DOM.
  - Code: `packages/core/server/src/render-page.ts`, `packages/ui-system/styler/src/sheet.ts`. Tests: `render-page.test.ts`, `styler/__tests__/ssr-flush-global.test.ts`, `e2e/ui-showcase-regression.spec.ts` ("SSR styler CSS emission").

---

### Replay plan compiled from row 0 applied to N rows without per-row shape check

`replayRowPlan` checked only the DOM positions it binds, so a row whose vnode diverged (conditional `onClick`, extra child, per-item `ref`) was adopted with row 0's bindings — dead handlers, no warning. `verifyRowShape` in `packages/core/runtime-dom/src/hydration-plan.ts` records a row-shape signature (tags, prop-key order, child kinds/counts, walk completeness) and bails divergent rows to the interpretive walk; row-root `ref` is wired too. Verify every instance against the plan's full shape, not just the bound positions. Test: `runtime-dom/src/tests/hydration-plan-specialization.test.tsx`.

---

### `rel="modulepreload"` with a route path as href

The path returns `text/html`, so every hover logs a strict-MIME error and wastes a request. The chunk URL lives inside the route record's `loader()` closure and cannot be derived from the path.
  - Warm the chunk with `router.preload(path, undefined, { skipLoaders: true })`; keep `rel="prefetch" as="document"`.
  - Write `router?.preload(...)?.catch(...)` — a bare `.catch` on an optional chain throws when `router` is null.
  - Code: `packages/zero/zero/src/link.tsx:doPrefetch`. Tests: `link-prefetch.test.ts`, `e2e/ssr-node.spec.ts` ("zero &lt;Link&gt; prefetch") — only real Chromium shows the MIME error.

---

### SSR↔hydration parity bugs are cursor/extent errors; fuzz them

`packages/core/runtime-dom/src/tests/hydration-parity-fuzz.test.tsx` (and `hydration-parity-fuzz-compiled.test.tsx`) hydrate each seeded tree and compare against a fresh client mount: zero mismatches, identical normalized DOM, identical DOM after identical flips, root identity reused, plus a ground-truth fresh mount with flipped values. `PYREON_FUZZ_SEEDS` raises the seed count; CI's count is not a proof.
  - Any SSR construct whose client extent is ambiguous (0, 1 or many nodes) needs a range marker (`<!--$-->…<!--/$-->`, `<!--k:-->`, `<!--pyreon-for-->`).
  - Markers must be uniform per construct; a value-conditional scheme reopens cursor gaps.
  - The HTML parser merges adjacent text children; hydration must `splitText` each child's prefix.
  - A text node mounted into a live parent through a reactive boundary must return a real remover; `noop` is valid only under `_elementDepth > 0`.
  - A reactive text binding is polymorphic (`bindPolymorphicText`); it may later yield a VNode.
  - Adding markers changes raw SSR strings; make string assertions marker-tolerant.
  - A static setter on an adopted element (`!_freshBind`) must hydrate, never `mountChild`: `_setChild` routes accessors AND VNode/VNode-array values to the marker-less slot hydrator. `<For>` plan replay admits rows 2..N at row 1's spots only, so a cell that held a string in row 1 can hold a VNode in row 2 (#4370). Test: `setchild-vnode-hydration.test.tsx`.

---

### Unclaimed server DOM must be removed before `hydrateRoot` returns

The hydration barrier promises everything on screen is live. Otherwise a warm-server/cold-client divergence (rows vs "Loading…") shows both, and the server rows have no handlers.
  - `adoptReactiveRange` snapshots the server range before the walk and removes every unclaimed node in the first render. Stop the snapshot at `mountReactive`'s own anchor (it sits inside the range), or the boundary is swept and the accessor never renders again.
  - `hydrateElement` and `hydrateRoot` sweep from the residual cursor to the element/container end. The sweep is skipped when nothing precedes the cursor, so a component whose setup throws keeps its inert server markup instead of going blank (matching a degraded page, not destroying it).
  - A static-text mismatch replaces the stale node and advances, so the next sibling adopts its own server node.
  - Parity fuzz cannot see this (its oracle is zero mismatches). Tests: `runtime-dom/src/tests/hydrate-mismatch-sweeps-server-range.test.tsx`, `hydrate-boundary-sweep.test.tsx` (hydrate-vs-cold-mount oracle). Compiled-emit test harnesses must provide every helper the emit imports (`_setChild`, `_setChildAt`, `_fuse`) and assert that they do.

---

### Elide range markers by construct, and restate the guard they provided

An accessor that is its element's sole child needs no `<!--$-->` markers — the tag boundary is the extent. Decide by static vnode shape (`children.length === 1 && typeof children[0] === 'function'`), never by the rendered value. All four surfaces must agree: both SSR paths (`renderElement`, `streamElementNode`), `hydrateElement` and both replays, and the `_escSole` emit in both compiler backends. The markers also served as a per-row "slot still holds a text node" proof in `replayRowPlan` and `replayAdoptPlan`; both now check `nodeType === 3 && nextSibling === null` directly. Before removing a redundant-looking artifact, list every consumer that reads it. The compiled emit needs a runtime `typeof v === 'function'` check (`_escSole`), because `{() => sig()}` arrives as a function and `{sig()}` as a value. Code: `packages/core/runtime-server/src/index.ts:soleAccessorChild`/`_escSole`, `runtime-dom/src/{hydrate.ts,hydration-plan.ts}`. Test: `sole-accessor-marker-elision.test.tsx`.

---

### Every consumer of an elided marker must agree, including the compiled client path

`h()` render, `h()` hydration, the compiled SSR emit and the compiled client template are four readers. `<div>{items.map(…)}</div>` stays `h()` on SSR but becomes `_tpl(…<!>…) + _mountSlot` on the client.
  - One adoption core serves the marked range, the compiled marker-less slot and the `h()` sole child: `adoptReactiveRange` in `packages/core/runtime-dom/src/hydrate.ts`, with a synthesized close for elided markers. `hydrateChild` cleanups dispose bindings but do not remove nodes; adopting through a bare `hydrateChild` strands server nodes on the first flip.
  - The runtime cannot decide soleness from the DOM: a sole slot's value can start with its own nested range, and `<main>{null}{acc}</main>` / `<span><>{acc}</></span>` are not sole to SSR. The compiler passes the verdict: `_mountSlot(…, true)` from the same `ssrSoleChild` predicate the SSR emit uses, in both backends. Pass compile-time decisions down instead of re-deriving them.
  - A mount hole (`data-pyreon-hole`) and a trailing `<!>` slot are disjoint; the hole check also requires `!slotAtEnd`. When deleting a gate, grep for comments and invariants that cite it.
  - Code: `compiler/src/jsx.ts:processChildren` (+ `native/src/lib.rs`), `runtime-dom/src/template.ts:_mountSlot`, `hydration-plan.ts:matchDomAgainstTemplate`. Test: `runtime-dom/src/tests/sole-slot-verdict.test.tsx`.

---

### Compiled `_tpl` root must adopt the server node, gated on a byte-equal skeleton

Cloning and `replaceChild`-ing the SSR subtree wipes typed input, focus, scroll and third-party listeners. `hydrateComponent` arms the one-shot adopt target with the component's cursor; `hydrateChild` skips the swap when `native.el === domNode`. The slot is claimed by whichever `_tpl` runs first (for an `h()`-rooted component, an inner template), so adoption requires the template's static skeleton (tags, static attributes, static text) to match the target — a wrong claimant then only adopts an identical node. A one-shot slot claimed by position must be verified structurally. Code: `packages/core/runtime-dom/src/hydrate.ts:hydrateComponent`, `hydration-plan.ts:matchDomAgainstTemplate`. Test: `hydrate-component-tpl-adoption.test.tsx`.

---

### Skipping verification for hole-free templates is not a hydration win

A fully static subtree already lowers to `_tpl(html, () => null)`, so the only remaining cost is the verify that makes adoption safe. Hole-free templates are also rare where hydration walks (0.0% of template instances on the app-page bench, 0.6% on a docs page), because data-free subtrees do not repeat. Instance-weight a code shape before optimizing it; a per-call-site census overstates it 30–50× (probe: `examples/benchmark/probe-holefree-census.ts`). The finer-grained idea (skipping unbound elements inside bound templates) is unmeasured and would weaken the skeleton gate.

---

### `@pyreon/zero` hydration retention depends on the client's first render matching

Zero's route is a reactive child of `RouterView`. `startClient` (`packages/zero/zero/src/client.ts`) calls `router.preload(path, undefined, { skipLoaders: true })` before `hydrateRoot` so the first render is the real page, not a `lazy()` fallback, and both accessor-hydration paths adopt the server range. If the first client render is a placeholder, the server range is still dropped. When measuring retention (`examples/benchmark/probe-ssr-retention.ts`), stamp nodes from a synchronous end-of-body `<script>`, never `DOMContentLoaded` (module scripts run before it and a DCL stamp reports ~100%); run a positive control such as `islands-showcase`.

---

### Text-run hydration cost is the marker walk; text fusion removes it

Per 1,000-row bench the `$`-marker handling was walk ~90ns + verify ~160ns + remove ~55ns per row, dominated by DOM property crossings (~25ns each). `TreeWalker`, `querySelectorAll` batching, flattened hop lists and `childNodes.length` verify all measured slower or no better; dropping the `.data` compares was rejected because it removes the text-vs-VNode guard (probe: `examples/benchmark/probe-marker-cost.ts`). The compiler now fuses mixed text runs (`<p>Hello {name}!</p>`, `<td>{a}{b}</td>`) into one sole-child accessor `() => _fuse("Hello ", name(), "!")` on the `_tpl`, `_ssr` and `h()` paths, so they emit no markers. `_fuse` returns the parts array when any part is a VNode/array/function.
  - The fusion boundary must be identical in both backends (`native-equivalence` covers all three paths), and the SSR fuzz oracle must apply the same fusion.
  - Docs-site pages barely change (prose is markdown via `innerHTML`); JSX text runs in app code are where it applies.
  - Code: `compiler/src/jsx.ts:fuseTextChildren`, `native/src/lib.rs:fuse_text_children`, `core/src/props.ts:_fuse`. Tests: `runtime-dom/src/tests/text-fusion.test.tsx`, `compiler/src/tests/text-fusion-emit.test.ts`.

---

### Literal expression children must bake like JSX text

`{"t"}`, `{54}`, `{null}` used to emit a placeholder + `_setChildAt`; the server renders them as plain text with no markers, so the verifier bailed on the whole element. Anything the compiler can render exactly as the server does must be baked. Rules: escape literal strings unconditionally (including `>`), merge adjacent texts into one entry, bake nothing for null/boolean/undefined, and bake a number only when its source equals its `String()` form (`1.50`, `1e3`, `-1` keep the runtime path). `<textarea value="0">` routes to the one-time `_setValue` instead of baking a dead attribute. Tests: `compiler/src/tests/template-literal-children-bake.test.ts`, `runtime-dom/src/tests/compiled-literal-children-adoption.test.tsx`.

---

### Hand-rolling `const isBrowser = typeof window !== 'undefined'`

Use `isServer` / `isClient` from `@pyreon/reactivity` (re-exported by `@pyreon/core`; `isServer = typeof document === 'undefined'`). `typeof window` misreports polyfilled or DOM-capable environments, and per-package copies drift. The flags are runtime constants, not an export-condition fold. Use them for small env guards; for DOM access in components prefer `onMount`/`effect`, and for heavy server-only code a `/server` subpath. `no-window-in-ssr` accepts an `isClient`/`isServer`/`isBrowser`/`isSSR` guard only when imported from `@pyreon/reactivity` or `@pyreon/core`. Reference: `packages/core/reactivity/src/environment.ts`.

---

### Running loaders but not resolving lazy route components before synchronous SSR

`renderToString` is synchronous, and `RouterView` renders an uncached `lazy()` route as nothing, so the page renders blank inside its layout. The handler calls `router.preload(path, req)`, which resolves lazy components into `_componentCache` and runs loaders (forwarding the request and loader redirects). `prefetchLoaderData` stays loaders-only because `RouterLink` hover prefetch uses it. An SSR e2e must assert the route's own page content in the raw HTTP response (`page.request.get`); layout content and hydrated DOM both mask an empty page. Code: `packages/core/server/src/handler.ts`, `packages/core/router/src/loader.ts:prefetchLoaderData`. Tests: `server.test.ts`, `loader.test.ts`, `e2e/ssr-node.spec.ts`.

---

### Streaming SSR emitting CSS-in-JS only at end of stream

`renderToStream` sends `<head>` before render, so styles collected later arrive after Suspense boundaries and cause FOUC. A CSS-in-JS engine that supports streaming needs a delta-flush API with a watermark, called once after the shell and inside each Suspense boundary before its `<template>`. Pyreon uses `globalThis.__PYREON_STYLER_FLUSH__` (no `runtime-server → styler` dependency; no-op without styler). A second flush with no new rules returns `''`; the watermark resets per request (`reset()`/`clearAll()`/`resetSSRBuffer()`). Do not re-emit all rules per boundary. Code: `packages/ui-system/styler/src/sheet.ts:flushSSRPending`, `packages/core/runtime-server/src/index.ts` (`streamSuspenseBoundary`). Tests: `styler/src/__tests__/streaming-flush.test.ts`, `runtime-server/src/tests/styler-stream-flush.test.ts`.

---

### Animation wrappers must not gate children out of SSR

`<Transition show={() => false}>` (and `Stagger`, `kinetic('x')` with falsy `show`) used to render nothing on the server, so scroll-reveal content was missing from prerendered HTML. Content is structural, animation is visual. On initially-hidden `show`, render children with hidden-state classes (`leaveTo`, else `enterFrom`) and animate the same element when `show` flips; initially-visible keeps the `<Show>`-gated mount. `applyEnter` clears residual `leave*` classes. Trade-off: for initially-hidden transitions, `unmount: true` does not remove the element after a later leave. Apply this to any new visibility wrapper. Code: `packages/ui-system/kinetic/src/Transition.tsx` (`wasInitiallyShown`; also `kinetic/{Transition,Collapse}Renderer.tsx`). Test: `Transition.ssr.test.tsx`.

---

### A skip-animation path that skips the end state too

The initially-hidden render bakes the hidden state (class/style) onto the element, and only the animated enter cleared it. `@pyreon/kinetic`'s reduced-motion branch fired the callbacks and completed the state machine without touching the element, so a scroll-reveal stayed at `opacity: 0` forever for users with `prefers-reduced-motion: reduce` (#4336). The collapses' reduced branch also waited for the inner content ref, which a reopen mounts on the same stage change, and stuck at `height: 0px` (the animation-end listener, the only other way out, is off under reduced motion). Any instant / no-animation / skip path must land on the same END state the animated path reaches (enter: `enterTo` + `enterToStyle`, hidden classes removed; leave: `leaveTo` + `leaveToStyle`) and must not depend on DOM the animation needs but it does not. Code: `packages/ui-system/kinetic/src/reduced-motion.ts:applyReducedMotionEnd`, the collapses' `reducedMotion()` branch. Tests: `__tests__/reduced-motion-end-state.test.tsx`, `__tests__/reduced-motion-reveal.browser.test.tsx` (CDP-emulated media).

---

### Non-reflecting property on the client vs attribute on the server (reset default)

Setting `input.value`/`textarea.value` as a property never creates the content attribute that `form.reset()` restores, so reset cleared a client-mounted field and restored a hydrated one. `applyValueProp` (compiler: `_setValue`) sets the property and establishes `defaultValue` on the first application only — re-establishing it on every keystroke of a controlled input turns reset into a no-op. The first-write marker is a `Symbol`-keyed own property, not a module-level Map. `select` and media `muted` are deliberately left diverging (React, Preact and Solid do the same). Code: `packages/core/runtime-dom/src/props.ts:applyValueProp`, both compiler backends' `attrSetter`/`attr_setter`. Tests: `input-default-value.browser.test.tsx`, `compiler-integration.test.tsx`, the parity fuzz's `input.value`/`textarea.value` entries.

---

### Applying `select.value` before its options exist (PZ-09)

`<select>` has no `value` content attribute, and the property setter needs matching `<option>`s present; an early assignment is dropped silently. Apply it after children, as a property, in every pipeline:
  - Compiler: never bake `select value`; defer its bind lines after the children lines (`processAttrs` → `deferredLines`, both backends).
  - Runtime: `mountElement`/`hydrateElement` skip `value` in the pre-children `applyProps` pass and apply it via `applySelectValueProp` afterwards.
  - SSR: drop the attribute and mark the matching `<option selected>` (String()-coerced first match; option text fallback). The select frame reaches options via `AsyncLocalStorage`.
  - `value == null`/boolean emits nothing. Known gaps: a spread `value` on the template path still applies before children (broken only with dynamic options); array values on `multiple` are unsupported on both sides.
  - happy-dom models select semantics correctly here. Tests: `runtime-dom/src/tests/select-value.test.tsx` (+ `.browser.test.tsx`), `compiler/src/tests/select-value-emit.test.ts`, native-equivalence "select value binding (PZ-09)", `runtime-server/src/tests/select-value-ssr.test.ts`.

---

### [FIXED, 2026-11] A string-template hole that BUILDS JSX renders it when the hole is evaluated, not where h() would.

`ssrTemplate` kept an expression child it could not lower (`{xs.map(x => <Row/>)}`, `{c ? <Comp/> : null}`) as generated text inside `_esc(...)`/`_escSole(...)`. An `_ssr(...)` argument evaluates at the call site, so a module-level `const frag = <ul>{xs.map(x => <Row/>)}</ul>` rendered `Row` before any provider ran (context defaults; the client then hydrates against different markup), and the walker never saw that JSX, so a `.map` item holding a component (`<li><Link/></li>`) went through `jsx()`/`h()` per element. Rule: an expression hole that contains JSX is either PRESERVED (`_esc(`/`_escSole(` around the untouched range, re-walked so its own roots template — only when `sliceExpr` returns the source verbatim) or, when it must stay generated, makes the whole call `_ssrDeferred`. Code: `compiler/src/jsx.ts:ssrSerializeExprChild` (+ `native/src/lib.rs`). Tests: `runtime-dom/src/tests/ssr-template-differential.test.tsx` (MODULE-CONST expression-hole cases), `compiler/src/tests/ssr-lowering-bails.test.ts`, parity in `native-equivalence.test.ts`.

---

### Lean SSR attr helper chosen by attribute name drops branches the name cannot decide

`ssrTemplate` routes dynamic attrs to `_ssrAttr` (= `renderProp`) or lean `_ssrAttrGen`/`_ssrAttrUrl` by name. The lean helpers must resolve function values first (a bare identifier holding an accessor otherwise serializes its source, e.g. `d="() =&gt; …"`), and before the URL guard. `<textarea value>` bails to the `h()` path, since `_ssrAttrGen` never sees the tag. A fast path selected on one dimension must still cover every oracle branch that dimension cannot exclude; prefer bailing to the proven path. A differential test is only as strong as its input matrix — cover one input per oracle branch. Code: `packages/core/runtime-server/src/index.ts:_ssrAttrGen`/`_ssrAttrUrl`, `compiler/src/jsx.ts:ssrSerializeAttr` (+ `native/src/lib.rs`). Tests: `runtime-dom/src/tests/ssr-template-differential.test.tsx`, `runtime-server/src/tests/ssr-template.test.ts`.

---

### Conditional element children in the compile-to-string SSR path

`{cond && <el>}` / `{cond ? <el> : …}` lower the DOM-element operand to a nested `_ssr(...)` (`ssrLowerNestedElements`, same builder as a top-level element), leaving the `&&`/`?:` structure and the marker decision untouched. Output is byte-identical to the `h()` path for every value, since `_esc`/`_escSole` treat RawHtml like a VNode and return falsy left operands verbatim. Only elements without component children lower. It applies in recursed mode only: conditionals inside `.map`/`<For>` rows keep the VNode path, because `_ssrItem` may return a raw string that `_escSole` would double-escape. The SSR fuzz oracle must wrap a child in an accessor exactly when `shouldWrap` does. Code: `packages/core/compiler/src/jsx.ts:ssrLowerNestedElements` (+ `native/src/lib.rs`). Tests: `runtime-dom/src/tests/ssr-template-differential.test.tsx`, `ssr-template-fuzz.test.tsx`.

---

### Sanitized `innerHTML` prop must not be emitted raw by SSR

`innerHTML` is the sanitized prop (client `applyStaticProp` runs a `DOMParser` allowlist), while `dangerouslySetInnerHTML` is raw by design. The sanitizer cannot run in Node, and a string sanitizer is mXSS-prone on the SVG surface, so the SSR/SSG/stream renderers throw a `[Pyreon]` error naming the remedy (client-only island/SPA route, or `dangerouslySetInnerHTML` with a server-safe sanitizer). Escaping as text is wrong. A client-side security guard needs an SSR twin, because the browser parses the initial HTML before any JS runs; if the guard cannot run on the server, fail loudly. Code: `packages/core/runtime-server/src/index.ts:throwSsrInnerHtmlUnsupported`. Tests: `runtime-server/src/tests/ssr-innerhtml-xss.test.ts`, `runtime-dom/src/tests/ssr-innerhtml-xss-parity.test.ts`.

---

### A serializer that judges a value in a different form than its consumer reads it

A guard is only as good as the representation it inspects. Decide on what the CONSUMER will see after its own decoding/normalisation, at the one funnel every emit goes through. Rules:
  - **A second emit path skips the first path's guard.** `@pyreon/rich-text`'s pre-mount/server `html()` is `jsonToHtml`, not TipTap, so the Link extension's URI allow-list never ran and a stored `javascript:` href came out live. Every URL attribute a serializer writes goes through one predicate (`@pyreon/core`'s `isUnsafeUrl`); an HTML importer judges the `getAttribute` value, which is already entity-decoded. Reference: `packages/fundamentals/rich-text/src/html.ts` (`safeUrl`); `tests/url-safety.test.ts`.
  - **A value inside an HTML attribute is entity-decoded before CSS/URL parsing.** Stripping `;` `(` `)` from the raw string misses `&#59;`. Decode to a fixed point, strip, then remove every remaining `&` (no character reference forms without one, including named ones a decoder does not know). Reference: `packages/fundamentals/document/src/sanitize.ts:sanitizeCss`; `tests/css-entity-decode.test.ts` (oracle: a real parse of the emitted markup).
  - **`encodeURIComponent` does not make a path segment inert.** A value that is exactly `.` / `..` is a dot segment that WHATWG `fetch` and OkHttp resolve, and so is `%2E` — the request (with its credentials) reaches another endpoint. Encode the dots twice (`%252E`). The web (`@pyreon/http` `encodePathParam`), the native compile-time literal path (imports the web function), both native runtimes (`PyreonURL.encodePathParam`) and lathe's generated runtime must apply the same rule. Reference: `packages/fundamentals/http/src/url.ts`; parity in `native/compiler/src/tests/native-url-encoder-parity.test.ts` (executed).

---

### A WebSocket endpoint that authenticates by cookie without checking `Origin`

WebSockets are not subject to CORS, and the browser attaches the endpoint's cookies to an upgrade that ANY site's page opens (cross-site WebSocket hijacking). Refuse a browser upgrade whose `Origin` is neither same-origin with `Host` nor explicitly allowed, before the auth hook runs; an upgrade with no `Origin` is not a browser page. Reference: `packages/fundamentals/sync/src/server.ts` (`allowedOrigins`, close 4403); `tests/server-origin.test.ts`.

---

### A compiled binder that corrects adopted server DOM without reporting it

(#4419): `_tpl` adoption hands the server's nodes to the compiled bind, and `_setChild`, `_setChildAt`, `_bindText`, `_bindProp`, `bindPolymorphicText` and `_textSlot` all overwrote divergent server text silently. A verifier bail swapped the server element for a clone, also silently. The h() walk reports both, so a JSX app (where nearly everything compiles to `_tpl`) heard about none of its SSR/client divergences. **Rule: every compiled write into adopted server DOM goes through the dev-only report in `hydration-debug.ts`.** Binders call `reportFirstText` inside their existing first-run (`written === null`) branch, and static writes call `reportTextWrite` in a separate `process.env.NODE_ENV !== 'production'` block that repeats the write. The adoption window is `_bindWithAdoption(true, …)` in `buildTpl`, closed for clone binds and for slot/hole hydration (the h() walk reports those itself). Swaps report the first real DOM difference (`reportSwappedTemplate`), never the bail itself. A mismatch is reported exactly when hydration changes server text, so production keeps byte-identical binders. The h() walk had the same gap for an accessor that renders text over an EMPTY server element or range; it now reports that too (in production as well, like every h()-path report). Locks: `runtime-dom/src/tests/hydrate-compiled-mismatch-report.browser.test.tsx` (real Chromium, recorded real compiler output) and its happy-dom twin, which regenerates that record; the compiled parity fuzz's O1 oracle (no report on agreement).

---
