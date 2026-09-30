---
'@pyreon/compiler': minor
'@pyreon/core': minor
'@pyreon/vite-plugin': minor
'@pyreon/zero': patch
'@pyreon/native-compiler': patch
'@pyreon/create-zero': patch
'@pyreon/cli': patch
'@pyreon/lint': minor
---

Plain Mode is now production-ready: write reactive code as plain JavaScript (`let count = state(0)`, `count++`, `{count}`) and the compiler emits fine-grained signals.

- **New markers in `@pyreon/core/plain`.** `signalOf(x)` hands the underlying signal to an API that needs one (it compiles to the bare signal). `state.from(sig)` and `derived.from(sig)` adopt an existing signal (a hook result, a store field) as a plain binding. `derived(() => expr)` is now typed by the thunk's return value.
- **Newly supported shapes.** Destructuring assignment onto state (`[a, b] = [b, a]`, with exact JS semantics including defaults and rest). Nested props patterns (`{ user: { name } }` reads `props.user.name` live). A top-level `...rest` in props becomes a reactive `splitProps` copy, so `{...rest}` stays live.
- **Project-wide mode.** `pyreon({ plain: true })` compiles every app module as plain with no per-file directive; a `'use classic'` directive opts a file out. `@pyreon/zero` forwards the option to its SSR build.
- **Codemod (`pyreon plain --write`).** Converts far more real code and no longer changes behaviour or types:
  - Arrow handlers that return a write (`() => x.set(v)`) now convert.
  - Signals passed as values, stored, or used through `.subscribe` now convert via `signalOf`.
  - Complex `.update` callbacks now convert via `x = (fn)(untrack(() => x))`.
  - Fixed: an `.update` substitution discarded rewrites inside the callback body. `.update` inside an effect or computed no longer adds a subscription.
  - Fixed: marker names that collide with a local binding are aliased, and `type` modifiers on kept imports are preserved.
  - Exported signals now decline, since their importers still call them.

  - `pyreon plain` skips test and spec files unless `--include-tests` is passed. Test runners often run without the `pyreon()` plugin, where plain code can't compile.

  Across this repo's 883 example files: 86 declined before, 0 now.
- **Native compiler.** Plain Mode's `void (…)` tracking hints lower to the plain value. Before, a derived value with a conditional read emitted an empty string on iOS and Android. The emit is now deterministic: name counters are reset per file, where they used to drift with whatever the process compiled first.
- **Vite plugin fix.** Dev mode's source-location injection no longer rewrites the text `effect()` or `signal()` inside JSX (for example, prose in a `<Code>` demo) into a broken call. Each match is now confirmed against the AST.
- **Plain Mode safety net.**
  - New `pyreon/plain-mode-footgun` lint rule (on in `recommended`). It reports every Plain Mode compile-time warning, such as mutating shallow state or writing to a `derived` value, as an error in the editor and CI. Before, these only printed in the Vite terminal while the app was silently wrong.
  - Reactivity lint rules that opt into `meta.plainLowered` also check plain files, by linting their compiled form and reporting at the source line: `no-signal-in-loop`, `no-nested-effect`, `no-unguarded-async-signal-write` and `no-unbatched-updates`. Without this, plain files were invisible to them.
  - `detectPyreonPatterns`, which backs MCP `validate`, `pyreon check` and doctor, gains a `plain-mode` code for the same warnings.
  - The "did not compile" runtime error now names the usual cause: a test runner without the `pyreon()` plugin.
- **Scaffold.** The `create-zero` counter page is written in Plain Mode.
