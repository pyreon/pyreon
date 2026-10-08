# @pyreon/coolgrid

## 0.53.0

### Minor Changes

- [#3854](https://github.com/pyreon/pyreon/pull/3854) [`b0d6ac0`](https://github.com/pyreon/pyreon/commit/b0d6ac0c32c0b678d97144f43e750683bf1225ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native lowering for permissions, storage, url-state, sized-map, kinetic, elements, coolgrid, rx, feature and `useFetch` moves out of the compiler into package-owned plugins, and `@pyreon/hooks` is discovered like every other library: the compiler no longer carries a generated copy of the hooks service table, ships no built-in plugin, and `SERVICES` / `BUILT_IN_SERVICE_OWNER` are removed. A bare `transform()` / `createCompiler()` with no plugins now lowers only the core's own contract; a plugin package that fails to load is a hard error (the CLI's built-in fallback is gone) and `pyreon-native plugins` no longer prints a built-in section. New library-agnostic plugin members: `declCalls` (with `{ computed }` / `{ signal }` verdicts), `tier2Calls`, `persistence`, `rewriteElement`, `DeclEmitter.typing.member`, `ExprEmitter.reduce`, `typing.type(e, infer)`, and the `declarations` item slot. `@pyreon/native-compiler` is an optional peer of each plugin-bearing package.

### Patch Changes

- Updated dependencies [[`c933f92`](https://github.com/pyreon/pyreon/commit/c933f92e20104aba2807e229f03b9f0530135cb3), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`068310d`](https://github.com/pyreon/pyreon/commit/068310dd9bd78663945348f579a7f5fd082c6944), [`c253ae2`](https://github.com/pyreon/pyreon/commit/c253ae23978b06904768d171f3eb7e2b7114e273), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`87879d0`](https://github.com/pyreon/pyreon/commit/87879d0a04b5e221482693596cff0f7352c1e3ed), [`4b207a7`](https://github.com/pyreon/pyreon/commit/4b207a7c56938fc326b79dae1d381b7af53c8681), [`792e27e`](https://github.com/pyreon/pyreon/commit/792e27ef09c9b3dcc88c85a7ab6d969f60388848), [`0c95de5`](https://github.com/pyreon/pyreon/commit/0c95de5911873d56543a28acc0bb23e0ad5b299c), [`6df4450`](https://github.com/pyreon/pyreon/commit/6df4450bb57c834997796f8f37c59bae3e743d74), [`9fed8dc`](https://github.com/pyreon/pyreon/commit/9fed8dc5982d850bf09a0d0afa95b6d0fc7e8bae), [`1ce711d`](https://github.com/pyreon/pyreon/commit/1ce711d63e715110f614fcc423530eb13ceee43a), [`f7b64d9`](https://github.com/pyreon/pyreon/commit/f7b64d9164eb34d202e3d84b0c729a8d6918a359), [`3ec86b7`](https://github.com/pyreon/pyreon/commit/3ec86b7d4fce4c2c2c19ae233e5387d112b97a9a), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`09839d5`](https://github.com/pyreon/pyreon/commit/09839d56f631df1743319211cd2c821c2f259990), [`a110468`](https://github.com/pyreon/pyreon/commit/a1104680b3cf44b9d062ee4906b76a3ff09b2634), [`b0d6ac0`](https://github.com/pyreon/pyreon/commit/b0d6ac0c32c0b678d97144f43e750683bf1225ae), [`cf21221`](https://github.com/pyreon/pyreon/commit/cf21221e4249823a8fd04be8601168817045f6eb), [`0c95de5`](https://github.com/pyreon/pyreon/commit/0c95de5911873d56543a28acc0bb23e0ad5b299c), [`09839d5`](https://github.com/pyreon/pyreon/commit/09839d56f631df1743319211cd2c821c2f259990), [`ed1e29d`](https://github.com/pyreon/pyreon/commit/ed1e29d20c98d7c6ae2c062c10aa73174afa35c3), [`9b84418`](https://github.com/pyreon/pyreon/commit/9b844189403ed062150edff9999d2cae7838f430), [`3de1c68`](https://github.com/pyreon/pyreon/commit/3de1c68b460f1f83deb9988192dfa4000ffb25b0)]:
  - @pyreon/native-compiler@0.53.0
  - @pyreon/core@0.53.0
  - @pyreon/reactivity@0.53.0
  - @pyreon/ui-core@0.53.0
  - @pyreon/unistyle@0.53.0

## 0.52.0

### Patch Changes

- [#3678](https://github.com/pyreon/pyreon/pull/3678) [`a6e97cb`](https://github.com/pyreon/pyreon/commit/a6e97cb4c0ee97dbc405900d4d9655f8fd81937a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Correct the API documentation (manifests, llms.txt, MCP api-reference, docs reference pages) for rocketstyle, styler, attrs, elements, kinetic and coolgrid so it matches the shipped runtime. Notable corrections: styler's `ThemeProvider` takes an object only (no parent-merging function form) and reads it once; rocketstyle's `Provider` snapshots its parent context and writes only the ui-core context; `.config({ inversed })` inverts only the component itself; `.compose()` wraps user HOCs last-defined-outermost; `keyframes` and static `createGlobalStyle` inject at call time; `useCSS`'s `boost` argument has no effect; `List` renders a fragment unless `rootElement` is set; kinetic's `show` accepts an accessor, a value, or nothing. No runtime changes.
- Updated dependencies [[`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`d5f19b9`](https://github.com/pyreon/pyreon/commit/d5f19b9700962305b1cc4fd0e5da603ec884e759), [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9045709`](https://github.com/pyreon/pyreon/commit/9045709020995c37692eb2a9a6ecd65f6b8c6e30), [`57b94ed`](https://github.com/pyreon/pyreon/commit/57b94ed8cd4b2aa9d5bd16e52d39edcdb7056c62), [`1c70f68`](https://github.com/pyreon/pyreon/commit/1c70f68b69a7e9f60eb7d565bf8797a155353743), [`99a1888`](https://github.com/pyreon/pyreon/commit/99a188821c005c4750c3daf98fd2d0863a0e3b58), [`e56abb6`](https://github.com/pyreon/pyreon/commit/e56abb6b44873164473b085e0e64838e7d9e7012), [`79c1bf1`](https://github.com/pyreon/pyreon/commit/79c1bf13b1d8eb8fd65df9ff2d8fece58bed1aa0), [`c95ea09`](https://github.com/pyreon/pyreon/commit/c95ea0941a5a09cd9b14e817b09c857ce64b1112), [`9f02726`](https://github.com/pyreon/pyreon/commit/9f0272677bd083fb50998335257e31e44766e85d), [`cc455e8`](https://github.com/pyreon/pyreon/commit/cc455e84d9ed7d682d963d44b25cd3c4bb89c7c8), [`6a7c0f1`](https://github.com/pyreon/pyreon/commit/6a7c0f1bb21f285fce47fe67492ce9a14c20fd6a), [`cf50c79`](https://github.com/pyreon/pyreon/commit/cf50c79668fa46510df17f76906520c53d6e0e4a), [`f2194d5`](https://github.com/pyreon/pyreon/commit/f2194d544ca7fc10dcc64b2aeb1c97dc923eabfe), [`e6b70a5`](https://github.com/pyreon/pyreon/commit/e6b70a5c80ed7c9f338a6a750296ebe89e9dd9c2), [`cbd6459`](https://github.com/pyreon/pyreon/commit/cbd6459970423b7f7d94883685ae7c753895f1d9), [`ea4e50a`](https://github.com/pyreon/pyreon/commit/ea4e50ab7d97d84f2bd5518ea747280c34805611), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`d114ff8`](https://github.com/pyreon/pyreon/commit/d114ff8c83ac98acb0c421d0ee3217e43d4d713b), [`50d9324`](https://github.com/pyreon/pyreon/commit/50d93245d8e28ba0a3c8217bd83a50d3dd6719d3), [`317367a`](https://github.com/pyreon/pyreon/commit/317367a9ade57b9aefd036441ebb397c8e3d1dc2), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`773f9df`](https://github.com/pyreon/pyreon/commit/773f9dfaafaed05a06b252b1f83a0f7d970dbb8d), [`3dba9dc`](https://github.com/pyreon/pyreon/commit/3dba9dceec5dc96c34686b70604b6d79939655a2), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e44dcc7`](https://github.com/pyreon/pyreon/commit/e44dcc7124a5617f95ddb69786be262a35280d5f), [`768f104`](https://github.com/pyreon/pyreon/commit/768f104018ced7568dde1c99990a21c273e924ec), [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`9593fbc`](https://github.com/pyreon/pyreon/commit/9593fbc44375cc00f57865790a798bd53e479551), [`24c4019`](https://github.com/pyreon/pyreon/commit/24c4019d3e2527bf063d65d62bf574b00965d1e4), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`d0e57b2`](https://github.com/pyreon/pyreon/commit/d0e57b27ccbf9b4b90521235186a003f3d6bc3ca), [`fabd888`](https://github.com/pyreon/pyreon/commit/fabd888ac865155a5af687f1706bf918c6419f19), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`5438e9a`](https://github.com/pyreon/pyreon/commit/5438e9a7496e4c6e5dac43bc03ab90459d147a59), [`f84675f`](https://github.com/pyreon/pyreon/commit/f84675fb134fe96c7d76c1631f754954816183bd), [`5af143d`](https://github.com/pyreon/pyreon/commit/5af143d746be81a4a0d688243f123d532c455553), [`2bef24d`](https://github.com/pyreon/pyreon/commit/2bef24df3d5c86d709509906d4d1e831357b41c6), [`f4e9268`](https://github.com/pyreon/pyreon/commit/f4e9268a750318ceb5f7d2dc40c185a53e6b5299), [`195a9dc`](https://github.com/pyreon/pyreon/commit/195a9dc6417f964eb3858772da449a3bc1f1d02a), [`29f1002`](https://github.com/pyreon/pyreon/commit/29f10026097e30e261dcc49ad25ea3928ab7e026), [`968781e`](https://github.com/pyreon/pyreon/commit/968781ea3156803fe79aef5ae11146fce1278986), [`5c175d4`](https://github.com/pyreon/pyreon/commit/5c175d42ddd614a6fd58c1832c36ea4f98898f5a), [`c26fcef`](https://github.com/pyreon/pyreon/commit/c26fcef861ec794ca7f0e0b2163d84f7b58c0866), [`127e5d6`](https://github.com/pyreon/pyreon/commit/127e5d65cd2a3cea8457a1bd6f397b75c0ad4597), [`50caf2d`](https://github.com/pyreon/pyreon/commit/50caf2d3f97fefa7afa6105e38c7f5940c427b5d), [`c7feb0b`](https://github.com/pyreon/pyreon/commit/c7feb0b726ea78ef7b6a4d3a17e8ae85df471a67)]:
  - @pyreon/ui-core@0.52.0
  - @pyreon/core@0.52.0
  - @pyreon/unistyle@0.52.0
  - @pyreon/reactivity@0.52.0

## 0.51.0

### Patch Changes

- Every package manifest now declares its MULTIPLATFORM story as data: (4e53471)
  `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
  (a discriminated union — `web-only` REQUIRES the rationale sentence). The
  assignments transcribe the classification the multiplatform docs and the PMTC
  compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
  `check-multiplatform-tier` gate (validate-fast family) holds the contract:
  a manifest without a tier, a published package with neither manifest nor
  explicit exemption, a `web-only` without a rationale, or a stale generated
  tier table all fail CI — so a new package can never again silently default
  to web-only while the ecosystem advertises "one codebase, three targets".

  No runtime change in any package: manifests are docs-pipeline inputs and are
  stripped from published tarballs; every generated surface (llms, MCP
  api-reference, reference pages) is byte-identical.

- Updated dependencies:
  - @pyreon/ui-core@0.51.0
  - @pyreon/reactivity@0.51.0
  - @pyreon/core@0.51.0
  - @pyreon/unistyle@0.51.0

## 0.50.0

### Patch Changes

- [#2417](https://github.com/pyreon/pyreon/pull/2417) [`83d1c0d`](https://github.com/pyreon/pyreon/commit/83d1c0d2a6b93285a441438c148a7d214a91c9d8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - chore: dependency-hygiene fixes from the workspace dependency audit

  Declared-vs-actual dependency audit across all 88 workspace packages. No
  runtime behavior changes — every fix removes or reclassifies a dependency the
  package's shipped code never imports:

  - `@pyreon/zero`: removed unused `@pyreon/meta` dependency (legacy from the
    initial monorepo migration; zero mentions in the package).
  - `@pyreon/zero-cli`: removed unused `@pyreon/server` dependency (the CLI
    delegates to `@pyreon/cli` via dynamic import and to `@pyreon/create-zero`
    via template-path resolution — both kept; `server` was never referenced).
  - `@pyreon/document-primitives`: removed unused `@pyreon/styler` +
    `@pyreon/ui-core` dependencies (its rocketstyle dependency declares its own).
  - `@pyreon/coolgrid`: moved `@pyreon/styler` to devDependencies (only its
    browser test imports it; prod src uses core/ui-core/unistyle).
  - `@pyreon/typescript`: `@pyreon/core` dependency now uses the workspace
    protocol (`workspace:^`) instead of the pinned `>=0.13.0` range — consistent
    with every other inter-package dependency; the fixed-group release keeps the
    published range aligned with the sibling core release.

  (Private packages fixed in the same pass, no changeset needed: `ui-components`
  dropped unused `hooks`/`styler` + moved test-only `ui-core` to devDeps;
  `ui-primitives` dropped unused `elements`.)

- [#2418](https://github.com/pyreon/pyreon/pull/2418) [`34c943f`](https://github.com/pyreon/pyreon/commit/34c943f68dba3bae423d6ca38fd6cb22527dd714) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf: PURE-form component branding — importing one primitive no longer pays the whole package

  Bare top-level `Component.displayName/pkgName/PYREON__COMPONENT = …` assignments are
  side effects a bundler must run once any binding of the module is used, so every
  component pinned every other: importing just `<Portal>` retained all of
  `@pyreon/elements` (7.5KB gz). Brands now ride the export expression
  (`/* @__PURE__ */ Object.assign(Component, {…})` — same object identity, call sites
  and stack traces unchanged), making each component droppable when unused.

  Measured (minified+gzipped, `@pyreon/*` externalized): Portal 7.50 → 2.39KB (−68%),
  Text → 2.41KB, Element → 4.02KB (−46%), List → 4.10KB, Overlay → 5.44KB. Locked by
  new `@pyreon/elements::portal` / `::element` entries in the import-budget gate plus a
  repo-wide census guard (`no-bare-component-brand.test.ts`).

- Updated dependencies [[`4d8b0ac`](https://github.com/pyreon/pyreon/commit/4d8b0ac11243c69bc96c0101f78ef4da27399f20), [`f3f5d3b`](https://github.com/pyreon/pyreon/commit/f3f5d3b70d2bd19b23b802ea21ad8ba9d5e416a7), [`c41e4f3`](https://github.com/pyreon/pyreon/commit/c41e4f3cc4084a2b7abbf2af92e9df1ef05791b6), [`34c943f`](https://github.com/pyreon/pyreon/commit/34c943f68dba3bae423d6ca38fd6cb22527dd714)]:
  - @pyreon/ui-core@0.50.0
  - @pyreon/unistyle@0.50.0
  - @pyreon/core@0.50.0
  - @pyreon/reactivity@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [[`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85), [`d935083`](https://github.com/pyreon/pyreon/commit/d935083033edd2c0e74c8fa71e46d9dfcdb661e7)]:
  - @pyreon/core@0.49.0
  - @pyreon/styler@0.49.0
  - @pyreon/ui-core@0.49.0
  - @pyreon/unistyle@0.49.0
  - @pyreon/reactivity@0.49.0

## 0.48.0

### Patch Changes

- [#2369](https://github.com/pyreon/pyreon/pull/2369) [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Whole-class bundle-size fix: every module-level `nativeCompat(X)` STATEMENT (28 sites across 16 packages) converted to the `/* @__PURE__ */` assignment form. Inside a built lib's shared chunk the bare statement is an unremovable side effect that retains the component's body in every consumer bundle that never imports it — measured ~1.2KB gz of dead transition machinery in a mount-only app from runtime-dom's three sites alone; the sweep applies the same fix to ErrorBoundary, HeadProvider, Router components, RouteAnnouncer, Form components, providers across i18n/permissions/query (6 sites)/toast's Toaster, and the ui-system providers. Marker semantics are unchanged (`nativeCompat` returns the same fn; live-probed and locked by the existing native-marker suites). Two new locks: a lib-level tree-shake spec (mount-only bundle must not contain transition machinery, with a positive control) and a repo-wide census guard that fails on any new bare statement.

- Updated dependencies [[`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/reactivity@0.48.0
  - @pyreon/core@0.48.0
  - @pyreon/styler@0.48.0
  - @pyreon/ui-core@0.48.0
  - @pyreon/unistyle@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715)]:
  - @pyreon/core@0.47.0
  - @pyreon/reactivity@0.47.0
  - @pyreon/styler@0.47.0
  - @pyreon/ui-core@0.47.0
  - @pyreon/unistyle@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [[`3471a7f`](https://github.com/pyreon/pyreon/commit/3471a7fd609fc47c318aa06d206a6ed122f3c7fc), [`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`2609196`](https://github.com/pyreon/pyreon/commit/260919603f0f3cdd0c401cdc2c820e742e211db6), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/styler@0.46.0
  - @pyreon/reactivity@0.46.0
  - @pyreon/unistyle@0.46.0
  - @pyreon/core@0.46.0
  - @pyreon/ui-core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0
  - @pyreon/styler@0.45.0
  - @pyreon/ui-core@0.45.0
  - @pyreon/unistyle@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`8a5e24e`](https://github.com/pyreon/pyreon/commit/8a5e24e241abbd4202a02a13442a7c06289c825f), [`8527892`](https://github.com/pyreon/pyreon/commit/85278924ecba5059e3aadcca10fc63752dfa3f90), [`da1f628`](https://github.com/pyreon/pyreon/commit/da1f6282c42e42018aa15c92337df1badc185143), [`d0bd1d8`](https://github.com/pyreon/pyreon/commit/d0bd1d8a771fd8442e242f4e089440e606f88d6f), [`721618e`](https://github.com/pyreon/pyreon/commit/721618e97dacf995d8356dabea601ef4e98a4a12), [`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/unistyle@0.44.0
  - @pyreon/styler@0.44.0
  - @pyreon/reactivity@0.44.0
  - @pyreon/ui-core@0.44.0
  - @pyreon/core@0.44.0

## 0.43.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.43.1
  - @pyreon/ui-core@0.43.1
  - @pyreon/unistyle@0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0
  - @pyreon/styler@0.43.0
  - @pyreon/ui-core@0.43.0
  - @pyreon/unistyle@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0
  - @pyreon/styler@0.42.0
  - @pyreon/ui-core@0.42.0
  - @pyreon/unistyle@0.42.0

## 0.41.2

### Patch Changes

- Updated dependencies [[`3ebf924`](https://github.com/pyreon/pyreon/commit/3ebf924cff00ed5bfeb0a099f66f578409fe4c18)]:
  - @pyreon/styler@0.41.2
  - @pyreon/ui-core@0.41.2
  - @pyreon/unistyle@0.41.2

## 0.41.1

### Patch Changes

- Updated dependencies [[`12ce8e7`](https://github.com/pyreon/pyreon/commit/12ce8e72ffeff8b692db698301431674f7f87c40)]:
  - @pyreon/styler@0.41.1
  - @pyreon/ui-core@0.41.1
  - @pyreon/unistyle@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0
  - @pyreon/styler@0.41.0
  - @pyreon/ui-core@0.41.0
  - @pyreon/unistyle@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0
  - @pyreon/styler@0.40.0
  - @pyreon/ui-core@0.40.0
  - @pyreon/unistyle@0.40.0

## 0.39.0

### Patch Changes

- [#2019](https://github.com/pyreon/pyreon/pull/2019) [`a401811`](https://github.com/pyreon/pyreon/commit/a40181170cad2c71efa66244aa9306b4b3f8527f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Manifest completion — the final 8 real-API packages join the manifest-driven docs pipeline (llms.txt / llms-full.txt / MCP api-reference now cover them; each ships a bisect-locked manifest-snapshot test). Several stale README claims found during the source-grounded migration were corrected in the same pass.

- [#2022](https://github.com/pyreon/pyreon/pull/2022) [`2e9cd0e`](https://github.com/pyreon/pyreon/commit/2e9cd0ecf98d61b8fa0ce6cd1aa0fec73bc844a6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `spaceEvenly` being typed-but-unimplemented: coolgrid's `contentAlignX` (and unistyle's shared alignment vocabulary) advertised `'spaceEvenly'` from inception, but the alignment map had no entry — the declaration silently emitted nothing. The map now emits `space-evenly`; regression-locked.

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a), [`2e9cd0e`](https://github.com/pyreon/pyreon/commit/2e9cd0ecf98d61b8fa0ce6cd1aa0fec73bc844a6)]:
  - @pyreon/reactivity@0.39.0
  - @pyreon/unistyle@0.39.0
  - @pyreon/core@0.39.0
  - @pyreon/styler@0.39.0
  - @pyreon/ui-core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668), [`448b689`](https://github.com/pyreon/pyreon/commit/448b689cfd0a9346c13aa1f836a2467bb12d4fcb)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/styler@0.38.0
  - @pyreon/core@0.38.0
  - @pyreon/ui-core@0.38.0
  - @pyreon/unistyle@0.38.0

## 0.37.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.37.1
  - @pyreon/ui-core@0.37.1
  - @pyreon/unistyle@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies [[`19aa6a9`](https://github.com/pyreon/pyreon/commit/19aa6a9b6031b148e738fdd4ceb6d9048dfda99b)]:
  - @pyreon/unistyle@0.37.0
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0
  - @pyreon/styler@0.37.0
  - @pyreon/ui-core@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0
  - @pyreon/styler@0.36.0
  - @pyreon/ui-core@0.36.0
  - @pyreon/unistyle@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [[`97fa631`](https://github.com/pyreon/pyreon/commit/97fa6312304951e8cfd24fb8f0f405f94dc609db), [`368a609`](https://github.com/pyreon/pyreon/commit/368a6090c867e2dd6c37413e0656fe57a7e1e63c), [`ce5a10a`](https://github.com/pyreon/pyreon/commit/ce5a10ab91dcbf1252897426a965dcc3a65a50f2), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`3d47b98`](https://github.com/pyreon/pyreon/commit/3d47b987d244be4ad6b5453cd07ed39be85427bf)]:
  - @pyreon/styler@0.35.0
  - @pyreon/ui-core@0.35.0
  - @pyreon/unistyle@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65), [`3c6b8fd`](https://github.com/pyreon/pyreon/commit/3c6b8fd19805f2e41b9aa19929845ae9e3262f74)]:
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0
  - @pyreon/styler@0.34.0
  - @pyreon/unistyle@0.34.0
  - @pyreon/ui-core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0

## 0.32.0

### Minor Changes

- [#1528](https://github.com/pyreon/pyreon/pull/1528) [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094) Thanks [@vitbokisch](https://github.com/vitbokisch)! - CSS-variables mode — ui-system sweep + safety net + perf fast paths:

  - `@pyreon/styler`: dev-mode resolved-CSS validator in `sheet.insert` — warns (once per finding, `[Pyreon]`-prefixed) on `NaN` values (JS arithmetic on a var token), `undefined`/`null` values, and malformed `var()` concatenation (`var(--x)99` alpha-suffix hacks), naming the offending declaration. Tree-shaken from production.
  - `@pyreon/coolgrid`: grid math is var-aware — a `var()`/`calc()` gap or gutter now emits native `calc()` spacing (Row margins, Col gap-margin, Col width) instead of silently skipping spacing / emitting the malformed `var(--x)px` (multiplication, not division — `calc(x / -2)` invalidates the whole shorthand).
  - `@pyreon/unistyle`: `resolveCssVarReferences(value, registry)` — inline `var(--…)` references (incl. fallbacks) back to raw emitted values for consumers that can't evaluate custom properties (document/PDF export, devtools). `calc()` is inlined, not evaluated.
  - `@pyreon/runtime-dom`: `_rsCollapse` single-class fast path — identical light/dark classes (what the cssVariables collapse produces) skip the mode binding entirely (zero subscription, zero disposer).

  Measured (real Chromium): 100 components × 10 mode flips — classic 5.4ms vs cssVariables 1.7ms (3.2×), with zero `styler.resolve` / `rocketstyle.getTheme` work; the REAL `@pyreon/ui-components` Button + full default theme render var-safe with zero validator findings.

  Security: `resolveCssVarReferences` is implemented as a linear character scan (paren-depth-aware) rather than a regex, eliminating a polynomial-ReDoS surface (CodeQL `js/polynomial-redos`) on the var-fallback parse — input can be library/theme-author-controlled.

### Patch Changes

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264), [`ae3c3fd`](https://github.com/pyreon/pyreon/commit/ae3c3fd529250e7211657e4283fb5e6c3246bf00), [`c0616ab`](https://github.com/pyreon/pyreon/commit/c0616ab14052e0ac53fe6ca12d1ecaf729e7bc09)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/unistyle@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`f4ea1a1`](https://github.com/pyreon/pyreon/commit/f4ea1a1e5af38b37b4eb2feb14f4594e3c3c3482), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0

## 0.28.1

### Patch Changes

- [#1210](https://github.com/pyreon/pyreon/pull/1210) [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(coverage): bulk-bump 31 packages' `statements` threshold 94 → 95 (already passing)

  PR 1 of the "whole-repo coverage ≥ 95%" initiative (user-approved sequence:
  by-gap-size, start with quick wins).

  Every package in this bump is **already reporting ≥ 95% actual** per
  `bun scripts/check-coverage.ts`. Locking the configured threshold in
  match prevents regressions and lets the `Coverage (Full)` CI gate enforce
  the new floor.

  **No runtime changes, no test additions** — pure config update.
  Drift-detection in `BELOW_FLOOR_EXEMPTIONS` was triggered for two
  exemption entries (`@pyreon/code`, `@pyreon/kinetic`) which had been
  listed with `currentStatements: 94`; updated to 95 with the new reason
  documenting the lift.

  Packages bumped (current actual in parens):

  - @pyreon/attrs (100), @pyreon/coolgrid (100), @pyreon/table (100), @pyreon/toast (100)
  - @pyreon/rocketstyle (99.41), @pyreon/primitives (99.26), @pyreon/i18n (99.21), @pyreon/validation (99.12)
  - @pyreon/rx (98.45), @pyreon/kinetic (98.24), @pyreon/feature (98.11), @pyreon/head (97.97), @pyreon/flow (97.94), @pyreon/form (97.94), @pyreon/document-primitives (97.82), @pyreon/preact-compat (97.68), @pyreon/server (97.54), @pyreon/svelte-compat (97.42), @pyreon/validate (98.69), @pyreon/dnd (97.33)
  - @pyreon/query (96.79), @pyreon/mcp (96.52), @pyreon/unistyle (96.36) [already 95], @pyreon/reactivity (96.13), @pyreon/connector-document (96.05), @pyreon/react-compat (96.03) [already 95]
  - @pyreon/storage (95.6), @pyreon/permissions (95.38), @pyreon/url-state (95.13), @pyreon/runtime-dom (95.02), @pyreon/code (95.02), @pyreon/core (95.68), @pyreon/vite-plugin (95.32)

  Pre-existing CI failures NOT addressed in this PR (separate follow-ups):

  - @pyreon/sized-map: 0% reported by check-coverage.ts (test detection bug — Tier 5)
  - @pyreon/styler: 93.16% < 94% threshold (Tier 3)
  - @pyreon/ui-core: 90.94% < 94% threshold (Tier 4)
  - @pyreon/zero: 91.65% < 94% threshold (Tier 4)
  - @pyreon/runtime-dom: branches 85.78% < 88% threshold (Tier 6)

  Next PR (Tier 2): close the < 1pt gaps on charts, elements, hooks,
  hotkeys, lint, router, state-tree with focused test additions.

- [#1283](https://github.com/pyreon/pyreon/pull/1283) [`8b7820c`](https://github.com/pyreon/pyreon/commit/8b7820ceeb5c0354e74d18e54d82e5001c5a778c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 92.1% → 100%. Annotated the three production-only NODE_ENV branches on `DEV_PROPS` ternaries in `Container/component.tsx`, `Row/component.tsx`, `Col/component.tsx` with `/* v8 ignore */` — production NODE_ENV is not exercised in dev-mode tests. Bumped vitest `branches: 90 → 95`.

- Updated dependencies [[`ad5bd29`](https://github.com/pyreon/pyreon/commit/ad5bd29dbed3ee0517bddf63ff839c427bfd7edf), [`e975f3a`](https://github.com/pyreon/pyreon/commit/e975f3aa9a5ca0fa7983c8f4fa47c412cea7d735), [`4058727`](https://github.com/pyreon/pyreon/commit/40587271deeb30f968dcf297ee7781e2993ca1e8), [`cb4e2e6`](https://github.com/pyreon/pyreon/commit/cb4e2e6e96de147089fd80ba782152865ec6695a), [`971259b`](https://github.com/pyreon/pyreon/commit/971259b8e05b6221937ad27deda0074176da6b25)]:
  - @pyreon/ui-core@0.28.1
  - @pyreon/styler@0.28.1
  - @pyreon/unistyle@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0

## 0.27.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.27.1
  - @pyreon/ui-core@0.27.1
  - @pyreon/unistyle@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.26.3
  - @pyreon/ui-core@0.26.3
  - @pyreon/unistyle@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.26.2
  - @pyreon/ui-core@0.26.2
  - @pyreon/unistyle@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [[`487f1aa`](https://github.com/pyreon/pyreon/commit/487f1aa56e3b10746366f17deff2f4ba4cae827b), [`5af2864`](https://github.com/pyreon/pyreon/commit/5af28641ab1ad31a0c3feaf1c6a95163e83935d3)]:
  - @pyreon/styler@0.26.1
  - @pyreon/ui-core@0.26.1
  - @pyreon/unistyle@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [[`448073c`](https://github.com/pyreon/pyreon/commit/448073c3066bda0e54c71d85cf6bcfebc148a6f0), [`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/styler@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0

## 0.25.1

### Patch Changes

- [#901](https://github.com/pyreon/pyreon/pull/901) [`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bundle-size shrink across browser-shipped packages — **~7 KB gzipped saved** total. A typical Pyreon app shipping `runtime-dom + reactivity + core + router` is now **~5.7 KB lighter**.

  ## Wins (gzipped, measured at the production-define bundle level)

  | Package               | Before | After | Saved                      |
  | --------------------- | ------ | ----- | -------------------------- |
  | `@pyreon/runtime-dom` | 12,655 | 9,719 | **−2,936 B (−23%)**        |
  | `@pyreon/reactivity`  | 7,870  | 6,328 | **−1,542 B (−20%)**        |
  | `@pyreon/core`        | 4,972  | 4,191 | **−781 B (−16%)**          |
  | `@pyreon/router`      | 10,148 | 9,582 | **−566 B (−6%)**           |
  | `@pyreon/rocketstyle` | 4,390  | 3,992 | **−398 B (−9%)**           |
  | `@pyreon/styler`      | 5,624  | 5,453 | **−171 B (−3%)**           |
  | `@pyreon/server`      | 3,575  | 3,431 | **−144 B (−4%)**           |
  | `@pyreon/attrs`       | 1,017  | 915   | **−102 B (−10%)**          |
  | (8 more)              | ...    | ...   | smaller wins (1–98 B each) |

  17 packages shrunk total. Net **−7,153 B** gzipped across the published Pyreon footprint.

  ## Two complementary fixes

  **1. `check-bundle-budgets.ts` now measures the PRODUCTION-stripped size.** The script's `Bun.build` invocation was missing `define: { 'process.env.NODE_ENV': '"production"' }`. As a result, the budget measurement INCLUDED every `if (process.env.NODE_ENV !== 'production') console.warn(...)` string from `lib/` — overstating the real consumer bundle by 5–20% per package and forcing budget bumps for dev-only diagnostic growth that never reaches end users. Real consumers (Vite/Webpack/esbuild) all set this define at their build time; the measurement now matches what they actually ship.

  **2. Removed the `const __DEV__ = process.env.NODE_ENV !== 'production'` alias** from 22 files across 7 browser-shipped packages, in favor of the bare gate `if (process.env.NODE_ENV !== 'production')` at the use site. The alias pattern is recognized by `dev-guard-warnings` lint rule but is silently worse for downstream bundle size — Bun.build and several esbuild configurations don't propagate the const-folded value through the alias even when the production define is set. The bare gate folds reliably at the use site because the bundler replaces the expression with a literal `false` directly. This is the bundler-agnostic library convention used by React, Vue, Preact, Solid.

  Pure internal optimization — no API change, no behavior change. DEV mode behavior unchanged (warnings still fire identically in development). The migration is locked in by `pyreon/no-process-dev-gate` lint rule and the regenerated `scripts/bundle-budgets.json` floor.

  ## QA
  - All 1,378 compiler tests + 680 runtime-dom tests + 521 router tests + 168 server tests + 998 zero tests pass (storage test failures are pre-existing on main, unrelated to this PR)
  - Whole-repo `bun run lint` + `typecheck` clean
  - `gen-docs --check` clean
  - `bench:fair` (real-Chromium across 8 frameworks): Pyreon at top of tied cluster on 4 of 7 tests (create-1k, replace-all, partial-update, create-10k), tied in cluster on the other 3 — no regression
  - One pre-existing test (`dev-gate-treeshake.test.ts non-Vite consumer runtime correctness`) updated to reflect the new bare-gate contract: esbuild's `platform: 'browser'` default replacement (`process.env.NODE_ENV = "development"`) folds the bare gate AND the minifier strips the warn body — strictly better than the old `__DEV__` alias pattern the test was guarding

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1
  - @pyreon/styler@0.25.1
  - @pyreon/unistyle@0.25.1
  - @pyreon/ui-core@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0
  - @pyreon/ui-core@0.25.0
  - @pyreon/styler@0.25.0
  - @pyreon/unistyle@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/styler@0.24.6
  - @pyreon/ui-core@0.24.6
  - @pyreon/unistyle@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/styler@0.24.5
  - @pyreon/ui-core@0.24.5
  - @pyreon/unistyle@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/styler@0.24.4
  - @pyreon/ui-core@0.24.4
  - @pyreon/unistyle@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies [[`b5b87ab`](https://github.com/pyreon/pyreon/commit/b5b87abd2dcdf315260595b3f0b6d3908789c1fb)]:
  - @pyreon/ui-core@0.24.3
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/styler@0.24.3
  - @pyreon/unistyle@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/styler@0.24.2
  - @pyreon/ui-core@0.24.2
  - @pyreon/unistyle@0.24.2

## 0.24.1

### Patch Changes

- [#793](https://github.com/pyreon/pyreon/pull/793) [`e39d2c2`](https://github.com/pyreon/pyreon/commit/e39d2c2699ea5108bec76188ff66819a507ebab9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(ui-system): port vitus-labs perf cleanups — measured net wins only

  Mirror the structural cleanups from vitus-labs/ui-system PRs [#244](https://github.com/pyreon/pyreon/issues/244) → [#254](https://github.com/pyreon/pyreon/issues/254)
  across Pyreon's ui-system. Each port carries an inline comment naming the
  source commit + the upstream-measured delta.

  **Policy: only ports that show measurably better under Pyreon's runtime
  were kept.** Two upstream changes were measured neutral/worse here and
  deliberately reverted:

  - `styler.hashUpdate` 4-char unroll — measured +1.6% short / +2.1% long
    under Bun (both inside the ±2% JIT noise band). Reverted to the simple
    single-char loop.
  - `elements.Iterator` filterValidItems + detectKind fusion — measured
    -16.3% on a 20-item all-valid complex list (V8's `.filter()` is
    hyper-optimized for arrays with primitive predicates; manual fusion
    loses for small all-valid inputs). Reverted to the two-pass shape.

  **Measured wins** (paired before/after micro-bench via
  `bun scripts/perf/port-vitus-labs-bench.ts`, Bun 1.3.13, 3 warmup + 7
  timed runs, report median):

  - `styler.CSSResult._staticResolved` cache (8 repeats): **+85.3%**
  - `attrs.removeUndefinedProps` (10-prop input): **+77.4%**
  - `unistyle.shouldNormalize` (5-key static): **+66.0%**
  - `rocketstyle.pickStyledAttrs` (10-prop input): **+64.4%**
  - `hooks.useBreakpoint buildSortedBpTuples` (5-bp): **+46.5%**
  - `unistyle.createMediaQueries` (5-bp theme): **+31.7%**
  - `unistyle.alignContent isReverted` (mixed): **+30.0%**
  - `unistyle.shallowEqual` (5-key equal): **+27.4%**
  - `elements.Overlay click-close check`: **+20.5%**
  - `styler.HTML_PROPS Set→null-proto-obj` (5-key mix): **+8.3%**
  - `styler.splitRules charCodeAt vs str[i]`: **+8.0%**

  Plus 6 structural cleanups (no perf claim, allocation reductions only):

  - `styler.globalStyle` length-check vs `.trim()`
  - `unistyle.normalizeTheme` / `transformTheme` for-in (drops
    Object.entries tuple-array allocations)
  - `rocketstyle` `PSEUDO_AND_META_KEYS` module-scope hoist (per-definition
    allocation removed)
  - `rocketstyle.getThemeByMode` recursive for-in
  - `coolgrid.useGridContext` direct prop access (drops `pickThemeProps`
    wrapper — 2 `get()` calls saved per render)
  - `elements.Text` ternary tag assignment (drops `renderContent` closure)

  **Behavioural lock-in tests** (ported from vitus-labs `60fc25c1`, 8 new
  specs in `@pyreon/styler`):

  - `CSSResult._isDynamic` memoization: populate-on-first / cache-on-
    subsequent (values-mutation sentinel) / nested-propagation.
  - `CSSResult._staticResolved` cache: populate-on-first / cache-hit-via-
    sentinel / no-cache-for-dynamic / fallthrough-when-unclassified.
  - LRU-2 cacheRef test was React-specific and not ported (Pyreon uses
    signals, not React refs).

  **Bisect-verified-with-restore**:

  - Disabled `_isDynamic` cache → `× returns cached result on subsequent
calls without rescanning values` fires; restored → 425/425 pass.
  - Disabled `_staticResolved` cache → 2 lock-in specs fire; restored →
    425/425 pass.

  **Honest framing**: micro-benches isolate ONE hot path under tight loops;
  real-app aggregate deltas are smaller because each path is 1-10% of
  per-component mount-time, not 100%. Real-app benchmark
  (`examples/benchmark/`) NOT re-run for this PR — the proof here is
  per-function structural wins, not a real-app headline number.

  **Verification**:

  - 1832 tests pass: styler 425 (+8 lock-ins) + unistyle 240 + rocketstyle
    290 + attrs 89 + coolgrid 106 + elements 463 + hooks 219.
  - Browser smokes: elements 16, styler 12, rocketstyle 12, unistyle 6,
    coolgrid 7 — all pass.
  - lint, typecheck, gen-docs --check, check-doc-claims, check-manifest-
    depth, check-distribution, check-bundle-budgets: all green.

- Updated dependencies [[`e39d2c2`](https://github.com/pyreon/pyreon/commit/e39d2c2699ea5108bec76188ff66819a507ebab9)]:
  - @pyreon/styler@0.24.1
  - @pyreon/unistyle@0.24.1
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/ui-core@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/reactivity@0.24.0
  - @pyreon/styler@0.24.0
  - @pyreon/ui-core@0.24.0
  - @pyreon/unistyle@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/reactivity@0.23.0
  - @pyreon/styler@0.23.0
  - @pyreon/ui-core@0.23.0
  - @pyreon/unistyle@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/styler@0.22.0
  - @pyreon/ui-core@0.22.0
  - @pyreon/unistyle@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/styler@0.21.0
  - @pyreon/ui-core@0.21.0
  - @pyreon/unistyle@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/styler@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/ui-core@0.20.0
  - @pyreon/unistyle@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838), [`5431467`](https://github.com/pyreon/pyreon/commit/5431467ac41ccd1374359120b3e71f4af5d6745e)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/styler@0.19.0
  - @pyreon/ui-core@0.19.0
  - @pyreon/unistyle@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/styler@0.18.0
  - @pyreon/ui-core@0.18.0
  - @pyreon/unistyle@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/styler@0.17.0
  - @pyreon/ui-core@0.17.0
  - @pyreon/unistyle@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`53b230c`](https://github.com/pyreon/pyreon/commit/53b230cc9715129af0088da516f572e6572a2117), [`3b61ea9`](https://github.com/pyreon/pyreon/commit/3b61ea986e45fa5c4560d766532123276033abb8)]:
  - @pyreon/core@0.16.0
  - @pyreon/styler@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/ui-core@0.16.0
  - @pyreon/unistyle@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/styler@0.14.0
  - @pyreon/ui-core@0.14.0
  - @pyreon/unistyle@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/styler@0.13.0
  - @pyreon/ui-core@0.13.0
  - @pyreon/unistyle@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15
  - @pyreon/styler@0.12.15
  - @pyreon/ui-core@0.12.15
  - @pyreon/unistyle@0.12.15

## 0.12.14

### Patch Changes

- [#252](https://github.com/pyreon/pyreon/pull/252) [`25949e7`](https://github.com/pyreon/pyreon/commit/25949e79484f169ac905bb9feecf31c702de1db6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - T1.1 Phase 5 Batch 2 — browser smoke tests for rocketstyle + coolgrid + connector-document

  Adds real-Chromium Playwright smoke tests for three more ui-system
  packages. happy-dom can't compute styles from the injected stylesheet
  or resolve `@media` queries, so the rocketstyle → styler → DOM cascade,
  the coolgrid grid math, and the connector-document real-`h()`
  extraction pipeline went untested end-to-end.

  `@pyreon/rocketstyle` (`src/__tests__/rocketstyle.browser.test.tsx`,
  6 tests). Wraps a real `ComponentFn` (not `'div' as any`), matching
  production rocketstyle usage (Element/Text bases).

  - `.theme()` mounts and Chromium computes the authored color/padding
    via styler; emits a `pyr-*` class.
  - `state` prop swaps the resolved `$rocketstyle` theme.
  - `variant` layers on top of state.
  - `modifier` transform derives styles from the accumulated state theme.
  - `m(light, dark)` theme callback resolves per `PyreonUI` mode.
  - Reactive mode swap: `mode` is a signal on `PyreonUI`, rocketstyle's
    `$rocketstyleAccessor` reads `themeAttrs.mode` (ReactiveContext
    getter), styler's `isReactiveRS` effect observes the change and
    swaps classList in place — no remount. This is the only axis that
    survives the rocketstyle HOC spread (`{...filteredProps}` in
    `rocketstyleAttrsHoc` collapses `_rp()` getter props to values, so
    dimension props like `state={stateSig()}` aren't currently reactive
    end-to-end; mode flows via context, not props, so it stays live).

  `@pyreon/coolgrid` (`src/__tests__/coolgrid.browser.test.tsx`, 7 tests).
  Wraps in `PyreonUI` (deprecated `<Provider>` from @pyreon/unistyle
  replaced).

  - Container mounts with `display: flex; flex-direction: column`.
  - Col size=6/12 → ~50% of Row; two size=6 Cols sum to ~100%
    side-by-side.
  - `flex-basis: 25%` for size=3/12.
  - **columns != 12**: `theme.grid.columns = 6`, size=2/6 → 33.3333%
    — proves the math is `size / columns`, not hardcoded.
  - **`gap` subtraction**: Row `gap={24}`, Col size=6 emits
    `calc(50% - 24px)`; Chromium preserves the literal in computed
    `flex-basis`, col width < 50% of Row but > 40% (subtraction not
    failure).
  - **Responsive `size={[12, 6, 4]}`**: at the ~414px vitest viewport
    (below `sm`=576), the xs entry applies → size=12 → 100% of Row.

  `@pyreon/connector-document`
  (`src/__tests__/connector-document.browser.test.tsx`, 5 tests).

  - **Path A strict**: component body throws; if `extractDocumentTree`
    falls through to Path B and invokes the component, the test fails
    with the throw. Passing proves Path A reads `_documentProps` off
    the JSX vnode without invoking the component.
  - Path B: `extractDocumentTree` invokes the component to recover
    `_documentProps` from the post-call vnode (the rocketstyle
    attrs-HOC pattern).
  - Function-valued `_documentProps` resolve to LIVE values at
    extraction time — same vnode, signal mutated between calls, second
    extraction reads the new value.
  - Transparent (non-documentType) wrappers built with real `h()`
    flatten correctly.
  - `resolveStyles` produces a plain style record in the browser bundle
    (color/backgroundColor/fontSize=24/padding=[8,16] all parse; no
    Node-only dep leaks).

  Bisect-verified (load-bearing hot-path revert per suite):

  - **rocketstyle**: (a) emptied dimension theme merge → 3/6 failed
    (state, variant, modifier). (b) Static-returned `mode` in `useTheme`
    → 2/6 failed (reactive mode swap, m-callback dark-mode test).
    Restored, 6/6 pass.
  - **coolgrid**: (a) emptied Col `widthStyles` → 3/7 failed
    (size-ratio tests + flex-basis literal + gap + responsive).
    (b) Ignored `hasGap`, always plain percentage → gap-subtraction
    test failed with `calc(50% - 24px)` assertion. Restored, 7/7 pass.
  - **connector-document**: Path A strict test is self-bisecting —
    the component body throws, so any regression that causes the
    extractor to invoke it fails immediately with a real error.
    Additionally, gating Path B (`else if (false && typeof type ===
'function')`) → Path B + reactive accessor tests fail, 2/5.
    Restored, 5/5 pass.

  Also removes the three packages from `PHASE_5_PENDING_PACKAGES` in
  `scripts/check-browser-smoke.ts`. 7 packages remain pending
  (ui/{theme,components,primitives} + 4 compat layers).

- Updated dependencies [[`10a4e3b`](https://github.com/pyreon/pyreon/commit/10a4e3b53eb38b401f65f8436b94809ec4f1ee13)]:
  - @pyreon/styler@0.12.14
  - @pyreon/unistyle@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/ui-core@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/styler@0.12.13
  - @pyreon/ui-core@0.12.13
  - @pyreon/unistyle@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/styler@0.12.12
  - @pyreon/ui-core@0.12.12
  - @pyreon/unistyle@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/styler@0.12.11
  - @pyreon/ui-core@0.12.11
  - @pyreon/unistyle@0.12.11

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/ui-core@0.1.2
  - @pyreon/unistyle@0.1.2
  - @pyreon/styler@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756)]:
  - @pyreon/ui-core@0.1.1
  - @pyreon/unistyle@0.1.1
  - @pyreon/styler@0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

- Updated dependencies []:
  - @pyreon/ui-core@0.0.3
  - @pyreon/unistyle@0.0.3
  - @pyreon/styler@0.0.3

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages

- Updated dependencies [[`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef)]:
  - @pyreon/ui-core@0.0.2
  - @pyreon/unistyle@0.0.2
  - @pyreon/styler@0.0.2
