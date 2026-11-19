// The set of `@pyreon/*` packages PMTC treats as web-only, with each package's
// manifest rationale. ONE module, TWO consumers: the parser's blanket import
// warning (`parse.ts:warnWebOnlyImports`) and the project audit
// (`native-audit.ts`, served as `@pyreon/native-compiler/audit`). The audit
// used to carry its own generated copy in `@pyreon/compiler`; two copies of one
// derived set is two things to drift, so the set lives here and nowhere else.
//
/**
 * Packages with no native emit at all — importing one into shared source is a
 * build failure waiting to happen, so warn at parse time with the fix.
 *
 * DERIVED from every package manifest's `multiplatform` declaration: a package
 * lands here when it declares `tier: 'web-only'` AND no `nativeFrontend`.
 *
 * This list used to be hand-written, and it rotted in both directions —
 * twice. `@pyreon/sync` and `@pyreon/rich-text` were MISSING, so
 * `syncedSignal(...)` / `createRichTextEditor(...)` emitted verbatim and died
 * with "cannot find … in scope" and no diagnostic. `@pyreon/toast` went STALE
 * the other way once its core started lowering to PyreonToast, warning that a
 * working API was unusable. Both were repaired after the fact, by hand, with a
 * comment — which is what a silent-hole generator looks like from the inside.
 *
 * Packages that lower only PART of their surface (toast, a11y, query) declare
 * `nativeFrontend` in their manifest and are correctly absent here; their
 * unlowered halves are still caught by the per-hook and per-construct warns.
 */
// <gen:web-only-packages:start>
// GENERATED — do not edit by hand. Derived from every package manifest's
// `multiplatform` declaration (tier === 'web-only' AND no `nativeFrontend`)
// by `bun scripts/check-multiplatform-tier.ts --write-table`, which also
// gates that this stays in sync. Edit the MANIFEST, not this list.
//
// The value is the manifest's `rationale` — the per-package reason the
// warning quotes, so one blanket line does not have to serve packages as
// different as a linter, a `<head>` manager and an animation engine.
export const WEB_ONLY_PACKAGES: ReadonlyMap<string, string> = new Map([
  ['@pyreon/ambient', "not lowered by PMTC: the package is context plus timers on the web runtime (`document.hidden`, `setTimeout`, the owner-based context); native apps carry their own locale, zone and clock through the host runtime"],
  ['@pyreon/atlas', "the component workbench — dev tooling that runs in a browser, not app runtime"],
  ['@pyreon/calendar', "an event calendar is a DOM view (pointer, keyboard and layout); the pure core is plain TypeScript a native app can call itself"],
  ['@pyreon/charts-maps', "it is DATA: TopoJSON modules a web `<MapChart>` decodes at load. A native map takes a precomputed `GeoShape[]` const (a world boundary constant that compiles within the Swift and Kotlin limits is under investigation), so these modules are not lowered to iOS or Android yet."],
  ['@pyreon/command', "a keyboard-driven DOM overlay built on @pyreon/hotkeys; native apps have no command palette convention and the matcher is plain TypeScript a native app can call itself"],
  ['@pyreon/compiler', "the web JSX compiler + build tooling itself; the native sibling is @pyreon/native-compiler — nothing here ships to an app runtime"],
  ['@pyreon/config', "build-time config shape read by the tooling that assembles an app — never part of a rendered app on any target"],
  ['@pyreon/connector-document', "bridges ui-components to @pyreon/document extraction — both ends are web/document engines"],
  ['@pyreon/document', "wraps pdfmake/docx/exceljs/pptxgenjs (browser/node document engines); no native lowering. Build the file on a server and fetch it (useFetch / @pyreon/http lower), or hand the result to the platform share sheet (useShare lowers)."],
  ['@pyreon/document-primitives', "document-authoring primitives feeding the pdfmake/docx renderers"],
  ['@pyreon/format', "formats through the platform's Intl; the PMTC native lowering of these calls is planned (the native compiler already lowers a core set of Intl number/date formatting) but not shipped, so native apps render it behind the Web escape hatch or format on the web side today"],
  ['@pyreon/lathe', "the code generator — build-time tooling that emits app code, not app runtime itself"],
  ['@pyreon/lint', "lint tooling — runs at dev time, not app runtime"],
  ['@pyreon/loom', "the dependency observatory — dev tooling, not app runtime"],
  ['@pyreon/mcp', "the MCP server — dev/AI tooling, not app runtime"],
  ['@pyreon/money', "not lowered by PMTC yet: pure computation on strings and bigint, so it can become `shared` once Swift and Kotlin ports of the same functions exist (a Money is already how payment APIs send amounts); until then the compiler warns on import rather than miscompiling"],
  ['@pyreon/runtime-dom', "the DOM renderer — on native, PMTC emits SwiftUI/Compose instead of running a renderer; `<Transition>` / `<TransitionGroup>` DO cross, but import them from `@pyreon/primitives` (this package is web-only, so importing them from here warns)"],
  ['@pyreon/runtime-server', "server-side HTML rendering (SSR/streaming) — a web-platform concern with no native analogue"],
  ['@pyreon/schedule', "not lowered by PMTC yet: pure computation on strings and numbers over @pyreon/time, which is web-only itself; it can become `shared` together with @pyreon/time once Swift and Kotlin ports exist; until then the compiler warns on import rather than miscompiling"],
  ['@pyreon/server', "SSR handler + islands for web deployments; native apps have no server-rendered HTML"],
  ['@pyreon/testing', "the web testing kit (Testing-Library parity over the DOM renderer); native testing is XCUITest/Compose-test territory"],
  ['@pyreon/time', "not lowered by PMTC yet: the package is pure computation on strings and numbers (an Instant is epoch milliseconds, exactly how a date is represented natively), so it can become `shared` once the Swift and Kotlin ports of the same functions exist; until then the compiler warns on import rather than miscompiling"],
  ['@pyreon/ui-components', ""],
  ['@pyreon/ui-primitives', ""],
  ['@pyreon/unistyle', "responsive breakpoints + CSS-variable theming over real CSS; native theming is compile-time tokens + the 2-bucket size-class model"],
  ['@pyreon/upload', "not lowered by PMTC: it is built on the browser File, Blob, XMLHttpRequest, DataTransfer and object URL APIs, which have no Swift or Kotlin counterpart in the compiler yet; native apps pick files with the platform pickers and upload with their own networking"],
  ['@pyreon/virtual', "DOM virtualization (scroll containers, measured rows). Native lists are lazy by construction: render the rows with a `<For>` as the ONLY child of a `<Scroll>` (LazyVStack on iOS, LazyColumn on Android) and no virtualizer is needed. Do not nest that `<For>` among other children inside a `<Scroll>`: Compose rejects a lazy list inside a scrolling Column at measure time."],
  ['@pyreon/zero', "the web meta-framework (SSR/SSG/ISR, Vite, fs-router); native apps are built by PMTC + create-multiplatform, not zero"],
  ['@pyreon/zero-content', "markdown/MDX content pipeline and blog module for zero's web rendering: a Vite plugin, SSG/SSR pages and document head tags — nothing here has a native target"],
])
// <gen:web-only-packages:end>
