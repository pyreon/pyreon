---
'@pyreon/native-cli': minor
'@pyreon/create-multiplatform': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-router-swift': patch
'@pyreon/native-runtime-kotlin': patch
'@pyreon/native-router-kotlin': patch
---

Native-source resolve-and-scan toolchain — the monorepo Gap-1 fix, and the keystone for per-package native co-location.

The scaffold hard-coded the native runtime location into the app build (iOS `project.yml` `packages:` and Android Gradle `srcDir` both pointed at a fixed `../node_modules/@pyreon/native-runtime-*` path). npm/yarn HOISTING and pnpm's symlinked store both break that: in a monorepo the runtime is usually installed at the workspace root, not the app's local `node_modules`, so the fixed path dangles and the build cannot find the runtime sources.

`@pyreon/native-cli` gains a `wire` command and a resolver:

- `resolveNativeSources(appDir)` walks the app's declared `@pyreon/*` deps and resolves each one's install location by walking `node_modules` upward — the same algorithm Node's resolver uses, so it is hoisting- and pnpm-symlink-safe.
- Each package declares its native sources via a `pyreon.native` field in `package.json`, or the zero-config default dirs `native/swift/` and `native/kotlin/`. The four base runtime/router packages now declare the field pointing at their existing `Sources/PyreonRuntime` / `Sources/PyreonRouter` / `src/main/kotlin` layout, so they resolve through the SAME convention as a co-located feature package — no name-based special-casing. This is what makes per-package native co-location possible: a feature package can ship `native/{swift,kotlin}/` and it aggregates into the app build with zero config, and a third-party package opts in by declaring the field.
- `pyreon-native wire [--app=<dir>] [--android-out=<file>] [--json]` emits the resolved build wiring: the Gradle srcDirs list (base runtime/router + every co-located feature `native/kotlin/`, deduped, absolute), the iOS SwiftPM package paths (resolved absolute), and the co-located Swift target sources grouped by module. A DECLARED-but-missing native dir is surfaced as a broken declaration (exit 2).

Scaffolded Android apps now resolve their Kotlin source roots through this: `scripts/build-android.sh` runs `pyreon-native wire --android-out=android/app/pyreon-native.srcdirs` after the emit (before Gradle configures), and `build.gradle.kts` prefers that resolved list, falling back to the legacy fixed `node_modules` paths for a flat layout. Existing flat apps are unaffected; monorepo apps now build.

iOS co-location target wiring (compiling co-located feature `native/swift/` into the runtime target) is a follow-up that pairs with relocating the first feature runtime; the base Swift packages already resolve through `wire` today.
