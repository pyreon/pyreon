/**
 * `@pyreon/dnd/native-plugin` — how `useSortable` crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: the recognizer for `useSortable({ items, by, onReorder })`, the
 * `PyreonSortableState` declaration and its binding on both targets, the `ref={s.containerRef}` /
 * `ref={s.itemRef(key)}` view modifiers and the compile-gate stubs for that runtime type. `@pyreon/native-cli`
 * discovers it from `package.json` → `pyreon.native.plugin` when a source file imports `@pyreon/dnd`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { dndPlugin, dndPlugin as default } from './native-plugin/plugin'
export { dndStubs } from './native-plugin/stubs'
