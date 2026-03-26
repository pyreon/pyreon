# @pyreon/meta

Barrel package re-exporting the full Pyreon ecosystem — fundamentals and UI system.

Import everything from one place instead of installing each package individually.

## Install

```bash
bun add @pyreon/meta
```

## What's Included

### Fundamentals

| Package | Key Exports |
| --- | --- |
| `@pyreon/store` | `defineStore`, `signal`, `computed`, `effect`, `batch` |
| `@pyreon/form` | `useForm`, `useField`, `useFieldArray`, `FormProvider` |
| `@pyreon/validation` | `zodSchema`, `zodField` |
| `@pyreon/query` | `useQuery`, `useMutation`, `QueryClient`, `QueryClientProvider` |
| `@pyreon/table` | `useTable`, `flexRender` |
| `@pyreon/virtual` | `useVirtualizer`, `useWindowVirtualizer` |
| `@pyreon/i18n` | `createI18n`, `I18nProvider`, `useI18n`, `Trans` |
| `@pyreon/feature` | `defineFeature`, `reference` |
| `@pyreon/state-tree` | `model`, `getSnapshot`, `applySnapshot`, `applyPatch`, `onPatch` |
| `@pyreon/machine` | `createMachine` |
| `@pyreon/permissions` | `createPermissions`, `usePermissions`, `PermissionsProvider` |
| `@pyreon/hotkeys` | `useHotkey`, `useHotkeyScope` |
| `@pyreon/storage` | `useStorage`, `useCookie`, `useIndexedDB` |
| `@pyreon/charts` | `Chart` (reactive ECharts with lazy loading) |
| `@pyreon/flow` | `createFlow`, `Flow`, `Background`, `MiniMap`, `Controls` |
| `@pyreon/code` | `createEditor`, `CodeEditor`, `DiffEditor`, `TabbedEditor` |

### UI System

| Package | Key Exports |
| --- | --- |
| `@pyreon/styler` | `css`, `styled`, `createGlobalStyle`, `keyframes` |
| `@pyreon/hooks` | 25+ signal-based hooks (`useHover`, `useFocus`, `useBreakpoint`, etc.) |
| `@pyreon/elements` | `Element`, `Text`, `List`, `Overlay`, `Portal`, `Iterator` |
| `@pyreon/unistyle` | `makeItResponsive`, `normalizeTheme`, `sortBreakpoints` |
| `@pyreon/coolgrid` | `Col`, `Container`, `Row` |
| `@pyreon/kinetic` | `kinetic`, `useAnimationEnd`, `useTransitionState` |
| `@pyreon/kinetic-presets` | `createFade`, `createSlide`, `createScale`, `createRotate`, `createBlur` |
| `@pyreon/attrs` | `attrs` |
| `@pyreon/rocketstyle` | `rocketstyle` |

## Usage

```ts
import {
  defineStore, signal, useQuery, useForm, useHotkey,
  useStorage, Chart, createFlow, styled, useHover,
} from "@pyreon/meta"
```

## License

[MIT](LICENSE)
