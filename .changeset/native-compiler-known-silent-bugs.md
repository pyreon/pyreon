---
'@pyreon/native-compiler': patch
---

Fix the silent wrong-emit and silent-drop classes the 2026-09 coverage campaign locked as known bugs. Every one either lowers faithfully now or is named in a warning; none emits the web spelling silently.

- **Computed object keys.** Every literal-config reader (`createFlow`, `createMachine`, `createTableState`, `useSortable`, `createI18n`, `syncedSignal`, `model()`, `defineFeature`, schema shapes, `useForm`, `useFetch` / `useQuery` options and headers, `useCounter`, `createRouter` routes, `toast()` / `announce()` options, `@pyreon/http` `params`/`query`/`headers`, object-pattern destructures) read `{ [kind]: … }` as the literal key `"kind"`. They all go through one static-key helper now: a string/number literal key (computed or not) is read, and a runtime key is named in a warning. A computed type-literal member (`{ [K]: string }`) is named rather than read as a field `K`.
- **@pyreon/flow.**
  - `updateNode` with a non-literal `position` / `sourceHandles` / `targetHandles` and `updateEdge` `waypoints` passes the expression through the way `addNode` does, instead of dropping the change.
  - `addEdge` and `updateEdge` name a marker or `pathOptions` they cannot lower.
  - Unsupported option shapes on `zoomTo` / `reconnectEdge` / `setViewport` / `setCenter` / `zoomIn` / `zoomOut` / `fitView` / `layout` are named, and `setCenter` options accept exactly `zoom` / `duration`.
  - `<path d={p.path}>` where `p` is a local path-helper result lowers to that result instead of an undefined `path()`.
  - `<NodeToolbar>` drop warnings are per toolbar and name the actual reason.
  - Node `data` rows whose field types differ unify into one Codable type by field names AND types.
- **Methods and slots.**
  - Mapped JS methods called with arguments the mapping did not cover are lowered where the argument is expressible (`indexOf` / `includes` `fromIndex`, `startsWith` position, `endsWith` length, `split` limit, `toString(radix)`); otherwise they are named in a warning (`thisArg`, extra ignored arguments).
  - Kotlin pads a view helper passed into a wider render slot, like Swift.
  - An inline object-typed helper parameter resolves to the synthesized struct on both targets.
  - A block-bodied `<For>` row lowers its statements and returned view instead of rendering `""`.
- **Charts.**
  - A bad `yAxisIndex` / `xAxisIndex` prints the value written; a module-constant axis index resolves.
  - A failing timeline step is reported once.
- **Warnings.**
  - `toast.bogus(…)` is named.
  - A non-literal `SizedMap` `maxEntries` warns once.
  - `useUrlState('k', 1e999)` explains the non-finite default.
  - A lowercase helper with an unresolvable parameter type gets a helper-worded warning instead of a false "Component props" one.
- **Dead code.** The unreachable `PieChart` / `GaugeChart` element emitters are removed (both are chart hosts).
