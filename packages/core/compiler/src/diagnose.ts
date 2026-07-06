/**
 * Browser-safe error-diagnosis catalog — extracted from `react-intercept.ts`
 * (PR: @pyreon/compiler/diagnose subpath) so it loads WITHOUT the TypeScript
 * compiler API.
 *
 * `react-intercept.ts` imports `typescript` (AST-based React-pattern
 * detection + code migration) — Node-only + heavy. `diagnoseError` and its
 * `ERROR_PATTERNS` are pure regex + strings with ZERO TS-API dependency, so
 * they live here and are re-exported from the browser-safe
 * `@pyreon/compiler/diagnose` subpath — enabling dev throw-time error
 * diagnosis in the browser (the vite-plugin dev error printer) without
 * dragging `typescript` into the client bundle.
 *
 * The `Diagnose Catalog` CI gate (scripts/check-diagnose-catalog.ts) counts
 * `ERROR_PATTERNS` entries in THIS file.
 */

export interface ErrorDiagnosis {
  cause: string
  fix: string
  fixCode?: string | undefined
  related?: string | undefined
}

interface ErrorPattern {
  pattern: RegExp
  diagnose: (match: RegExpMatchArray) => ErrorDiagnosis
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    // Template ref-hoist fix (PZ-08): a reactive/conditional slot
    // (`{cond() ? <A/> : <B/>}`, `{cond && <el/>}`) BEFORE static siblings
    // broke the compiled template's sibling ref-walk — `_mountSlot` mounts
    // content + a `<!--pyreon-->` marker and REMOVES its `<!>` placeholder,
    // so `const __eN = __root.firstChild.nextSibling…` walks emitted AFTER
    // it landed on the marker comment (TypeError reading 'setProperty' via
    // `_setStyle`), on null (setAttribute / .data), or — with TWO sibling
    // slots — on the FIRST slot's reactive marker, which the second
    // `_mountSlot` then removed (a later falsy→truthy re-flip of slot 0
    // crashed `insertBefore` and SILENTLY LOST the subtree).
    pattern:
      /reading ['"]setProperty['"]|(reading ['"](setAttribute|data|setProperty)['"]|insertBefore.*not a child of this node).*(_mountSlot|_tpl|_setStyle|pyreon|slot|marker|template)|(_mountSlot|<!--pyreon-->).*(sibling|marker|wrong node|null|missing|lost)/i,
    diagnose: () => ({
      cause:
        "On `@pyreon/compiler` versions before the template ref-hoist release, a reactive/conditional slot child (`{cond() ? <A/> : <B/>}`, `{cond && <el/>}`, `{arr.map(…)}`) placed BEFORE static siblings broke the compiled template's sibling ref-walk: `_mountSlot` mounts content + a `<!--pyreon-->` marker and removes its `<!>` placeholder (net sibling-count change), and the sibling refs / second-slot placeholder walks were emitted AFTER that mutation — so they resolved to the marker comment (TypeError: Cannot read properties of undefined (reading 'setProperty') from a style binding), to null (setAttribute / text .data), or to a sibling slot's marker, which was then removed — making that slot's next falsy→truthy re-flip throw `insertBefore … is not a child of this node` and silently lose its subtree. The failure was initial-state-dependent (some states accidentally correct).",
      fix: 'Upgrade `@pyreon/compiler` — templates now capture EVERY pristine-clone node reference (element walks, text captures, placeholder consts) BEFORE any `_mountSlot`/`replaceChild` mutation runs, in both backends. No app code change needed. If you cannot upgrade, wrap the dynamic child in its own static element (`<div style="display:contents">{cond && <X/>}</div>`) or move it after the static siblings.',
      fixCode: `// All of these now compile + run correctly:
<div>{banner() ? <Banner/> : <Fallback/>}<div style={styles.card}>card</div></div>
<div>{loading() && <Spinner/>}{items().length && <List/>}</div>
<div>{show && <em>badge</em>}<span id={dynamicId}>after</span></div>`,
      related:
        'Same fix family: @pyreon/flow MiniMap/Controls overlay child-order workaround and @pyreon/zero-content CodeBlock always-rendered-wrapper workaround existed because of this compiler bug.',
    }),
  },
  {
    // Auto-call reachability fix (2026-07 fuzz campaign): symptoms of the
    // OLD emit — a signal function leaking into DOM output / handler math.
    pattern: /(\(\.\.\.args\) =>|function\s*\(\)).*(setAttribute|attribute|title=|id=|textContent)|signal.*(function|source).*(attribute|DOM|rendered)|s\w*\.set\(.*=>.*\+/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/compiler` versions before the auto-call reachability release, bare signal reads inside event-handler bodies, `.map`/callback re-emits, and nested JSX under conditional slots were NOT auto-called on one or both backends — the signal FUNCTION leaked into the emitted code, so string contexts rendered its source (`id="v(...args) => {…"`), boolean contexts were always truthy (`title={sig ? "a" : "b"}` stuck), and the canonical counter (`count.set(count + 1)`) concatenated the function.',
      fix: 'Upgrade `@pyreon/compiler` — the auto-call pass now walks nested function bodies (shadow-aware) and nested JSX uniformly in BOTH backends, locked by a seeded differential-fuzz gate. No app code change needed; explicit `sig()` calls always worked and continue to.',
      fixCode: `// All of these now compile correctly with BARE signal reads:
<button onClick={() => count.set(count + 1)}>+</button>
<ul>{items().map((it) => <li title={flag ? "a" : "b"}>{it}</li>)}</ul>
{cond() ? <span id={\`v\${sig}\`}>x</span> : null}`,
      related: 'duplicate-jsx-attr warning: duplicate JSX attributes now dedupe last-wins (JSX object semantics) with a compiler warning.',
    }),
  },
  {
    // Hydration-blob same-path collision (fixed alongside the server-loaders
    // correctness PR): a layout and its index page SHARE a route path, and
    // the SSR hydration blob keyed loader data by record.path — so on older
    // @pyreon/router versions, useLoaderData() in one of the two could read
    // the OTHER record's data after hydration (last-write-wins, timing-
    // dependent).
    pattern: /useLoaderData\(\).*(wrong|layout|other route|collid|overwrit)|loader data.*(layout|page).*(swap|collid|wrong|overwrit)/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/router` versions before the server-loaders correctness release, the SSR hydration blob (`window.__PYREON_LOADER_DATA__`) keyed loader data by `record.path`. A layout and its index page share a path, so when BOTH carry loaders their data collided in the blob (last-write-wins) — post-hydration, `useLoaderData()` in one component read the other record\'s data.',
      fix: 'Upgrade `@pyreon/router` — the blob now keys the first record at a path bare (back-compat) and subsequent same-path records as `path#<occurrence>`, so layout + page data never collide. No app code change needed.',
      fixCode: `// routes/dashboard/_layout.tsx — layout loader
export async function loader() { return { user: await getUser() } }
// routes/dashboard/index.tsx — page loader (same /dashboard path)
export async function loader() { return { stats: await getStats() } }
// After the upgrade each component's useLoaderData() reads ITS OWN data.`,
    }),
  },
  {
    // Phase 5 (server loaders) — useLoaderData() returning undefined for a
    // route whose data comes from a `.server.ts` serverLoader sibling, on
    // @pyreon/router versions where the RouterView render gates checked
    // only `record.loader` before wrapping in LoaderDataProvider.
    pattern: /useLoaderData\(\).*(undefined|none).*(serverLoader|server loader|\.server\.ts)|serverLoader.*(data|useLoaderData).*(undefined|missing)/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/router` versions before the server-loaders release, BOTH RouterView render-gate branches checked only `record.loader` before wrapping the route in `LoaderDataProvider` — a route whose data comes from a `.server.ts` `serverLoader` sibling rendered WITHOUT the provider, so `useLoaderData()` read the context default (undefined) even though the loader ran and the hydration blob carried the value.',
      fix: 'Upgrade `@pyreon/router` + `@pyreon/zero` to the server-loaders release (the gates now share one `carriesLoaderData` predicate covering loader / serverLoader / hasServerLoader). No code change needed in your app.',
      fixCode: `// src/routes/dashboard.server.ts
export async function serverLoader(ctx) { return db.load(ctx.request) }
// src/routes/dashboard.tsx — works after the upgrade:
const data = useLoaderData<Dashboard>()`,
    }),
  },
  {
    // Phase 4 (server islands) surfaced this runtime-dom bug class: data-*/
    // aria-* props on CUSTOM ELEMENTS landed as JS properties, so
    // getAttribute/dataset/CSS attribute selectors silently read null while
    // SSR HTML carried real attributes.
    pattern: /getAttribute\(['"](data-|aria-)[\w-]+['"]\).*(null|undefined)|dataset\.\w+.*undefined.*(custom|hyphen|web component)/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/runtime-dom` versions before the data-/aria- carve-out, `data-*`/`aria-*` props on CUSTOM ELEMENTS (hyphenated tags) were set as JS PROPERTIES via the pre-upgrade branch — `getAttribute("data-x")`, `el.dataset`, and CSS attribute selectors all read null on client-mounted elements even though SSR HTML carried real attributes.',
      fix: 'Upgrade `@pyreon/runtime-dom` to the release where data-*/aria-* always go through setAttribute (React/Vue/Solid behavior). If you cannot upgrade, read the value as a property (`(el as any)["data-x"]`) on client-mounted custom elements — and remove that workaround after upgrading.',
      fixCode: `// after the upgrade this just works on custom elements:
<my-widget data-state={state()} aria-label="Cart" />
// el.getAttribute("data-state") / el.dataset.state both resolve`,
    }),
  },
  {
    // Compiler template fast-path — `dangerouslySetInnerHTML` on a
    // template-ized element (any multi-element JSX tree) fell through to a
    // generic `setAttribute("dangerouslySetInnerHTML", value)`, so the
    // `{ __html }` object stringified to "[object Object]" and the element
    // rendered EMPTY. SSR emitted the inner HTML correctly, then the client
    // template render replaced it with the empty attribute'd node — so an
    // SSR'd `<pre>` (e.g. a Shiki code block) BLINKED then vanished.
    pattern:
      /dangerouslySetInnerHTML.*(\[object Object\]|empty|blank|vanish|disappear|not render)|\[object Object\].*(innerHTML|inner html)/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/compiler` versions before the template-path fix, `dangerouslySetInnerHTML` on an element that the compiler lowered into a `_tpl()` template (any JSX tree with ≥2 elements) fell through to a generic `setAttribute("dangerouslySetInnerHTML", value)`. The `{ __html }` object stringified to "[object Object]" and the element rendered EMPTY — the runtime `applyProp` path (`h()`/spreads) was correct, only the template fast path was wrong. SSR emitted the inner HTML, then the client template render replaced it with the empty node, so content BLINKED then vanished.',
      fix: 'Upgrade `@pyreon/compiler` to the release where the template fast path applies `dangerouslySetInnerHTML` as `el.innerHTML = value.__html` (mirroring the runtime `applyStaticProp` path, both JS + Rust backends). No app code change needed. If you cannot upgrade, set `innerHTML` imperatively in `onMount` from a `ref` instead.',
      fixCode: `// Works after the upgrade (template path now sets innerHTML):
<div class="wrapper">
  <div dangerouslySetInnerHTML={{ __html: html }} />
</div>

// Pre-upgrade workaround — imperative innerHTML via ref:
function Body({ html }) {
  let el
  onMount(() => { if (el) el.innerHTML = html })
  return <div class="wrapper"><div ref={(n) => (el = n)} /></div>
}`,
    }),
  },
  {
    // Phase 1 render-pipeline unification — the shipped-broken
    // `useRequestLocals` (renderToString/renderToStream opened a FRESH ALS
    // context stack, discarding request-level provide() frames). Users on
    // older runtime-server versions see the locals hook resolving its
    // default ({}), so reads like `locals.nonce` / `locals.user` are
    // undefined inside SSR-rendered components even though the handler's
    // middleware populated ctx.locals.
    pattern: /useRequestLocals\(\).*(undefined|empty|\{\})|locals.*(nonce|user).*undefined.*(SSR|server)/i,
    diagnose: () => ({
      cause:
        '`useRequestLocals()` resolves its default ({}) inside SSR-rendered components on `@pyreon/runtime-server` versions where `renderToString`/`renderToStream` opened a FRESH request-context stack — the nested ALS scope silently discarded every request-level `provide()`, including the handler\'s `provideRequestLocals(ctx.locals)` bridge.',
      fix: 'Upgrade `@pyreon/runtime-server` + `@pyreon/server` to the release where the renderers INHERIT an active `runWithRequestContext` scope (the renderPage unification). Middleware locals then reach components with no code change. If you cannot upgrade, pass values through route loaders instead of locals.',
      fixCode: `// middleware (unchanged):
middleware: [(ctx) => { ctx.locals.nonce = makeNonce() }]
// component (works after the upgrade):
const { nonce } = useRequestLocals()`,
    }),
  },
  {
    pattern: /Cannot read properties of undefined \(reading '(set|update|peek|subscribe)'\)/,
    diagnose: (m) => ({
      cause: `Calling .${m[1]}() on undefined. The signal variable is likely out of scope, misspelled, or not yet initialized.`,
      fix: 'Check that the signal is defined and in scope. Signals must be created with signal() before use.',
      fixCode: `const mySignal = signal(initialValue)\nmySignal.${m[1]}(newValue)`,
    }),
  },
  {
    pattern: /Cannot read properties of undefined \(reading 'ref'\)/,
    diagnose: () => ({
      cause:
        'Pyreon\'s client mount/hydrate hit a Promise where it expected a VNode — typically an `async function Component()` returned to a route or other JSX call site on a runtime-dom version older than this fix. SSR awaits the Promise and inlines content; the older client read `.props.ref` straight off the Promise and crashed.',
      fix: 'Upgrade `@pyreon/runtime-dom` to the version that ships async-function-component support on the client (parity with `renderToString`). On older versions, refactor to one of the documented sync patterns:\n  • `lazy(() => import(...))` + `<Suspense>`\n  • move the await into `onMount(async () => { ... signal.set(result) })` and render from the signal',
      fixCode:
        '// Old pattern (crashes on the client):\nasync function DocBody({ slug }) {\n  const entry = await getEntry("docs", slug)\n  return <article>...</article>\n}\n\n// Sync + signal alternative (works on every version):\nfunction DocBody({ slug }) {\n  const data = signal(null)\n  onMount(async () => {\n    const entry = await getEntry("docs", slug)\n    data.set(entry)\n  })\n  return () => {\n    const d = data()\n    if (!d) return <article class="loading" />\n    return <article>...</article>\n  }\n}',
    }),
  },
  {
    pattern: /Hydration: async component <(\w+)> SSR markers/,
    diagnose: (m) => ({
      cause: `Pyreon's client hydrate ran <${m[1]}> (an async function component) but couldn't find the SSR sentinel markers (\`<!--$pas-->\`/\`<!--$pae-->\`) that bracket the resolved subtree in the server-rendered HTML. Without them, the client can't attach events / onMount / signal subscriptions to the async subtree — content stays visible but is interactive-dead.`,
      fix: 'Almost always a version-skew issue: `@pyreon/runtime-server` (server build) is older than `@pyreon/runtime-dom` (client build). Bump them in lockstep so the SSR side emits the markers the client side expects.\n  • Check both packages are on the SAME version in package.json + lockfile\n  • Rebuild the server bundle after the upgrade — `lib/` may be cached from the older runtime-server\n  • If you intentionally pin runtime-server to an older version, downgrade runtime-dom to match (or accept that async subtrees won\'t hydrate)',
      fixCode:
        '// package.json — keep these two in lockstep:\n{\n  "dependencies": {\n    "@pyreon/runtime-server": "0.x.y",  // server SSR\n    "@pyreon/runtime-dom":    "0.x.y"   // client hydrate\n  }\n}\n\n// then:\nbun install\nbun run build  // rebuild both server + client bundles',
    }),
  },
  {
    // `_mountSlot` returned `null` for a falsy/boolean conditional slot
    // (`{showLock && <button>}` → false, `{cond ? <x/> : null}` → null), but
    // the compiler emits a template's cleanup as an UNCONDITIONAL call of every
    // slot disposer (`() => { __d0(); __d1(); … }`). So the disposer was `null`
    // and `__dN()` threw `<slot> is not a function` (minified: `g is not a
    // function`) the moment the reactive boundary re-ran or the component
    // unmounted. Surfaced as the @pyreon/flow Controls crash on drag/zoom/nav
    // (`showLock` defaults false → the lock-button slot is `_mountSlot(false)`
    // → null). Matched BEFORE the generic "X is not a function" entry below so
    // the slot-cleanup shape (Unhandled effect error / Object.cleanup) gets the
    // correct explanation instead of the "call your signal" advice.
    pattern:
      /(?:Unhandled effect error|Object\.cleanup|at cleanup|effect.*cleanup).*\bis not a function\b|\bis not a function\b.*\bcleanup\b/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/runtime-dom` versions before the `_mountSlot` callable-cleanup fix, a conditional JSX slot that evaluated FALSY/BOOLEAN (`{cond && <x/>}` → false, `{cond ? <x/> : null}` → null) made `_mountSlot` return `null` instead of a disposer. The compiler emits a template\'s cleanup as an UNCONDITIONAL call of every slot disposer (`() => { __d0(); __d1(); … }`), so the `null` slot threw `<slot> is not a function` (minified: e.g. `g is not a function` at `Object.cleanup`) the instant the reactive boundary re-ran or the component unmounted. The `@pyreon/flow` Controls crash on drag/zoom/navigate-away was exactly this (`showLock` defaults false → the lock-button slot is `_mountSlot(false)` → null).',
      fix: 'Upgrade `@pyreon/runtime-dom` to the release where `_mountSlot` ALWAYS returns a callable cleanup (a shared no-op for the falsy case), so the compiler-emitted unconditional disposer call is always safe. No app code change needed. If you cannot upgrade, avoid bare falsy conditional slots inside a templatized element — wrap the conditional in a `<Show>` (`<Show when={cond}>{<x/>}</Show>`) so the slot always mounts a real reactive child.',
      fixCode: `// Crashes on re-render/unmount pre-upgrade (falsy slot → null disposer):
<div class="controls">{showLock && <button>Lock</button>}</div>

// Works after the upgrade (slot returns a callable no-op when falsy).
// Pre-upgrade workaround — route through <Show>:
<div class="controls"><Show when={showLock}><button>Lock</button></Show></div>`,
    }),
  },
  {
    pattern: /(\w+) is not a function/,
    diagnose: (m) => ({
      cause: `'${m[1]}' is not callable. If this is a signal, you need to call it: ${m[1]}()`,
      fix: 'Pyreon signals are callable functions. Read: signal(), Write: signal.set(value)',
      fixCode: `// Read value:\nconst value = ${m[1]}()\n// Set value:\n${m[1]}.set(newValue)`,
    }),
  },
  {
    pattern: /Cannot find module '(@pyreon\/\w[\w-]*)'/,
    diagnose: (m) => ({
      cause: `Package ${m[1]} is not installed.`,
      fix: `Run: bun add ${m[1]}`,
      fixCode: `bun add ${m[1]}`,
    }),
  },
  {
    pattern: /Cannot find module 'react'/,
    diagnose: () => ({
      cause: "Importing from 'react' in a Pyreon project.",
      fix: 'Replace React imports with Pyreon equivalents.',
      fixCode:
        '// Instead of:\nimport { useState } from "react"\n// Use:\nimport { signal } from "@pyreon/reactivity"',
    }),
  },
  {
    pattern: /Property '(\w+)' does not exist on type 'Signal<\w+>'/,
    diagnose: (m) => ({
      cause: `Accessing .${m[1]} on a signal. Pyreon signals don't have a .${m[1]} property.`,
      fix:
        m[1] === 'value'
          ? 'Pyreon signals are callable functions, not .value getters. Call signal() to read, signal.set() to write.'
          : `Signals have these methods: .set(), .update(), .peek(), .subscribe(). '${m[1]}' is not one of them.`,
      fixCode:
        m[1] === 'value' ? '// Read: mySignal()\n// Write: mySignal.set(newValue)' : undefined,
    }),
  },
  {
    pattern: /Type '(\w+)' is not assignable to type 'VNode'/,
    diagnose: (m) => ({
      cause: `Component returned ${m[1]} instead of VNode. Components must return JSX, null, or a string.`,
      fix: 'Make sure your component returns a JSX element, null, or a string.',
      fixCode: 'const MyComponent = (props) => {\n  return <div>{props.children}</div>\n}',
    }),
  },
  {
    pattern: /onMount callback must return/,
    diagnose: () => ({
      cause: 'onMount expects a callback that optionally returns a CleanupFn.',
      fix: 'Return a cleanup function, or return nothing.',
      fixCode: 'onMount(() => {\n  // setup code\n})',
    }),
  },
  {
    pattern: /Expected 'by' prop on <For>/,
    diagnose: () => ({
      cause: "<For> requires a 'by' prop for efficient keyed reconciliation.",
      fix: 'Add a by prop that returns a unique key for each item.',
      fixCode:
        '<For each={items()} by={item => item.id}>\n  {item => <li>{item.name}</li>}\n</For>',
    }),
  },
  {
    pattern: /useHook.*outside.*component/i,
    diagnose: () => ({
      cause:
        'Hook called outside a component function. Pyreon hooks must be called during component setup.',
      fix: 'Move the hook call inside a component function body.',
    }),
  },
  {
    pattern: /Hydration mismatch/,
    diagnose: () => ({
      cause: "Server-rendered HTML doesn't match client-rendered output.",
      fix: 'Ensure SSR and client render the same initial content. Check for browser-only APIs (window, document) in SSR code.',
      related: "Use typeof window !== 'undefined' checks or onMount() for client-only code.",
    }),
  },
  {
    // W16 — Transition wrapped in Portal/Show queued applyEnter before the
    // child ref was assigned, so el.classList.remove threw. Closed in PR
    // #960 by retrying for up to 16 microtasks. Catch the rarer residual
    // shape (e.g. ref never resolves) and explain the fix.
    pattern: /Cannot read propert(?:y|ies) of null \(reading 'classList'\)/,
    diagnose: () => ({
      cause:
        "A <Transition> tried to read .classList on a null element. Usually the ref to the animated child element wasn't assigned by the time applyEnter/applyLeave ran — e.g. the child is itself an async-mounted component, or the Transition wraps something other than a single DOM element.",
      fix: "Transition must wrap a single DOM element directly (not a component VNode). If you need a component, wrap the component's root DOM element in Transition externally, or expose the ref via forwardRef.",
      fixCode:
        '// ✗ Component child — Transition can\'t inject ref\n<Transition show={open}>\n  <MyComponent />\n</Transition>\n\n// ✓ DOM element child\n<Transition show={open}>\n  <div class="modal">...</div>\n</Transition>',
    }),
  },
  {
    // W14 — hotkeys sequential combos. Catch the rare case where a user
    // sees the warning about an empty shortcut string.
    pattern: /\[@pyreon\/hotkeys\] empty shortcut/,
    diagnose: () => ({
      cause:
        'registerHotkey() / useHotkey() was called with an empty or whitespace-only shortcut string.',
      fix: 'Provide a non-empty key combo. Sequential combos use whitespace: useHotkey("g t", ...). Modifier combos use +: useHotkey("ctrl+s", ...).',
      fixCode: "useHotkey('g t', () => router.push('/top'))",
    }),
  },
  {
    // W19 — user runs `zero build` against an SPA-only
    // project that has no `src/entry-server.ts`. As of v0.25.2 the CLI
    // skips the server build for `mode: 'spa'` AND when entry-server.ts
    // is absent; this pattern catches older zero-cli versions or apps
    // that declare a non-SPA mode without the matching entry file.
    pattern: /\[UNRESOLVED_ENTRY\][^\n]*src\/entry-server\.ts/,
    diagnose: () => ({
      cause: "`zero build` is doing an SSR build pass but `src/entry-server.ts` doesn't exist.",
      fix: "If your app is SPA-only: declare `zero({ mode: 'spa' })` in vite.config.ts AND upgrade `@pyreon/zero-cli` to ≥0.25.2 (where the SSR build pass is skipped for SPA mode). If your app needs SSR/SSG: add `src/entry-server.ts` exporting `createServer(...)` from `@pyreon/zero/server`.",
      fixCode:
        "// vite.config.ts\nimport zero from '@pyreon/zero/server'\nexport default {\n  plugins: [zero({ mode: 'spa' })],\n}",
    }),
  },
  {
    // W18 — user pairs only one half of the cross-list
    // dnd contract. `groupId` is the opt-in; the destination must
    // provide `onCrossListReceive`, the source must provide
    // `onCrossListDrop`. Without one half, items appear duplicated
    // (no source removal) or disappear (no destination insert).
    pattern: /\[@pyreon\/dnd\] useSortable cross-list/,
    diagnose: () => ({
      cause:
        'A useSortable with groupId received a cross-list drop but missed either onCrossListReceive (destination inserts) or onCrossListDrop (source removes).',
      fix: 'Pair both callbacks across the two sortables that share a groupId. Destination inserts; source removes.',
      fixCode:
        "const a = useSortable({\n  items: colA, by: c => c.id, onReorder: setColA,\n  groupId: 'kanban',\n  onCrossListDrop: item => setColA(colA().filter(c => c.id !== item.id)),\n})\nconst b = useSortable({\n  items: colB, by: c => c.id, onReorder: setColB,\n  groupId: 'kanban',\n  onCrossListReceive: (item, i) => {\n    const next = [...colB.peek()]\n    next.splice(i, 0, item)\n    setColB(next)\n  },\n})",
    }),
  },
  {
    // R1 — `useRouter()` / `useNavigate()` / `useParams()` /
    // `useRoute()` / `onBeforeRouteLeave()` / `onBeforeRouteUpdate()`
    // / `useBlocker()` / `useSearchParams()` / etc. all share this
    // "[Pyreon] No router installed" throw shape. The most common
    // cause: the hook is called from a component mounted OUTSIDE
    // a `<RouterProvider router={createRouter({...})}>`. Common
    // forms: forgotten provider at app root, mounted a test fixture
    // without the provider, or split a component into a module
    // that's reused outside the routed tree.
    pattern: /\[Pyreon\] No router installed/,
    diagnose: () => ({
      cause:
        'A router hook (useRouter / useNavigate / useParams / useRoute / onBeforeRouteLeave / etc.) was called from a component that is not mounted inside a <RouterProvider>. The router context is provided per-tree, so descendants without a provider get the explicit "no router installed" throw rather than silently no-op.',
      fix: 'Wrap the app root in <RouterProvider router={createRouter({...})}>. For tests, render the unit under <RouterProvider router={...}> with a stub router. For shared components that may render in both routed AND non-routed contexts, accept the navigate callback as a prop instead of calling useNavigate() directly.',
      fixCode: `const router = createRouter({ routes })
mount(() => <RouterProvider router={router}><App /></RouterProvider>, root)`,
    }),
  },
  {
    // R2 — `ResolvedRoute.meta` is reference-stable + frozen (cached
    // per FlattenedRoute; dynamic-route nav `/posts/42` and `/posts/99`
    // share the SAME meta object identity). User code that does
    // `(route.meta as any).x = …` to stash per-navigation state now
    // throws this TypeError in strict mode (every Pyreon module file
    // is strict). The captured property name varies by user code, so
    // the regex captures it. Common code paths hit by this:
    // - navigation guards: `to.meta.requireRecheck = true` in a guard
    // - components: `route.meta.cached = …` to memoize per-route
    // - middleware: assignments to `ctx.route.meta.*`
    // Fix shape: never write THROUGH route.meta. Put per-navigation
    // state in your own store / context / signal.
    pattern: /Cannot assign to read only property '(\w+)' of object '#<Object>'/,
    diagnose: (m) => ({
      cause: `Attempted to write '${m[1]}' to a frozen object. If this came from \`route.meta.${m[1]} = …\` or similar, ResolvedRoute.meta is frozen and shared across every navigation through the same matched route — mutation would silently poison the cache, so the framework freezes it at flatten time.`,
      fix: "Don't write through `route.meta`. Move the per-navigation state to your own store, context, or signal. If you need a route-specific default, define `meta` on the route record itself (read-only by design) and read it via `useRoute().meta.X`.",
      fixCode: `// BAD — throws TypeError, meta is frozen + shared across navigations:
// (route.meta as any).viewedAt = Date.now()

// GOOD — per-navigation state in your own store:
const viewedAt = signal<number | null>(null)
onBeforeRouteEnter(() => { viewedAt.set(Date.now()) })`,
    }),
  },
  {
    // runtime-dom URL-injection guard. The warning fires when a
    // javascript:/data: URL is dropped from a URL-bearing attribute
    // (href/src/action/formaction/poster/cite/data). data:image/* is allowed
    // on image elements (<img>/<source>/<video> via src/srcset/poster) — this
    // is why <Image>/<OptimizedImage> blur+color placeholders work; the
    // post-0.28.0 fix stopped this guard from over-blocking them.
    pattern: /Blocked unsafe URL in "(\w+)" attribute/,
    diagnose: (m) => ({
      cause: `A \`javascript:\` or \`data:\` URL was blocked in the "${m[1]}" attribute to prevent injection. \`data:image/*\` URIs are allowed ONLY on image elements (\`<img>\`/\`<source>\`/\`<video>\` via \`src\`/\`srcset\`/\`poster\`); \`data:text/html\` on \`<iframe>\`/\`<object>\`, scripted SVG (\`<script>\`/\`on*=\`), \`data:\` on \`<a href>\`/\`<form action>\`, and \`javascript:\` anywhere stay blocked.`,
      fix: 'For an image/placeholder data URI, render it on an <img>/<source>/<video> src/srcset/poster. For everything else use a real URL — the runtime blocks javascript:/data: in URL attributes by design.',
      fixCode: `// ✓ allowed — image data URI on an image element:
<img src="data:image/webp;base64,UklGRvoA..." />
// ✓ allowed — scriptless SVG placeholder:
<img src="data:image/svg+xml,<svg>...</svg>" />

// ✗ blocked — data: on a navigable element:
// <a href="data:text/html,..." />
// ✗ blocked — scripted SVG:
// <img src="data:image/svg+xml,<svg onload=...>" />`,
    }),
  },
  {
    // mountFor LIS-scratch retention (fixed 2026-07): memory-growth symptom
    // when a large keyed list is reordered then filtered down.
    pattern: /(memory|heap|retained).*(For|list|rows).*(shrink|filter|grow|leak)|removed rows.*(retain|pinned|memory|leak)/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/runtime-dom` versions before the LIS-scratch release fix, `<For>`\u2019s reorder scratch retained ForEntry references after each pass. A large reorder followed by a SHRINK (10k rows filtered to 50) left the stale scratch tail pinning every removed row\u2019s DOM subtree + cleanup closure for as long as the <For> stayed mounted.',
      fix: 'Upgrade `@pyreon/runtime-dom` — the scratch is now released (`entries.fill(undefined, 0, n)`) at the end of every reorder pass. No app code change needed.',
      fixCode: `// This access pattern no longer retains the removed 9,950 rows:
rows.set(tenThousandRows)   // large keyed <For>
rows.update(shuffle)        // reorder fills the LIS scratch
rows.set(filtered50)        // shrink — removed rows are now GC-eligible`,
    }),
  },
  {
    // SSR↔hydration parity fixes (2026-07 fuzz campaign): symptoms of the
    // OLD hydration behavior — duplicated lists, mismatches, or dynamic
    // content rendered wrong after hydration.
    pattern: /hydrat.*(duplicat|twice|doubled|wrong order)|<For>.*(duplicat|twice|doubled).*hydrat|\[object Object\].*(hydrat|reactive|accessor)|SSR.*(duplicat|doubled).*hydrat/i,
    diagnose: () => ({
      cause:
        'On `@pyreon/runtime-dom` / `@pyreon/runtime-server` versions before the SSR↔hydration parity release, hydration had cursor/extent bugs: a `<For>` duplicated its list (fresh rows mounted while the SSR rows stayed), adjacent text-producing children (merged into one node by the HTML parser) misaligned the sibling cursor, a reactive accessor with a multi-root initial removed only ONE node before re-mounting, and a reactive text accessor that later yielded a VNode rendered `[object Object]`.',
      fix: 'Upgrade `@pyreon/runtime-dom` + `@pyreon/runtime-server` together. The SSR renderer now wraps reactive-accessor children in `<!--$-->…<!--/$-->` hydration range markers and hydration consumes them (plus the `<!--pyreon-for-->` block) as a unit; a shared `bindPolymorphicText` upgrades a text binding to a subtree mount when the value stops being text. No app code change needed. NOTE: reactive-accessor children now carry `<!--$-->` comment markers in SSR output — update any snapshot/string assertions on SSR HTML for dynamic content to account for them.',
      fixCode: `// All correct after upgrade — no code change:
<ul><For each={rows} by={r => r.id}>{r => <li>{r.name}</li>}</For></ul>  // no dup on hydrate
<div>{count()}{' items'}</div>                                            // adjacent text OK
{() => loading() ? 'Loading…' : <Table/>}                                 // text→VNode OK`,
    }),
  },
]

/** Diagnose an error message and return structured fix information */
export function diagnoseError(error: string): ErrorDiagnosis | null {
  for (const { pattern, diagnose } of ERROR_PATTERNS) {
    const match = error.match(pattern)
    if (match) {
      return diagnose(match)
    }
  }
  return null
}
