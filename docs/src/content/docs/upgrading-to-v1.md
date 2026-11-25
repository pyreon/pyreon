---
title: Upgrading to 1.0
description: Every breaking change between Pyreon 0.54 and the 1.0 release candidate, with before-and-after code and the pyreon upgrade codemod that migrates it, or the step you take by hand.
---

This page takes an app from **0.54** to the **1.0 release candidate** (`1.0.0-rc.N`). 0.55 is the last `0.x` release; everything listed here landed in 0.55 or in the release candidate, as part of the 1.0 API freeze. From 1.0 on, a breaking change to a Stable package ships only in a major release (see [Stability, Versioning & Direction](/docs/stability-and-direction)), so this is the last migration of this size.

Each change says which `pyreon upgrade` codemod handles it, or that it is **by hand**. A codemod only makes edits that keep behaviour the same. Changes that alter behaviour, or that a codemod cannot make safely, are by hand: the type checker or a `[Pyreon]` dev warning points at most of them.

On an older version than 0.54? The same command also runs the codemods of the releases you skip (every codemod introduced after your lowest `@pyreon/*` version), so you can upgrade in one step. Read those releases' changelogs too: the [codemod table](/docs/cli#upgrade-codemods) lists what they migrate.

## How to upgrade

1. **Check the platform floors.** Pyreon 1.0 needs Node.js 22 or later (or Bun 1.3 or later); browsers at Baseline 2024; iOS 17 and Android `minSdk` 26 for the native targets. See the [support matrix](/docs/stability-and-direction#support-matrix).
2. **Run `pyreon upgrade` from the new CLI.** The codemods ship inside `@pyreon/cli`, so run the release candidate's CLI, not the one your project has installed:

   ```bash
   npx @pyreon/cli@rc upgrade --to 1.0.0-rc.0 --exact          # dry run: the version plan and every file each codemod would change
   npx @pyreon/cli@rc upgrade --to 1.0.0-rc.0 --exact --write  # apply
   npm install                                                  # or bun install / pnpm install
   ```

   Use the newest release candidate in place of `1.0.0-rc.0`, and `@latest` with `--to 1.0.0` once 1.0.0 is out. The codemods need the `typescript` package in the project. `--exact` pins every `@pyreon/*` dependency to the same version, which 1.0 requires (see [one version for every package](#one-version-for-every-package)).
3. **Work through the by-hand changes below** that apply to the packages you use. The [summary](#summary) lists them.
4. **Typecheck, test, and run `pyreon doctor`.** In development, watch the console for `[Pyreon]` warnings: several changes below warn at the exact call site. With an AI assistant, the MCP `diagnose` tool recognises the symptoms of code written for the old `useLoaderData()` shape.

## Summary

| Change | Packages | Handled by |
| --- | --- | --- |
| [Node.js 22 and the other platform floors](#platform-floors) | all | by hand |
| [One version for every package](#one-version-for-every-package) | all | `pyreon upgrade --exact` |
| [Internal exports moved to `./internal` and `@pyreon/core/compat`](#internal-exports-moved-off-the-public-entries) | core, reactivity, runtime-dom, runtime-server, server, zero, zero-content, fundamentals, tools | codemod `internal-exports-subpath`, plus by hand for the `@internal` set |
| [`useForm` has one option shape](#useform-has-one-option-shape) | form | codemod `form-use-form-fields` |
| [`toast.list()` replaces `_toasts`](#toastlist-replaces-_toasts) | toast | by hand |
| [Ambient test hooks lose the underscore](#ambient-test-hooks-lose-the-underscore) | ambient | by hand |
| [`useLoaderData()` returns an accessor](#useloaderdata-returns-an-accessor) | router, zero | by hand |
| [A query-only navigation keeps the page mounted](#a-query-only-navigation-keeps-the-page-mounted) | router | by hand |
| [`provide()` after a child was built is not visible to it](#provide-after-a-child-was-built-is-not-visible-to-it) | core, runtime-dom | by hand (dev warning) |
| [Compiled refs run after children and attributes](#compiled-refs-run-after-children-and-attributes) | compiler, runtime-dom | by hand (recompile libraries) |
| [An error reaches the `<ErrorBoundary>` that encloses it](#an-error-reaches-the-errorboundary-that-encloses-it) | core, runtime-dom | by hand |
| [Server island names are validated](#server-island-names-are-validated) | server | by hand |
| [Money uses ISO 4217 digits and codes](#money-uses-iso-4217-digits-and-codes) | money | by hand |
| [Calendar business hours default to a Saturday and Sunday weekend](#calendar-business-hours-default-to-a-saturday-and-sunday-weekend) | calendar | by hand |
| [Atlas runs as a zero app](#atlas-runs-as-a-zero-app) | atlas | by hand |
| [The `pyreon` bin moved; importing `@pyreon/cli` runs nothing](#the-pyreon-bin-moved) | cli | by hand |
| [Native router stack elements carry no query](#native-router-stack-elements-carry-no-query) | native-router-swift, native-router-kotlin | by hand |
| [Android remote images use Coil 3](#android-remote-images-use-coil-3) | native-cli, create-multiplatform | by hand |
| [Smaller behaviour changes](#smaller-behaviour-changes) | validate, runtime-dom | by hand, rarely needed |

## Everyone

### Platform floors

Every published package now declares `"engines": { "node": ">=22" }`, and `@pyreon/native-router-swift` declares iOS 17 / macOS 14, like `@pyreon/native-runtime-swift` already did (its public types already required iOS 17). By hand: run on Node.js 22 or later (or Bun 1.3 or later), and raise an iOS app's deployment target to 17.0 and an Android app's `minSdk` to 26 if they are lower.

```yaml
# ios/project.yml, before
deploymentTarget:
  iOS: '16.0'
# after
deploymentTarget:
  iOS: '17.0'
```

### One version for every package

Every `@pyreon/*` package depends on the others at **exactly** its own version (`"@pyreon/core": "1.0.0-rc.0"`, not `^…`), because packages share internals that change in any release. An install that mixes versions gets duplicate copies of stateful packages (core, router, styler) and fails at runtime. `pyreon upgrade --exact --write` sets every `@pyreon/*` dependency in your `package.json` to the same version; `pyreon info` reports any skew left in the installed tree.

```jsonc
// before
"@pyreon/core": "^0.54.0",
"@pyreon/router": "^0.53.0"
// after
"@pyreon/core": "1.0.0-rc.0",
"@pyreon/router": "1.0.0-rc.0"
```

## Core and runtime

### Internal exports moved off the public entries

Exports that were never public API left the main entries for subpaths with no semver promise: each package's `./internal` (`./internal-server` for the Node-only helpers of `@pyreon/zero` and `@pyreon/zero-content`), and `@pyreon/core/compat` for the plumbing of the compat layers. Application code should not need any of them; tests that call a reset helper change the import specifier. The compiler-emitted helpers (`_rp`, `_tpl`, `_ssr*`, …) are the compiler ABI and stay where they were.

```ts
// before
import { _resetIdCounter } from '@pyreon/core'
import { _resetHotkeys } from '@pyreon/hotkeys'
import { mapCompatDomProps } from '@pyreon/core'
// after
import { _resetIdCounter } from '@pyreon/core/internal'
import { _resetHotkeys } from '@pyreon/hotkeys/internal'
import { mapCompatDomProps } from '@pyreon/core/compat'
```

**Codemod `internal-exports-subpath`** rewrites static imports of every `_`-prefixed export that moved (core, reactivity, runtime-dom, runtime-server, server, zero, zero-content, primitives, solid-compat, vite-plugin, lint, store, i18n, state-tree, form, command, http, storage, document, hotkeys, toast, ambient) and of the `@pyreon/core/compat` names (`isNativeCompat`, `NATIVE_COMPAT_MARKER`, `mapCompatDomProps`, `shallowEqualProps`, `_compatProps`). `nativeCompat()` stays public on `@pyreon/core`.

**By hand:** internals without a `_` prefix moved too, and no codemod rewrites them. Import each from the package's `./internal` (or `./internal-server`) subpath:

- `@pyreon/core/internal`: `dispatchToErrorBoundary`, `propagateError`, `runWithHooks`, `setContextStackProvider`, `getContextStackLength`, `removeContextFrame`, `REACTIVE_PROP`, `isSafeImageDataUri`. (`pushContext` / `popContext` stay public.)
- `@pyreon/zero/internal`: the action plumbing (`ACTION_QUERY_PARAM`, `ENHANCED_ACTION_HEADER`, `ACTION_REDIRECT_HEADER`, `formActionSearch`, `resolveActionOptions`, `checkActionOrigin`, `readActionPayload`, `runActionHandler`), `toRfc822`, `matchLocale`, `validateLocale`, `islandsOnlyNavigation`, `buildHydrationReport`. `@pyreon/zero/internal-server`: the image, font, favicon, OG-image, SEO, cache-glob and API-route helpers the build uses. `LocaleCtx` is removed from `@pyreon/zero/i18n-routing` (nothing provided or read it).
- `@pyreon/zero-content/internal` and `/internal-server`: the registry, search, breadcrumb, blog-frontmatter and plugin helpers, `joinUrl` among them.
- `@pyreon/lint/internal`: `formatRuleList`, `parseRuleOptionsOverride`, `formatInitResult`, `parsePresetList`, `lintSlice`. `@pyreon/storybook/internal`: `previewPathFor`. `@pyreon/styler/internal`: `setStyleExtraction`. `@pyreon/ui-core/internal`: `getThemeEngine`, `setThemeEngine`. `@pyreon/validate/internal`: `installServerCheck`, `getServerCheck` (`uninstallServerCheck` stays on `@pyreon/validate/server`). `@pyreon/vite-plugin/internal`: the LPIH helpers, `isPyreonPackageFile`, `plainMarkerLocalNames`.

The full list, name by name, is in each package's changelog for this release. The type checker reports every import that no longer resolves.

### `provide()` after a child was built is not visible to it

A component becomes its children's context owner on its first `provide()`. A `provide()` that runs after the component already built a child (late in the setup body, in `onMount`, in an effect) is no longer visible to that child; before, the child could see it by accident of the owner chain. By hand; development builds warn at the late call.

```tsx
// before: worked by accident
function Panel() {
  const body = <Toolbar />
  provide(ThemeContext, theme)
  return body
}
// after: provide before building children
function Panel() {
  provide(ThemeContext, theme)
  return <Toolbar />
}
```

### Compiled refs run after children and attributes

A compiled `ref` (written on the element or carried in a spread) now runs after its element's children and attributes are in place, as an `h()` ref always did. A child's ref fires before its parent's, and in a compiled template every ref fires once the whole template is built. A ref that read its element used to see template placeholders and attributes not yet computed; it now sees the mounted content. Most code needs no change, and code that worked around the old order can drop the workaround. Layout reads still belong in `onMount`.

```tsx
// before: deferred to see the real children
<ul ref={(el) => queueMicrotask(() => setCount(el.children.length))}>{rows}</ul>
// after
<ul ref={(el) => setCount(el.children.length)}>{rows}</ul>
```

By hand, for library authors: **recompile** a library that ships compiled Pyreon output. Output from the new compiler needs the new `@pyreon/runtime-dom`; old output keeps the old ref order on the new runtime. Both are in the same version group, so matching versions (see above) keep them aligned.

### An error reaches the `<ErrorBoundary>` that encloses it

`<ErrorBoundary>` now catches errors from the subtree it encloses, found through the component tree. Before, an error went to the boundary mounted **last**, so a component that threw next to a mounted boundary rendered that sibling's fallback, and an async component's rejection went to whichever boundary mounted last. An error thrown while a boundary shows its fallback (including a `fallback` that rethrows) goes to the next boundary out. By hand: if a component relied on a sibling's boundary, wrap it in its own.

```tsx
// before: an error in <Feed> rendered the Sidebar boundary's fallback
<ErrorBoundary fallback={SidebarError}><Sidebar /></ErrorBoundary>
<Feed />
// after: give <Feed> its own boundary (or one around both)
<ErrorBoundary fallback={SidebarError}><Sidebar /></ErrorBoundary>
<ErrorBoundary fallback={FeedError}><Feed /></ErrorBoundary>
```

An error with no enclosing boundary is reported to `registerErrorHandler` and logged in development. A `<Defer>` chunk that fails to load now goes to the enclosing boundary as well, and the boundary's `reset()` retries it.

## Router and data loading

### `useLoaderData()` returns an accessor

`useLoaderData()` returns `() => T`, like `useRoute()` and `useMiddlewareData()`, so data that changes under the same route (`revalidate()`, `staleWhileRevalidate`, a server loader) arrives in place without remounting the page. By hand: call the accessor where the value is used.

```tsx
// before
const data = useLoaderData<Post>()
return <h1>{data.title}</h1>
// after
const data = useLoaderData<Post>()
return <h1>{data().title}</h1>
```

A destructure (`const { title } = useLoaderData()`) or a read of `data()` into a body `const` no longer follows the data. Read it in JSX (`{data().title}`), `<For each={() => data().items}>`, `<Show when={() => data().post}>`, `useHead(() => ({ title: data().title }))`, or an `effect` / `computed`. An early `if (!data) return …` in the body becomes a returned accessor: `return () => (data() ? <Page /> : null)`. On the native targets the accessor lowers to the same Swift and Kotlin reads; a destructure is no longer lowered and warns.

### A query-only navigation keeps the page mounted

A navigation that changes only the query or the hash no longer remounts the route component, on `push`, `replace`, Back/Forward, nested layouts and tab stacks. The page's `params`, `query` and `meta` props are live instead. It still remounts when its params or its loader key change. By hand: code that read the query **once** in the body stops updating; read it reactively.

```tsx
// before: re-ran on every ?page= change because the page remounted
function Results(props: { query: { page?: string } }) {
  onMount(() => { load(Number(props.query.page ?? 1)) })
  return <List />
}
// after
function Results(props: { query: { page?: string } }) {
  effect(() => { load(Number(props.query.page ?? 1)) })
  return <List />
}
```

Alternatively, give a query-dependent route a `loaderKey` that includes the query, which remounts the page per key. A `replace()` that changes only the query now defaults to `{ scroll: false, viewTransition: false }`; pass `{ scroll: true }` to keep the old scroll-to-top. `useSearchParams` setters and `@pyreon/url-state` writes pass both as `false`.

### Server island names are validated

One name rule now applies to `serverIsland()` registration, the browser and zero's fragment endpoint: no `/`, `\` or `%` (or a full-width look-alike), no control or format characters (C0, DEL, C1, U+2028, U+2029, bidi overrides, zero-width characters), not empty and not only dots. A name that breaks it throws a `[Pyreon]` error at `serverIsland()`. By hand: rename the island.

```ts
// before
const Weekly = serverIsland(() => import('./Weekly'), { name: 'reports/weekly' })
// after
const Weekly = serverIsland(() => import('./Weekly'), { name: 'reports-weekly' })
```

## Fundamentals

### `useForm` has one option shape

`useForm({ initialValues, validators, onSubmit, … })` is the one shape. The `fields` shape, `useForm({ fields: [field('email', '', validate), …] })`, is removed together with `field()` and the `FieldDefinition`, `InferFieldValues` and `UseFormFieldsOptions` types. `useField`, `<Form>`, `<FormProvider>` and context-based reads are unchanged.

```ts
// before
import { field, useForm } from '@pyreon/form'
const email = field('email', '', required)
const form = useForm({ fields: [email, field('age', 0)], onSubmit })
// after
import { useForm } from '@pyreon/form'
const form = useForm({ initialValues: { email: '', age: 0 }, validators: { email: required }, onSubmit })
```

**Codemod `form-use-form-fields`** makes this rewrite when every field is an inline `field(…)` call or a `const x = field(…)` in the same file with a string-literal name; explicit type arguments become an `as` cast so the inferred types do not change. Definitions imported from another module, computed names and spreads are left for the type checker to report. `_resetDevtools` moved from `@pyreon/form/devtools` to `@pyreon/form/internal` (codemod `internal-exports-subpath`).

### `toast.list()` replaces `_toasts`

`_toasts` and `_reset` moved to `@pyreon/toast/internal`. App code that read the queue uses the new public `toast.list()`, a reactive, read-only view of the live toasts, oldest first. By hand (the codemod moves `_reset` but not `_toasts`, so the type checker points at each use).

```ts
// before
import { _toasts } from '@pyreon/toast'
const count = () => _toasts().length
// after
import { toast } from '@pyreon/toast'
const count = () => toast.list().length
```

In tests, use `clearToasts`, `getToasts`, `expectToast` and `findToast` from `@pyreon/testing/toast`.

### Ambient test hooks lose the underscore

`@pyreon/ambient/testing` stays the supported test kit; its two documented hooks are renamed with no alias. By hand.

```ts
// before
import { _resetClockState, _resetLocaleState } from '@pyreon/ambient/testing'
// after
import { resetClockState, resetLocaleState } from '@pyreon/ambient/testing'
```

`_fireAll` and `_tickerStats` moved to `@pyreon/ambient/internal` (codemod `internal-exports-subpath`).

### Money uses ISO 4217 digits and codes

`@pyreon/money` (Experimental) now ships ISO 4217 list one (178 codes) with ISO 4217 minor units, the same on every engine. Both used to come from `Intl`, which differs between V8 and JavaScriptCore. By hand:

- On V8 (Node, Chrome), `currencyDigits('HUF')` is now 2 (was 0) and `IQD` is 3 (was 0). A stored HUF amount such as `"100"` must become `"100.00"`.
- Codes withdrawn from ISO 4217 (`BGN`, `HRK`, `ANG`, `CUC`, `SLL`, `ZWL` and others) are rejected: `isMoney` fails and `money()` throws. To keep reading old records, register the code at startup, in a module both the server and client entries import:

```ts
// before: accepted on JavaScriptCore, rejected on V8
money('10.00', 'BGN')
// after
defineCurrency('BGN', { digits: 2 }) // once, at startup
money('10.00', 'BGN')
```

`_currencyStats()` no longer reports `remembered`.

### Calendar business hours default to a Saturday and Sunday weekend

`businessHours` in `@pyreon/calendar` (Experimental) is now read through `@pyreon/schedule`, so the shading and `constrainTo: 'businessHours'` agree with `isOpen`. A `BusinessCalendar` without `weekend` now closes Saturday and Sunday (it used to have no weekend). A holiday no longer cuts off the previous night's overnight window, and `specialHours` is honoured. A malformed value is now validated and reports schedule's `[Pyreon]` error instead of being read leniently. By hand: to keep every day open, say so.

```ts
// before: no weekend
businessHours: { hours }
// after: the same calendar
businessHours: { hours, weekend: [] }
```

A bare `WorkingHours` (without the `BusinessCalendar` wrapper) still opens every weekday it lists.

## Tools

### Atlas runs as a zero app

`atlas dev` and `atlas build` (Experimental) now run the workbench as a `@pyreon/zero` app. By hand:

- Install zero next to Vite and the plugin (all optional peers; `atlas scan` needs none): `bun add -d vite @pyreon/vite-plugin @pyreon/zero`.
- `atlas build --base` must be absolute (`/` or `/my-repo/`); a relative base is refused.
- The `__ATLAS_ROUTES__` global is gone: a host that wants path URLs passes the new `route` prop to `<Workbench>`.
- `@pyreon/atlas/dev` no longer exports `devHtml` or `ENTRY_ID`; it exports `SHELL_ID`.
- Atlas no longer accepts a `pyreon` named export from `@pyreon/vite-plugin` as an alias for its default export (the package never had one): import the default.

```bash
# before
atlas build --base ./
# after
atlas build --base /my-repo/
```

### The `pyreon` bin moved

The `pyreon` command is now `bin/pyreon.js` in `@pyreon/cli`, and importing `@pyreon/cli` as a library no longer runs the CLI (it used to, which made `zero doctor` print two reports). `pyreon …` in a project that installs `@pyreon/cli`, `npx @pyreon/cli …` and package scripts are unaffected. By hand, only if you invoked the package's library entry directly:

```bash
# before
node node_modules/@pyreon/cli/lib/index.js doctor
# after
npx @pyreon/cli doctor
```

Every CLI now exits only after piped output has flushed, so `pyreon doctor --ci --json | jq` receives the whole report.

## Native targets

### Native router stack elements carry no query

In `@pyreon/native-router-swift` and `@pyreon/native-router-kotlin` (Experimental), each `router.path` and `tabPaths` element is now the route **without** its query or fragment (`/search`, not `/search?q=cat`), so a query-only change no longer rebuilds the screen. Loader data is keyed by the route without the query. By hand:

```swift
// before
let current = router.path.last // "/search?q=cat"
let data = router.loaderData[fullUrl]
// after
let current = router.currentPath // "/search?q=cat" (routePath gives "/search")
let data = router.loaderData[PyreonRouter.loaderKey(fullUrl)]
```

On Kotlin, read `router.currentPath`, `router.query` or `tabTop(name)` the same way.

### Android remote images use Coil 3

A remote `<Image src="http…">` now emits Coil 3's `AsyncImage`. By hand, in an existing scaffolded app's `android/app/build.gradle.kts`:

```kotlin
// before
implementation("io.coil-kt:coil-compose:2.7.0")
// after
implementation("io.coil-kt.coil3:coil-compose:3.6.3")
implementation("io.coil-kt.coil3:coil-network-okhttp:3.6.3")
```

The network artifact is required: without it, Coil 3 has no HTTP fetcher and an http(s) image renders nothing.

## Smaller behaviour changes

These need action only if your code depends on the old behaviour:

- **`@pyreon/validate` `email()`** accepts internationalised domains (`jan@müller.de`, punycode TLDs such as `xn--p1ai`) at every precision, and `rfc5322` refuses a domain label longer than 63 characters.
- **Hydration** recovers from a server/client mismatch without leaving its range. A value that renders nothing (`null`, `false`, `''`) over server content now removes that content and reports the mismatch in development.
- **`@pyreon/auth`** (Experimental) first appeared on npm as 0.54.0, published by hand; from 0.55 it is published by CI with provenance. Nothing changes for an app already on 0.54.0.

For everything else, including fixes and new features, read the package changelogs (or ask the MCP `get_changelog` tool for the range you are crossing).
