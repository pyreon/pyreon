# @pyreon/native-cli

## 0.51.0

### Patch Changes

- [#2558](https://github.com/pyreon/pyreon/pull/2558) [`6378982`](https://github.com/pyreon/pyreon/commit/6378982b22c36ed50245bfde6b4698c57c923cf8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Make the native stack publishable — it was `private: true` while `pyreon new --native` shipped and advertised it.

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
  (undefined on Node < 24.2) _and_ is dropped by the bundler, the exact
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

- [#2614](https://github.com/pyreon/pyreon/pull/2614) [`9154c8a`](https://github.com/pyreon/pyreon/commit/9154c8aca81ce858ef99b213564af870c378f37f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Transition>` gains configurable `duration` (ms, static literal) + `easing`
  (`linear | ease-in | ease-out | ease-in-out`) on both native targets:
  `.animation(.linear(duration: 2.5), value:)` on SwiftUI,
  `AnimatedVisibility(enter/exit = fadeIn/fadeOut(tween(ms, easing)))` on
  Compose, with the CSS easings mapped to the canonical curves. Absent props
  emit byte-identically to the previous default shape (spec-locked); a
  non-literal duration warns + falls back. The CLI's conditional-import table
  learns the animation sub-package symbols (fadeIn/fadeOut/tween/easings) —
  the stub-masked-symbol class, caught by the real gradle build.
- Updated dependencies [[`a8c9fab`](https://github.com/pyreon/pyreon/commit/a8c9fab95521b62e60150a545d03a8bb645f3ec4), [`b315e7a`](https://github.com/pyreon/pyreon/commit/b315e7a01ca87a8931192d8b2ee02388c8aac08b), [`66b1a18`](https://github.com/pyreon/pyreon/commit/66b1a1888fb4725b4b3c3440278f559dfb4f7cc8), [`55cca94`](https://github.com/pyreon/pyreon/commit/55cca9433dd43dd0b0849a50ae2b3b357999bb7a), [`f9b8abc`](https://github.com/pyreon/pyreon/commit/f9b8abc0c4e5f84f0f79a65f4ba93dba55a5843e), [`fc58ea0`](https://github.com/pyreon/pyreon/commit/fc58ea08345bad48d28d6eea0ad2283e67c93248), [`84f1d67`](https://github.com/pyreon/pyreon/commit/84f1d6783c6400a20a881ead7b511cc99f7c2add), [`ed5eff8`](https://github.com/pyreon/pyreon/commit/ed5eff8fd3c22c0b89a03218ca9b8adfcb168d61), [`8f3b127`](https://github.com/pyreon/pyreon/commit/8f3b12770c9d32829b93f7d71f822a8dee6c0d35), [`9a963f0`](https://github.com/pyreon/pyreon/commit/9a963f09417d2172fc67480608b40a7c405b71b2), [`624a51e`](https://github.com/pyreon/pyreon/commit/624a51e5efb2db8de337cf75f5f7e05f741543e5), [`a52b032`](https://github.com/pyreon/pyreon/commit/a52b0329ee9cb864c3cea9f02ffb80f9a473e159), [`7955d7e`](https://github.com/pyreon/pyreon/commit/7955d7ea7e330285d197065af60bfca537a529f2), [`eec2612`](https://github.com/pyreon/pyreon/commit/eec2612bd7fd7ae0da13a2c7af89a393bb103110), [`d478d14`](https://github.com/pyreon/pyreon/commit/d478d14e11ca16b196fcc2981eba143ff941b478), [`0f0f8ad`](https://github.com/pyreon/pyreon/commit/0f0f8ad3b5ccf9759a5e806e6a27d6323881e627), [`624a51e`](https://github.com/pyreon/pyreon/commit/624a51e5efb2db8de337cf75f5f7e05f741543e5), [`0734f52`](https://github.com/pyreon/pyreon/commit/0734f529366f2b298c453a5e9abdf1c326258b35), [`624a51e`](https://github.com/pyreon/pyreon/commit/624a51e5efb2db8de337cf75f5f7e05f741543e5), [`4479761`](https://github.com/pyreon/pyreon/commit/447976119d3948ff11487b72fa8b7f8322cdda6e), [`33d6aed`](https://github.com/pyreon/pyreon/commit/33d6aed2a65c00869042398fb95dfb2cfe6a6da0), [`4d91b74`](https://github.com/pyreon/pyreon/commit/4d91b74d4ba57a06993aa2a0c5c4abf1bd9901f0), [`624a51e`](https://github.com/pyreon/pyreon/commit/624a51e5efb2db8de337cf75f5f7e05f741543e5), [`9590027`](https://github.com/pyreon/pyreon/commit/9590027d8358321a0509b9cbb87d7f30858db442), [`6e12444`](https://github.com/pyreon/pyreon/commit/6e12444740b86b0749d093c2f029739721968689), [`25b5f5a`](https://github.com/pyreon/pyreon/commit/25b5f5a2374c3a9cecabb478a8b1c2cf62d1d23c), [`9179250`](https://github.com/pyreon/pyreon/commit/9179250101053178751528e71f12adbf4e7709af), [`2ed340e`](https://github.com/pyreon/pyreon/commit/2ed340ee7f0540f933d245f8bd00b0ec32db12db), [`6e12444`](https://github.com/pyreon/pyreon/commit/6e12444740b86b0749d093c2f029739721968689), [`b40ebfc`](https://github.com/pyreon/pyreon/commit/b40ebfc6ba6bee6ec24a1fbebddd3d78960096d5), [`4cb8c0b`](https://github.com/pyreon/pyreon/commit/4cb8c0b666039e5889cca21366a776c452e6a78a), [`33d6aed`](https://github.com/pyreon/pyreon/commit/33d6aed2a65c00869042398fb95dfb2cfe6a6da0), [`cddba1e`](https://github.com/pyreon/pyreon/commit/cddba1e796f84b68b41f51e4d7a6b59542615252), [`3df5fbb`](https://github.com/pyreon/pyreon/commit/3df5fbbb056d9805cf326d264ad89b1f22807ba1), [`a6a6d88`](https://github.com/pyreon/pyreon/commit/a6a6d8849db34b3b7b903945dcdf80744919a46c), [`624a51e`](https://github.com/pyreon/pyreon/commit/624a51e5efb2db8de337cf75f5f7e05f741543e5), [`624a51e`](https://github.com/pyreon/pyreon/commit/624a51e5efb2db8de337cf75f5f7e05f741543e5), [`eec2612`](https://github.com/pyreon/pyreon/commit/eec2612bd7fd7ae0da13a2c7af89a393bb103110), [`f110299`](https://github.com/pyreon/pyreon/commit/f110299aed1c8af97f9940e4a70378d0bcd0a31d), [`d62ce1a`](https://github.com/pyreon/pyreon/commit/d62ce1a1fe58e60a1f2305f021e0f6666f7b3e0b), [`6378982`](https://github.com/pyreon/pyreon/commit/6378982b22c36ed50245bfde6b4698c57c923cf8), [`5abe7c4`](https://github.com/pyreon/pyreon/commit/5abe7c4e70b43e0be30fb129ed0d77213a8c4678), [`97768d7`](https://github.com/pyreon/pyreon/commit/97768d7199df07394bb0bad4311c1e08d25bd047), [`9590027`](https://github.com/pyreon/pyreon/commit/9590027d8358321a0509b9cbb87d7f30858db442), [`5439bd3`](https://github.com/pyreon/pyreon/commit/5439bd3dce309640cf16e4c35aa8107a4c9b45f7), [`06c743d`](https://github.com/pyreon/pyreon/commit/06c743d9b9d12915f970d42674273bce2eef4a8f), [`9154c8a`](https://github.com/pyreon/pyreon/commit/9154c8aca81ce858ef99b213564af870c378f37f), [`9154c8a`](https://github.com/pyreon/pyreon/commit/9154c8aca81ce858ef99b213564af870c378f37f), [`cb5dff3`](https://github.com/pyreon/pyreon/commit/cb5dff3f15baf395da424c629c6433ac00fdfb22), [`5439bd3`](https://github.com/pyreon/pyreon/commit/5439bd3dce309640cf16e4c35aa8107a4c9b45f7), [`5ca9b4c`](https://github.com/pyreon/pyreon/commit/5ca9b4c010049fb9a80efc3ccce68bcc61a8eb6c), [`f7541e0`](https://github.com/pyreon/pyreon/commit/f7541e01455a56fb2ef8bf23d17909199ecc5c5a)]:
  - @pyreon/native-compiler@0.51.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`7c47672`](https://github.com/pyreon/pyreon/commit/7c47672dd27274ba39fcca2d8d54740db6376f66)]:
  - @pyreon/native-compiler@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`099f574`](https://github.com/pyreon/pyreon/commit/099f5746a8069326e9dccf5c46c405afa2220e46)]:
  - @pyreon/native-compiler@0.1.0

## 0.1.0

### Minor Changes

- [#1268](https://github.com/pyreon/pyreon/pull/1268) [`33642a8`](https://github.com/pyreon/pyreon/commit/33642a8ed8ffbbfaed1509fdbf4e4cd6cc1d8253) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Emit import preamble in build output — the `pyreon-native build`
  command now prepends a per-target import block to each emitted file
  (`import SwiftUI` / `import PyreonRuntime` / `import PyreonRouter` on
  Swift; the full Compose + Pyreon-runtime wildcard set on Kotlin).

  Pre-fix every emitted file failed to compile standalone — the user
  had to wrap each output in a hand-written file that supplied the
  missing imports. Generated code now compiles directly against the
  real SwiftUI / Compose toolchain.

  Unused imports are harmless on both targets.

### Patch Changes

- Updated dependencies []:
  - @pyreon/native-compiler@0.0.0
