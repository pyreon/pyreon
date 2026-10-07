---
'@pyreon/native-compiler': minor
'@pyreon/native-cli': minor
'@pyreon/hooks': minor
'@pyreon/permissions': minor
'@pyreon/storage': minor
'@pyreon/url-state': minor
'@pyreon/sized-map': minor
'@pyreon/kinetic': minor
'@pyreon/elements': minor
'@pyreon/coolgrid': minor
'@pyreon/rx': minor
'@pyreon/feature': minor
---

Native lowering for permissions, storage, url-state, sized-map, kinetic, elements, coolgrid, rx, feature and `useFetch` moves out of the compiler into package-owned plugins, and `@pyreon/hooks` is discovered like every other library: the compiler no longer carries a generated copy of the hooks service table, ships no built-in plugin, and `SERVICES` / `BUILT_IN_SERVICE_OWNER` are removed. A bare `transform()` / `createCompiler()` with no plugins now lowers only the core's own contract; a plugin package that fails to load is a hard error (the CLI's built-in fallback is gone) and `pyreon-native plugins` no longer prints a built-in section. New library-agnostic plugin members: `declCalls` (with `{ computed }` / `{ signal }` verdicts), `tier2Calls`, `persistence`, `rewriteElement`, `DeclEmitter.typing.member`, `ExprEmitter.reduce`, `typing.type(e, infer)`, and the `declarations` item slot. `@pyreon/native-compiler` is an optional peer of each plugin-bearing package.
