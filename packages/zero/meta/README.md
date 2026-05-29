# @pyreon/meta

Single-import barrel — the full Pyreon fundamentals + UI-system ecosystem from one package.

Re-exports 33 `@pyreon/*` packages so apps can write `import { signal, useQuery, useForm, styled, PyreonUI } from '@pyreon/meta'` instead of remembering subpackages. Tree-shake-safe by construction: meta itself and every re-exported package declare `"sideEffects": false`, so modern bundlers (Vite/Rolldown, Webpack/Next.js, esbuild, Rollup, Parcel, Bun) only pull the subgraphs you actually import. Heavy renderers stay lazy at the source — `@pyreon/document` lazy-loads PDF/DOCX/XLSX/PPTX chunks inside `render()`, and `@pyreon/charts` / `@pyreon/code` / `@pyreon/flow` lazy-load ECharts / CodeMirror grammars / elkjs inside their consumer hooks.

## Install

```bash
bun add @pyreon/meta
```

## Quick start

```ts
import {
  // Reactivity (re-exported via @pyreon/store)
  signal,
  computed,
  effect,
  batch,

  // State management
  defineStore,
  resetAllStores,

  // Data fetching
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,

  // Forms
  useForm,
  useField,
  useFieldArray,
  FormProvider,
  zodSchema,
  zodField,

  // i18n
  createI18n,
  I18nProvider,
  useI18n,
  Trans,

  // Styling
  styled,
  css,
  keyframes,
  PyreonUI,
  useMode,

  // Hooks
  useHover,
  useFocus,
  useBreakpoint,

  // Layout primitives
  Element,
  Text,
  List,
  Overlay,
  Portal,
  Container,
  Row,
  Col,

  // Misc
  toast,
  Toaster,
  useUrlState,
  useStorage,
} from '@pyreon/meta'
```

## What's re-exported

### Fundamentals

| Source                | Highlights                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pyreon/store`       | `defineStore`, `signal`, `computed`, `effect`, `batch`, `addStorePlugin`, `resetStore`, `resetAllStores`                                              |
| `@pyreon/form`        | `useForm`, `useField`, `useFieldArray`, `useFormContext`, `useFormState`, `useWatch`, `FormProvider`                                                  |
| `@pyreon/validation`  | `zodSchema`, `zodField`, `SchemaAdapter`, `ValidationIssue`                                                                                           |
| `@pyreon/query`       | `QueryClient`, `QueryClientProvider`, `useQuery`, `useMutation`, `useInfiniteQuery`, `useIsFetching`, `useIsMutating`, `useQueryClient`               |
| `@pyreon/table`       | `useTable`, `flexRender`                                                                                                                              |
| `@pyreon/virtual`     | `useVirtualizer`, `useWindowVirtualizer`                                                                                                              |
| `@pyreon/i18n`        | `createI18n`, `I18nProvider`, `useI18n`, `Trans`                                                                                                      |
| `@pyreon/feature`     | `defineFeature`, `reference`                                                                                                                          |
| `@pyreon/state-tree`  | `model`, `getSnapshot`, `applySnapshot`, `applyPatch`, `onPatch`, `addMiddleware`, `resetHook`, `resetAllHooks`                                       |
| `@pyreon/machine`     | `createMachine`                                                                                                                                       |
| `@pyreon/permissions` | `createPermissions`, `PermissionsProvider`, `usePermissions`                                                                                          |
| `@pyreon/hotkeys`     | `useHotkey`, `useHotkeyScope`                                                                                                                         |
| `@pyreon/storage`     | `useStorage`, `useCookie`, `useIndexedDB`, `useMemoryStorage`, `createStorage`                                                                        |
| `@pyreon/charts`      | `Chart`                                                                                                                                               |
| `@pyreon/flow`        | `createFlow`, `Flow`, `Background`, `MiniMap`, `Controls`, `Handle`, `Panel`, `Position`, `computeLayout`, `flowStyles`, `NodeResizer`, `NodeToolbar` |
| `@pyreon/code`        | `createEditor`, `CodeEditor`, `DiffEditor`, `TabbedEditor`                                                                                            |
| `@pyreon/rx`          | `rx` (namespace — filter/map/pipe/debounce/throttle/… 37 fns)                                                                                         |
| `@pyreon/toast`       | `toast`, `Toaster`                                                                                                                                    |
| `@pyreon/url-state`   | `useUrlState`, `setUrlRouter`                                                                                                                         |
| `@pyreon/dnd`         | `useDraggable`, `useDroppable`, `useSortable`, `useFileDrop`, `useDragMonitor`                                                                        |
| `@pyreon/document`    | `createDocument`, `render`, `download`, `isDocNode`, `registerRenderer`, `unregisterRenderer` (builder + render API; format chunks stay lazy)         |

### UI system

| Source                        | Highlights                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pyreon/styler`              | `styled`, `css`, `keyframes`, `createGlobalStyle`                                                                                                                                                                                                                                                                                                                    |
| `@pyreon/hooks`               | 20+ hooks — `useBreakpoint`, `useHover`, `useFocus`, `useFocusTrap`, `useClickOutside`, `useElementSize`, `useIntersection`, `useInterval`, `useTimeout`, `useDebouncedValue`, `useDebouncedCallback`, `useThrottledCallback`, `useMediaQuery`, `useColorScheme`, `useReducedMotion`, `useScrollLock`, `useMergedRef`, `useToggle`, `useKeyboard`, `useWindowResize` |
| `@pyreon/elements`            | `Element`, `Text`, `List`, `Overlay`, `Portal`, `Iterator`                                                                                                                                                                                                                                                                                                           |
| `@pyreon/unistyle`            | `makeItResponsive`, `normalizeTheme`, `sortBreakpoints`                                                                                                                                                                                                                                                                                                              |
| `@pyreon/coolgrid`            | `Container`, `Row`, `Col`                                                                                                                                                                                                                                                                                                                                            |
| `@pyreon/kinetic`             | `kinetic`, `useAnimationEnd`, `useTransitionState`                                                                                                                                                                                                                                                                                                                   |
| `@pyreon/kinetic-presets`     | `createFade`, `createSlide`, `createScale`, `createRotate`, `createBlur`                                                                                                                                                                                                                                                                                             |
| `@pyreon/attrs`               | `attrs`                                                                                                                                                                                                                                                                                                                                                              |
| `@pyreon/rocketstyle`         | `rocketstyle`                                                                                                                                                                                                                                                                                                                                                        |
| `@pyreon/ui-core`             | `PyreonUI`, `useMode` (consumer-app surface; framework-internal utilities omitted)                                                                                                                                                                                                                                                                                   |
| `@pyreon/document-primitives` | `DocDocument`, `DocPage`, `DocSection`, `DocRow`, `DocColumn`, `DocHeading`, `DocText`, `DocLink`, `DocImage`, `DocTable`, `DocList`, `DocListItem`, `DocCode`, `DocDivider`, `DocSpacer`, `DocButton`, `DocQuote`, `DocPageBreak`, `extractDocNode`, `createDocumentExport`, `DocumentPreview`, `documentTheme`                                                     |
| `@pyreon/connector-document`  | `extractDocumentTree`, `resolveStyles`, `DocumentMarker`, `ExtractOptions`, `ResolvedStyles`                                                                                                                                                                                                                                                                         |

## Bundle hygiene

Tree-shaking removes everything you don't import — the published `lib/index.js` is a flat list of named re-exports, and every source package declares `"sideEffects": false`. Importing `{ useStorage }` does NOT pull `@pyreon/document`, `@pyreon/charts`, or any other unrelated package into the bundle graph.

Heavy upstream deps stay lazy at the source-package level:

- **`@pyreon/document`** — PDF (~3MB pdfmake), DOCX (~700KB), XLSX (~1.1MB), PPTX (~400KB) renderers `import()` inside `render(doc, '<format>')`. `createDocument()` alone bundles nothing format-specific.
- **`@pyreon/charts`** — ECharts is lazy-loaded inside `<Chart>` mount.
- **`@pyreon/code`** — CodeMirror language grammars lazy-load via `loadLanguage()`.
- **`@pyreon/flow`** — elkjs (auto-layout) lazy-loads inside `flow.layout()`.

## Gotchas

- **No router / runtime in meta.** `@pyreon/router`, `@pyreon/core`, `@pyreon/runtime-dom`, `@pyreon/runtime-server`, `@pyreon/server`, `@pyreon/head` are NOT re-exported here. For routing + full-stack, install `@pyreon/zero` (which composes them with file-system routing + adapters).
- **Reactivity primitives come via `@pyreon/store`.** `signal` / `computed` / `effect` / `batch` are re-exported from `@pyreon/store`, not `@pyreon/reactivity` directly. The runtime identity is the same — `@pyreon/store` itself re-exports them from `@pyreon/reactivity`.
- **`rx` is a namespace, not individual operators.** Use `rx.filter(src, p)` / `rx.pipe(src, rx.filter(p), rx.map(f))`. The namespace avoids collisions with `@pyreon/hooks` / `@pyreon/dnd` operator-name twins (`throttle`, `debounce`, `merge`).
- **Document JSX primitives come via `@pyreon/document-primitives`.** `@pyreon/document` ships generic-named JSX primitives (`Text`, `List`, `Row`, `Table`, `Image`) that would collide with `@pyreon/elements` / `@pyreon/coolgrid`; meta deliberately re-exports the `Doc*`-prefixed `@pyreon/document-primitives` instead. Import the builder primitives directly from `@pyreon/document` if you need them.
- **Pure builder/renderer API from `@pyreon/document`.** Only `createDocument`, `render`, `download`, `isDocNode`, `registerRenderer`, `unregisterRenderer` and types are re-exported — the format-renderer chunks stay lazy.
- **`@pyreon/ui-core` surface is narrow.** Only `PyreonUI` and `useMode` are re-exported; framework-internal utilities (`init`, `compose`, `context`, `omit`, `pick`, `throttle`, `merge`) are NOT — they target ui-system authors, not app code.

## Documentation

Full docs: [docs.pyreon.dev/docs/meta](https://docs.pyreon.dev/docs/meta) (or `docs/docs/meta.md` in this repo).

## License

MIT
