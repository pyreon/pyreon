---
"@pyreon/native-compiler": minor
---

Plugins can now lower code-shaped hooks, not just data descriptors. `CompilerPlugin.calls` maps a hook or function name to a recognizer that reads the call through a small `ParseContext` facade and returns the plugin's own declaration (a type plus a JSON payload) or declines with `undefined`; `CompilerPlugin.decls` maps that type to a `DeclEmitter` that renders it on Swift and Kotlin through the `EmitContext` facade (which gains `ident(name)`). The declaration is a new open `DeclIR` member, `ExtDecl`. Names are claimed from `@pyreon/*` or the plugin's `modules`, exactly like services, and two owners for one name (or a name that is also a service) fail at load naming both. `createChartHandle()` is the first lowering moved out of the core this way: it is now owned by the built-in `@pyreon/charts` plugin, with byte-identical Swift and Kotlin output. This is additive; the plugin API version stays 1.
