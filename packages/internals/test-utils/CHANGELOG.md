# @pyreon/test-utils

## 0.50.2

### Patch Changes

- [#3121](https://github.com/pyreon/pyreon/pull/3121) [`ec0aff6`](https://github.com/pyreon/pyreon/commit/ec0aff6672efcac6f135b1f32b0b7e72e96db08c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Closes every open finding from the lint audit, and adds the leak class nothing
  caught.

  **The 280 `querySelector(…) as HTMLX` casts are gone.** They were ratcheted
  because 92 files across 12 packages is not a safe hand-edit; a codemod with
  paren-balancing did it, and the conversion is verified rather than assumed —
  `query()` THROWS where a cast silently returned null, so a wrong conversion
  fails loudly. Typecheck clean across all 17 packages, node tests green, and
  **476 browser tests in real Chromium** covering the sites that only exist
  there. The doctor grade goes **F → A**, the ratchet drops **284 → 9**, and
  `no-query-selector-cast-in-test` is back at `error` rather than the `warn` it
  was demoted to in order to fire at all.

  **A ReDoS I introduced, caught by CodeQL.** `js/polynomial-redos`, high
  severity: `/(?:^|\/)routes\/(.+)$/` backtracks on paths with many `/routes/a`
  repetitions, and a linter is handed whatever paths its caller has. Replaced
  with linear string slicing — which also fixed a real misclassification, since
  the greedy regex anchored on the FIRST `/routes/` and mis-resolved nested
  paths. Both halves are pinned.

  **New rule — `pyreon/no-unguarded-async-signal-write`** (opt-in), for memory
  leak class F, which the catalog lists as caught by nothing. A slow earlier
  response resolves last and overwrites newer data: not a crash, not visible in
  a heap snapshot, just the wrong answer intermittently. Precision came from
  measuring — 42 findings became 9 after two narrowings the corpus taught:
  tests and benches cannot race with themselves, and `Map.set(key, value)` takes
  two arguments where a signal write takes one.

  It found two real bugs, both fixed: `<Mermaid>` and `<Math>` wrote their
  rendered output after an await with no cancellation, so unmounting mid-render
  kept the whole closure alive for a signal nothing reads.

  **Two rules stopped keying on what a thing is NAMED.** `no-mutate-store-state`
  fired only when a variable name contained "store" — renaming `cartStore` to
  `cart` disabled it silently. It now tracks the binding. `toast-a11y` exempted
  the literal spelling `Toaster`, so `import { Toaster as AppToast }` was
  reported for missing a11y it already has; the exemption follows the import.

  **`<Icon svg>` now states its contract.** It renders raw and cannot sanitize —
  the sanitized `innerHTML` prop needs a `DOMParser` and so cannot run during
  SSR, which an icon must. Rather than change that, the prop documents that it
  takes markup you control, and the new lint rule flags misuse in consumer code.

  **A bundle-budget failure now explains itself.** gzip differs between macOS and
  the ubuntu runner — measured ~177 B on a 16.5 KB package — so a budget with
  less headroom than that fails on CI while passing locally. The overage message
  now says when it is inside that band.

  Also fixes an untimed `fetch()` in `lathe pull` that could hang the CLI
  forever against a server that accepts and never answers.

  **The ratchet is now empty.** Every advisory finding is resolved rather than
  carried:

  - The five leak-class-F sites got real guards, and three were genuine
    concurrency bugs rather than style issues: `useWakeLock` and
    `useAudioRecorder` both checked their "already running" flag BEFORE the
    await, so two calls arriving during it each acquired a resource and orphaned
    the first — a wake lock held with nothing able to release it, a microphone
    stream left open. `useDeviceMotion` would attach its listener twice.
    `useClipboard` and atlas's source viewer could land a stale value.
  - `<CodeBlock>`'s line-number gutter no longer builds an HTML string at all. It
    was a workaround for a compiler bug that has since been fixed, so it was a
    raw sink in a component that never needed one; it renders real nodes now.
  - The three remaining sinks cannot be routed through the sanitized `innerHTML`
    prop, and that is verified rather than assumed: the allowlist deliberately
    excludes `foreignObject` and `<style>` (which mermaid emits for labels and
    theming) and does not cover MathML at all (which is all KaTeX emits), so
    sanitizing would strip working output. They are hardened at the library
    layer instead — `securityLevel: 'strict'` for mermaid, `trust: false` for
    KaTeX — and exempted with that reasoning recorded at each call site.

  The rule that found them also learned two things from being wrong: an in-flight
  promise shared between callers is a staleness guard just as much as a version
  counter, and a guard may live one scope out from the `async` function that
  writes.

- Updated dependencies [[`089064b`](https://github.com/pyreon/pyreon/commit/089064b8f9c98b297b2f7897a3721695be6cd1d2), [`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`d5f19b9`](https://github.com/pyreon/pyreon/commit/d5f19b9700962305b1cc4fd0e5da603ec884e759), [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9045709`](https://github.com/pyreon/pyreon/commit/9045709020995c37692eb2a9a6ecd65f6b8c6e30), [`99a1888`](https://github.com/pyreon/pyreon/commit/99a188821c005c4750c3daf98fd2d0863a0e3b58), [`e56abb6`](https://github.com/pyreon/pyreon/commit/e56abb6b44873164473b085e0e64838e7d9e7012), [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b), [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93), [`a6e97cb`](https://github.com/pyreon/pyreon/commit/a6e97cb4c0ee97dbc405900d4d9655f8fd81937a), [`c95ea09`](https://github.com/pyreon/pyreon/commit/c95ea0941a5a09cd9b14e817b09c857ce64b1112), [`fc0f445`](https://github.com/pyreon/pyreon/commit/fc0f445c4bf32e5b04355fa17ec5a938e9a05448), [`9f02726`](https://github.com/pyreon/pyreon/commit/9f0272677bd083fb50998335257e31e44766e85d), [`6a7c0f1`](https://github.com/pyreon/pyreon/commit/6a7c0f1bb21f285fce47fe67492ce9a14c20fd6a), [`1431b7b`](https://github.com/pyreon/pyreon/commit/1431b7bc0f5e3b984ba2884674c8b998b0131bb4), [`ce16224`](https://github.com/pyreon/pyreon/commit/ce1622481cb8e11f3d2abe8df1cc290003018a13), [`4b40ea0`](https://github.com/pyreon/pyreon/commit/4b40ea0a0b88b467c61c737f385a3253c946368f), [`4234788`](https://github.com/pyreon/pyreon/commit/423478813e018e7974b1dbd07525772cc5164754), [`4234788`](https://github.com/pyreon/pyreon/commit/423478813e018e7974b1dbd07525772cc5164754), [`43d769d`](https://github.com/pyreon/pyreon/commit/43d769d04237ece6e20b90a4499bed14c2b3b03e), [`ce16224`](https://github.com/pyreon/pyreon/commit/ce1622481cb8e11f3d2abe8df1cc290003018a13), [`1a7ca7e`](https://github.com/pyreon/pyreon/commit/1a7ca7ef1f982e43e2564e805a980d0a45385b73), [`c0e9e9c`](https://github.com/pyreon/pyreon/commit/c0e9e9cad5ac2cd077ca00fcd51648cee47d9fa5), [`18bc355`](https://github.com/pyreon/pyreon/commit/18bc355db06ba5f8e2eabcc6a5e68d82387d3b95), [`cb15c01`](https://github.com/pyreon/pyreon/commit/cb15c012632b66ea26b777087251aa906006a168), [`75a47dd`](https://github.com/pyreon/pyreon/commit/75a47dd93736933a941109d9a844099a54bdf58a), [`2b12889`](https://github.com/pyreon/pyreon/commit/2b12889546e64765a9c83c961e64c236f7b6dd76), [`80135d8`](https://github.com/pyreon/pyreon/commit/80135d80f82ea0f5f1c25da1f44512b8214529ea), [`ce16224`](https://github.com/pyreon/pyreon/commit/ce1622481cb8e11f3d2abe8df1cc290003018a13), [`e6b70a5`](https://github.com/pyreon/pyreon/commit/e6b70a5c80ed7c9f338a6a750296ebe89e9dd9c2), [`cbd6459`](https://github.com/pyreon/pyreon/commit/cbd6459970423b7f7d94883685ae7c753895f1d9), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`9fe7be2`](https://github.com/pyreon/pyreon/commit/9fe7be2e14c2e42c79bd9267c410b9b4ebcc7676), [`fc0d636`](https://github.com/pyreon/pyreon/commit/fc0d636583d09a649c95d308d59b815a96a76a79), [`0764bf0`](https://github.com/pyreon/pyreon/commit/0764bf02cb3cc21881fbdebeabab9df35e13b7d7), [`8a855d5`](https://github.com/pyreon/pyreon/commit/8a855d54a758f19d912152acc23beebb82c5ab14), [`d114ff8`](https://github.com/pyreon/pyreon/commit/d114ff8c83ac98acb0c421d0ee3217e43d4d713b), [`317367a`](https://github.com/pyreon/pyreon/commit/317367a9ade57b9aefd036441ebb397c8e3d1dc2), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`600f763`](https://github.com/pyreon/pyreon/commit/600f763fbd41493dd72812d875696a0ab3f2c623), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`773f9df`](https://github.com/pyreon/pyreon/commit/773f9dfaafaed05a06b252b1f83a0f7d970dbb8d), [`3dba9dc`](https://github.com/pyreon/pyreon/commit/3dba9dceec5dc96c34686b70604b6d79939655a2), [`768f104`](https://github.com/pyreon/pyreon/commit/768f104018ced7568dde1c99990a21c273e924ec), [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760), [`0d4ebbf`](https://github.com/pyreon/pyreon/commit/0d4ebbf8a0c2ed015ee5fd29ff772cf66e7e0eb2), [`c52e915`](https://github.com/pyreon/pyreon/commit/c52e915f03b8f7322a5e993ee50e8dfb653e8b58), [`1e6c0f2`](https://github.com/pyreon/pyreon/commit/1e6c0f26e906bb3628f37a663456d572985ea61d), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`a92fd69`](https://github.com/pyreon/pyreon/commit/a92fd69a81dde9b99ca8585e213454fbf399b7f5), [`c52e915`](https://github.com/pyreon/pyreon/commit/c52e915f03b8f7322a5e993ee50e8dfb653e8b58), [`7c0d3cb`](https://github.com/pyreon/pyreon/commit/7c0d3cb9c7f158a0ce308fea3da9a7b487635b9a), [`24c4019`](https://github.com/pyreon/pyreon/commit/24c4019d3e2527bf063d65d62bf574b00965d1e4), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`c5c44b8`](https://github.com/pyreon/pyreon/commit/c5c44b811a413688d34bd96ee7dda367d75d8b03), [`e5b71bd`](https://github.com/pyreon/pyreon/commit/e5b71bd064c94914001644f1bbafafc3c2b97559), [`d0e57b2`](https://github.com/pyreon/pyreon/commit/d0e57b27ccbf9b4b90521235186a003f3d6bc3ca), [`6c9e618`](https://github.com/pyreon/pyreon/commit/6c9e6189660eee8d672825d6b6fc905155db2f9e), [`531d7a1`](https://github.com/pyreon/pyreon/commit/531d7a1c6294624c7e0ac63919d6bb4a70386c07), [`fabd888`](https://github.com/pyreon/pyreon/commit/fabd888ac865155a5af687f1706bf918c6419f19), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`5438e9a`](https://github.com/pyreon/pyreon/commit/5438e9a7496e4c6e5dac43bc03ab90459d147a59), [`0b2edfc`](https://github.com/pyreon/pyreon/commit/0b2edfc24f106f765bd356c2a572bcae0b75d8d0), [`f84675f`](https://github.com/pyreon/pyreon/commit/f84675fb134fe96c7d76c1631f754954816183bd), [`5af143d`](https://github.com/pyreon/pyreon/commit/5af143d746be81a4a0d688243f123d532c455553), [`2bef24d`](https://github.com/pyreon/pyreon/commit/2bef24df3d5c86d709509906d4d1e831357b41c6), [`f8ee02a`](https://github.com/pyreon/pyreon/commit/f8ee02aadb4c1fa2c223201f8f2480a143341e42), [`b689ffd`](https://github.com/pyreon/pyreon/commit/b689ffd0b004a387591c912479f080442ffce49b), [`f4e9268`](https://github.com/pyreon/pyreon/commit/f4e9268a750318ceb5f7d2dc40c185a53e6b5299), [`086ca67`](https://github.com/pyreon/pyreon/commit/086ca67dd5219a7e80111c2c62c301be4263f535), [`967f78b`](https://github.com/pyreon/pyreon/commit/967f78b1c1d87d1eac156b1d122d27e772734330), [`195a9dc`](https://github.com/pyreon/pyreon/commit/195a9dc6417f964eb3858772da449a3bc1f1d02a), [`29f1002`](https://github.com/pyreon/pyreon/commit/29f10026097e30e261dcc49ad25ea3928ab7e026), [`c26fcef`](https://github.com/pyreon/pyreon/commit/c26fcef861ec794ca7f0e0b2163d84f7b58c0866), [`50caf2d`](https://github.com/pyreon/pyreon/commit/50caf2d3f97fefa7afa6105e38c7f5940c427b5d), [`5a83e86`](https://github.com/pyreon/pyreon/commit/5a83e86c2c1848de9b318e2fd011963f2125cd4d), [`7ead5f8`](https://github.com/pyreon/pyreon/commit/7ead5f8c0b10e9301f66cc0dd6a6f8f1d3ea3bdb)]:
  - @pyreon/runtime-dom@0.52.0
  - @pyreon/ui-core@0.52.0
  - @pyreon/core@0.52.0
  - @pyreon/rocketstyle@0.52.0

## 0.50.1

### Patch Changes

- Updated dependencies:
  - @pyreon/ui-core@0.51.0
  - @pyreon/rocketstyle@0.51.0
  - @pyreon/runtime-dom@0.51.0
  - @pyreon/core@0.51.0

## 0.13.38

### Patch Changes

- Updated dependencies [[`4d8b0ac`](https://github.com/pyreon/pyreon/commit/4d8b0ac11243c69bc96c0101f78ef4da27399f20), [`f3f5d3b`](https://github.com/pyreon/pyreon/commit/f3f5d3b70d2bd19b23b802ea21ad8ba9d5e416a7), [`c41e4f3`](https://github.com/pyreon/pyreon/commit/c41e4f3cc4084a2b7abbf2af92e9df1ef05791b6), [`6bd48c6`](https://github.com/pyreon/pyreon/commit/6bd48c6913eb17f88bed2aa89e903fc77fb0990a)]:
  - @pyreon/ui-core@0.50.0
  - @pyreon/core@0.50.0
  - @pyreon/rocketstyle@0.50.0
  - @pyreon/runtime-dom@0.50.0

## 0.13.37

### Patch Changes

- Updated dependencies [[`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85), [`f5f94ef`](https://github.com/pyreon/pyreon/commit/f5f94ef21e58b2e0430cee67a509630936d7ee73), [`db6319e`](https://github.com/pyreon/pyreon/commit/db6319edb0fc993b6319ece9b8f258b9da5e7a4d), [`d935083`](https://github.com/pyreon/pyreon/commit/d935083033edd2c0e74c8fa71e46d9dfcdb661e7)]:
  - @pyreon/core@0.49.0
  - @pyreon/runtime-dom@0.49.0
  - @pyreon/rocketstyle@0.49.0
  - @pyreon/ui-core@0.49.0

## 0.13.36

### Patch Changes

- Updated dependencies [[`5890567`](https://github.com/pyreon/pyreon/commit/5890567189a4a46e30387ae1f87811b8735cb768), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`d30f818`](https://github.com/pyreon/pyreon/commit/d30f818d2c4df6e0621cad29eedff3197b9004cc)]:
  - @pyreon/runtime-dom@0.48.0
  - @pyreon/core@0.48.0
  - @pyreon/rocketstyle@0.48.0
  - @pyreon/ui-core@0.48.0

## 0.13.35

### Patch Changes

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715), [`34d68e1`](https://github.com/pyreon/pyreon/commit/34d68e1e00088c589b8362468144951d648527f2)]:
  - @pyreon/core@0.47.0
  - @pyreon/runtime-dom@0.47.0
  - @pyreon/rocketstyle@0.47.0
  - @pyreon/ui-core@0.47.0

## 0.13.34

### Patch Changes

- Updated dependencies [[`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04), [`421ca82`](https://github.com/pyreon/pyreon/commit/421ca82e6d0ab950ff7c47bfc0870142c6308526), [`d9a8dd8`](https://github.com/pyreon/pyreon/commit/d9a8dd80627239d864ebd70de830b50d72eae4c9), [`bdea687`](https://github.com/pyreon/pyreon/commit/bdea687b11ce312ce5a9aaec3a96a44bb6c48d30), [`22d82cf`](https://github.com/pyreon/pyreon/commit/22d82cf46bad096765f5cb174d2bf3fdadb49902), [`853c9b6`](https://github.com/pyreon/pyreon/commit/853c9b615459fa891bb0876d0b2d05d478deb728), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/runtime-dom@0.46.0
  - @pyreon/rocketstyle@0.46.0
  - @pyreon/core@0.46.0
  - @pyreon/ui-core@0.46.0

## 0.13.33

### Patch Changes

- Updated dependencies [[`747cced`](https://github.com/pyreon/pyreon/commit/747cced0efd3611bcff4f0d8ec01417ed5f19e45), [`5cf5387`](https://github.com/pyreon/pyreon/commit/5cf5387fb214108c694e3678a76a113b4d198fa4)]:
  - @pyreon/runtime-dom@0.45.0
  - @pyreon/core@0.45.0
  - @pyreon/rocketstyle@0.45.0
  - @pyreon/ui-core@0.45.0

## 0.13.32

### Patch Changes

- Updated dependencies [[`ae2472e`](https://github.com/pyreon/pyreon/commit/ae2472e4ecb31cd59bde23d1983afe7db1c62d99), [`57f7b2d`](https://github.com/pyreon/pyreon/commit/57f7b2d1d9028f7a73c3717cd893b2028cc0330b), [`8413136`](https://github.com/pyreon/pyreon/commit/84131368d6f8790ba50e2af9d383ee289e4b1f5c), [`721618e`](https://github.com/pyreon/pyreon/commit/721618e97dacf995d8356dabea601ef4e98a4a12)]:
  - @pyreon/runtime-dom@0.44.0
  - @pyreon/rocketstyle@0.44.0
  - @pyreon/ui-core@0.44.0
  - @pyreon/core@0.44.0

## 0.13.31

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/runtime-dom@0.43.0
  - @pyreon/rocketstyle@0.43.0
  - @pyreon/ui-core@0.43.0

## 0.13.30

### Patch Changes

- Updated dependencies [[`39051db`](https://github.com/pyreon/pyreon/commit/39051dbcec2aa5f3aa9db79c5ac0a9f9197cc1e9)]:
  - @pyreon/runtime-dom@0.42.0
  - @pyreon/core@0.42.0
  - @pyreon/rocketstyle@0.42.0
  - @pyreon/ui-core@0.42.0

## 0.13.29

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/runtime-dom@0.41.0
  - @pyreon/rocketstyle@0.41.0
  - @pyreon/ui-core@0.41.0

## 0.13.28

### Patch Changes

- Updated dependencies [[`e6d3905`](https://github.com/pyreon/pyreon/commit/e6d390586944b903ee8d9c97a71cbaf26eca63d6), [`a5021f6`](https://github.com/pyreon/pyreon/commit/a5021f631729add83b2808a18288a2c48f81c233), [`ea835ad`](https://github.com/pyreon/pyreon/commit/ea835ad364e3dcf0de8337fceed382e9f6762285), [`4958096`](https://github.com/pyreon/pyreon/commit/4958096c01f4ed4f031cc65bf9ff7c26c93d3449), [`e859638`](https://github.com/pyreon/pyreon/commit/e859638a4c382051d5fa6f2605a8c383207f6e66), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d)]:
  - @pyreon/runtime-dom@0.40.0
  - @pyreon/core@0.40.0
  - @pyreon/rocketstyle@0.40.0
  - @pyreon/ui-core@0.40.0

## 0.13.27

### Patch Changes

- Updated dependencies [[`b15b4b5`](https://github.com/pyreon/pyreon/commit/b15b4b5b823c85babc07b9250bc4fa39a4b22d31), [`a0c82c3`](https://github.com/pyreon/pyreon/commit/a0c82c3270a8e89e69d88046b590f04588f6802f), [`16f2ad1`](https://github.com/pyreon/pyreon/commit/16f2ad130f7ba1fd0e821bf28bc59fe49787790b), [`a401811`](https://github.com/pyreon/pyreon/commit/a40181170cad2c71efa66244aa9306b4b3f8527f), [`9562f24`](https://github.com/pyreon/pyreon/commit/9562f2489e1d7176dd41b1ec52fe0fb39568b100), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`8a1feb0`](https://github.com/pyreon/pyreon/commit/8a1feb07faca643488c98e89db7bfc08d6867a31)]:
  - @pyreon/runtime-dom@0.39.0
  - @pyreon/rocketstyle@0.39.0
  - @pyreon/core@0.39.0
  - @pyreon/ui-core@0.39.0

## 0.13.26

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@0.38.0
  - @pyreon/core@0.38.0
  - @pyreon/rocketstyle@0.38.0
  - @pyreon/ui-core@0.38.0

## 0.13.25

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/runtime-dom@0.37.0
  - @pyreon/rocketstyle@0.37.0
  - @pyreon/ui-core@0.37.0

## 0.13.24

### Patch Changes

- Updated dependencies:
  - @pyreon/runtime-dom@0.36.0
  - @pyreon/core@0.36.0
  - @pyreon/rocketstyle@0.36.0
  - @pyreon/ui-core@0.36.0

## 0.13.23

### Patch Changes

- Updated dependencies [[`8a1345d`](https://github.com/pyreon/pyreon/commit/8a1345d9b14f56130f38823b58745207c7bdf7ef), [`97fa631`](https://github.com/pyreon/pyreon/commit/97fa6312304951e8cfd24fb8f0f405f94dc609db), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`1c98f38`](https://github.com/pyreon/pyreon/commit/1c98f3863ccd2fd16a4ad6e20e82fb778725bca0)]:
  - @pyreon/runtime-dom@0.35.0
  - @pyreon/ui-core@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/rocketstyle@0.35.0

## 0.13.22

### Patch Changes

- Updated dependencies [[`c0814b7`](https://github.com/pyreon/pyreon/commit/c0814b7881b01b7bfed19dffd7f48a3269c14199), [`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65), [`3c6b8fd`](https://github.com/pyreon/pyreon/commit/3c6b8fd19805f2e41b9aa19929845ae9e3262f74)]:
  - @pyreon/runtime-dom@0.34.0
  - @pyreon/core@0.34.0
  - @pyreon/rocketstyle@0.34.0
  - @pyreon/ui-core@0.34.0

## 0.13.21

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.13.20

### Patch Changes

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`4529407`](https://github.com/pyreon/pyreon/commit/4529407d69ba0875568b5c78ff14e2850aa2d690), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59), [`9eb24f6`](https://github.com/pyreon/pyreon/commit/9eb24f604e6e4be62ef4ad3ba33e0c3fa28e9906), [`5a38b69`](https://github.com/pyreon/pyreon/commit/5a38b69a2a2dc9a331c2e6a8a11375eebc532c63)]:
  - @pyreon/core@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/rocketstyle@0.33.0

## 0.13.19

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.13.18

### Patch Changes

- Updated dependencies [[`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07)]:
  - @pyreon/core@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.13.17

### Patch Changes

- Updated dependencies [[`d65d779`](https://github.com/pyreon/pyreon/commit/d65d77982284b3ce8ec871fd536069b5cd36f770), [`34872f9`](https://github.com/pyreon/pyreon/commit/34872f9832564fce87e408411d5f416785c6b484), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.13.16

### Patch Changes

- [#1228](https://github.com/pyreon/pyreon/pull/1228) [`9b80d3e`](https://github.com/pyreon/pyreon/commit/9b80d3e4de7565515ce5bea603f6636e086af456) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift node-side coverage to ≥95% statements on test-utils + perf-harness.

  - `test-utils`: add 6 render-helpers tests covering getComputedTheme (function vs object $rocketstyle, missing props) + renderProps (with/without props, null vnode). Coverage 89.7% → 98.52% statements. Set thresholds 95/80/95/95.
  - `perf-harness`: exclude `src/overlay.ts` (DOM-heavy draggable floating panel with shadow DOM + pointer drag — needs real browser; exercised by Chromium e2e via examples/perf-dashboard). Coverage 88.35% → 100% statements. Set thresholds 95/80/95/95.

- [#1287](https://github.com/pyreon/pyreon/pull/1287) [`7c8c1d4`](https://github.com/pyreon/pyreon/commit/7c8c1d43f7dbd81d4581094b10738f8ffc5ff458) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 83.33% → 100%. Added `tests/components-edges.test.ts` covering `ThemeCapture` / `BaseComponent` function-accessor resolve path + `?? 'none'` pseudo-state fallbacks. Annotated `mount-reactive.ensureDom` SSR/no-DOM guard with `/* v8 ignore */`. Bumped vitest `branches: 80 → 95`.

- Updated dependencies [[`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0), [`ad5bd29`](https://github.com/pyreon/pyreon/commit/ad5bd29dbed3ee0517bddf63ff839c427bfd7edf), [`cb4e2e6`](https://github.com/pyreon/pyreon/commit/cb4e2e6e96de147089fd80ba782152865ec6695a), [`ea58eda`](https://github.com/pyreon/pyreon/commit/ea58eda140865aacc1b3d6f02bb9b0fe1772b7fe), [`04bb778`](https://github.com/pyreon/pyreon/commit/04bb77889f4b158fd7dbe109454a1faf992bccaf), [`e8d00a7`](https://github.com/pyreon/pyreon/commit/e8d00a763b713aab51172b1e16c6529feac028d3), [`fccddae`](https://github.com/pyreon/pyreon/commit/fccddae860e3126640dbcbd6d5a0ef22ac419f48)]:
  - @pyreon/core@0.28.1
  - @pyreon/rocketstyle@0.28.1
  - @pyreon/runtime-dom@0.28.1
  - @pyreon/ui-core@0.28.1

## 0.13.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.13.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.13.13

### Patch Changes

- Updated dependencies [[`fce4e86`](https://github.com/pyreon/pyreon/commit/fce4e868611a3f5e006f20a031d43435441901e5), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`b1e3087`](https://github.com/pyreon/pyreon/commit/b1e30879335bbeb29eb8c56520828b841f89db08), [`421fc21`](https://github.com/pyreon/pyreon/commit/421fc211ca6da19a332ed7dc5b51545181ee58da), [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c)]:
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.13.12

### Patch Changes

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720)]:
  - @pyreon/core@0.25.0
  - @pyreon/runtime-dom@0.25.0
  - @pyreon/ui-core@0.25.0
  - @pyreon/rocketstyle@0.25.0

## 0.13.11

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`c41aa1a`](https://github.com/pyreon/pyreon/commit/c41aa1ae90efe00d82c97f623a02ed17acb2427c), [`bc65b82`](https://github.com/pyreon/pyreon/commit/bc65b825505016e4433b50cd1276c9982ef10b8a), [`84cd28f`](https://github.com/pyreon/pyreon/commit/84cd28feba1899d70696e9a292bb078601558e8f), [`f803527`](https://github.com/pyreon/pyreon/commit/f8035271120088a3fee3a8cdeb8e50848428d2aa), [`49cc686`](https://github.com/pyreon/pyreon/commit/49cc6869c42e3d3a7ef9e6568f7aade0be23edc0), [`73a6949`](https://github.com/pyreon/pyreon/commit/73a694940a0121508dee84b8a88812753e26fb10)]:
  - @pyreon/core@0.24.0
  - @pyreon/runtime-dom@0.24.0
  - @pyreon/rocketstyle@0.24.0
  - @pyreon/ui-core@0.24.0

## 0.13.10

### Patch Changes

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/runtime-dom@0.23.0
  - @pyreon/rocketstyle@0.23.0
  - @pyreon/ui-core@0.23.0

## 0.13.9

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/runtime-dom@0.22.0
  - @pyreon/rocketstyle@0.22.0
  - @pyreon/ui-core@0.22.0

## 0.13.8

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/runtime-dom@0.21.0
  - @pyreon/rocketstyle@0.21.0
  - @pyreon/ui-core@0.21.0

## 0.13.7

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7), [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f)]:
  - @pyreon/runtime-dom@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/rocketstyle@0.20.0
  - @pyreon/ui-core@0.20.0

## 0.13.6

### Patch Changes

- Updated dependencies [[`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/core@0.19.0
  - @pyreon/ui-core@0.19.0
  - @pyreon/runtime-dom@0.19.0
  - @pyreon/rocketstyle@0.19.0

## 0.13.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@0.18.0
  - @pyreon/core@0.18.0
  - @pyreon/rocketstyle@0.18.0
  - @pyreon/ui-core@0.18.0

## 0.13.4

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/rocketstyle@0.17.0
  - @pyreon/ui-core@0.17.0
  - @pyreon/runtime-dom@0.17.0

## 0.13.3

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`6cda881`](https://github.com/pyreon/pyreon/commit/6cda8819d4c3cb7b1b5a4904aadc3e417524795c), [`21ccd15`](https://github.com/pyreon/pyreon/commit/21ccd153f29fff8ed629a2761a0c33cf33ae0ebe)]:
  - @pyreon/core@0.16.0
  - @pyreon/rocketstyle@0.16.0
  - @pyreon/runtime-dom@0.16.0
  - @pyreon/ui-core@0.16.0

## 0.13.2

### Patch Changes

- Updated dependencies [[`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6), [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4)]:
  - @pyreon/runtime-dom@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/rocketstyle@0.14.0
  - @pyreon/ui-core@0.14.0

## 0.12.11

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/ui-core@0.13.0
  - @pyreon/rocketstyle@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/runtime-dom@0.13.0

## 0.12.11

### Patch Changes

- Updated dependencies [[`25949e7`](https://github.com/pyreon/pyreon/commit/25949e79484f169ac905bb9feecf31c702de1db6)]:
  - @pyreon/rocketstyle@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/runtime-dom@0.13.0
  - @pyreon/ui-core@0.13.0
