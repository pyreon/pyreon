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
  ['@pyreon/atlas', "the component workbench — dev tooling that runs in a browser, not app runtime"],
  ['@pyreon/code', "wraps CodeMirror 6 (DOM editor engine); consume on native via the `<WebView>` bridge subpath"],
  ['@pyreon/compiler', "the web JSX compiler + build tooling itself; the native sibling is @pyreon/native-compiler — nothing here ships to an app runtime"],
  ['@pyreon/config', "build-time config shape read by the tooling that assembles an app — never part of a rendered app on any target"],
  ['@pyreon/connector-document', "bridges ui-components to @pyreon/document extraction — both ends are web/document engines"],
  ['@pyreon/document', "wraps pdfmake/docx/exceljs/pptxgenjs (browser/node document engines); no native lowering"],
  ['@pyreon/document-primitives', "document-authoring primitives feeding the pdfmake/docx renderers"],
  ['@pyreon/head', "document `<head>` management — no equivalent surface exists on iOS/Android"],
  ['@pyreon/lathe', "the code generator — build-time tooling that emits app code, not app runtime itself"],
  ['@pyreon/lint', "lint tooling — runs at dev time, not app runtime"],
  ['@pyreon/loom', "the dependency observatory — dev tooling, not app runtime"],
  ['@pyreon/mcp', "the MCP server — dev/AI tooling, not app runtime"],
  ['@pyreon/rich-text', "wraps TipTap/ProseMirror (DOM editor); consume on native via the `<WebView>` bridge subpath"],
  ['@pyreon/runtime-dom', "the DOM renderer — on native, PMTC emits SwiftUI/Compose instead of running a renderer; `<Transition>` / `<TransitionGroup>` DO cross, but import them from `@pyreon/primitives` (this package is web-only, so importing them from here warns)"],
  ['@pyreon/runtime-server', "server-side HTML rendering (SSR/streaming) — a web-platform concern with no native analogue"],
  ['@pyreon/server', "SSR handler + islands for web deployments; native apps have no server-rendered HTML"],
  ['@pyreon/testing', "the web testing kit (Testing-Library parity over the DOM renderer); native testing is XCUITest/Compose-test territory"],
  ['@pyreon/ui-components', ""],
  ['@pyreon/ui-primitives', ""],
  ['@pyreon/unistyle', "responsive breakpoints + CSS-variable theming over real CSS; native theming is compile-time tokens + the 2-bucket size-class model"],
  ['@pyreon/virtual', "DOM virtualization (scroll containers, measured rows); native lists are lazy by construction (LazyColumn/LazyVStack)"],
  ['@pyreon/zero', "the web meta-framework (SSR/SSG/ISR, Vite, fs-router); native apps are built by PMTC + create-multiplatform, not zero"],
  ['@pyreon/zero-content', "markdown/MDX content pipeline for zero's web rendering"],
])
// <gen:web-only-packages:end>
