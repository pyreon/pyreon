---
'@pyreon/native-compiler': patch
'@pyreon/native-cli': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-router-swift': patch
'@pyreon/native-runtime-kotlin': patch
'@pyreon/native-router-kotlin': patch
---

Make the native stack publishable — it was `private: true` while `pyreon new --native` shipped and advertised it.

A scaffolded multiplatform app declares five `@pyreon/native-*` packages and
resolves the Swift/Kotlin runtimes **out of `node_modules`** — XcodeGen consumes
`../node_modules/@pyreon/native-runtime-swift` as a local SPM package, Gradle
adds `../../node_modules/@pyreon/native-runtime-kotlin/src/main/kotlin` as a
source set. So npm is not an incidental channel, it is the required one. With
every package private, `npm install` could never fetch them: the paths did not
exist and the native build could not run. That is why multiplatform was
unusable outside a workspace checkout, regardless of compiler capability.

Two of the six needed real work, not just a manifest flag:

**`@pyreon/native-cli` shipped a `.ts` bin.** `bin` pointed at `./src/cli.ts`,
and the scaffolded builds invoke it as `npx pyreon-native build …` — i.e. under
**node**. Measured: node cannot execute it even on v26's type-stripping path,
because the source uses extensionless relative imports (`./build`) that bun
accepts and node's ESM resolver rejects. Now builds to `lib/` and ships a
hand-written `bin/pyreon-native.js` that calls `main()` **explicitly** rather
than relying on `cli.ts`'s `import.meta.main` guard — that guard is Bun-only
(undefined on Node < 24.2) *and* is dropped by the bundler, the exact
combination that shipped `pyreon-lint` as a silent no-op in every published
version.

**`@pyreon/native-compiler` had no build at all** — its exports pointed straight
at `src/index.ts`, so publishing would have shipped raw TypeScript to a
consumer resolving `import`. Now builds to `lib/` with proper types.

The four runtime/router packages ship SOURCE by design (Swift files for SPM,
Kotlin for Gradle) and needed only `publishConfig.access` + `sideEffects`;
tarball contents verified (Package.swift + Sources; 65 `.kt` files).

Also fixes `--help`, which exited **1** and printed to **stderr**. For a
published CLI that breaks any script or CI step checking exit codes, and hides
usage from a plain `| grep`. Now exit 0 on stdout; error paths unchanged.

Verified end to end: the built bin runs under **both node and bun**, produces
byte-identical Swift and Kotlin for both targets, and `check-bin-liveness` now
covers it — the gate caught the new bin as uncovered and failed closed, which is
what it exists to do. `publish.ts --dry-run` completes with all six included.

Nothing is published by this change; it only makes publishing possible.
