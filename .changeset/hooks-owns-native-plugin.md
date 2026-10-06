---
"@pyreon/hooks": minor
"@pyreon/native-compiler": minor
---

`@pyreon/hooks` now owns its native lowering: the 23 platform-service hooks' descriptors live in `@pyreon/hooks/native-plugin` (declared via `pyreon.native.plugin`), importing only the plugin type from `@pyreon/native-compiler`. The compiler keeps a generated copy (`built-in-services.generated.ts`, freshness- and type-gated) so a zero-config `transform()` is unchanged and emits byte-identical output, and an app with a newer installed `@pyreon/hooks` has its plugin discovered and replacing the built-in by name. Observable change: the built-in service plugin and the registry owner of those hooks are now named `@pyreon/hooks` (was `native-compiler`), in `BUILT_IN_SERVICE_OWNER`, `pyreon-native plugins`/`explain` output and duplicate-claim errors.
