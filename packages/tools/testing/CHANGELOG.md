# @pyreon/testing

## 0.53.0

### Patch Changes

- Updated dependencies [[`2c98031`](https://github.com/pyreon/pyreon/commit/2c980310b388ecc18d7812a418d836dd20afc060), [`6df4450`](https://github.com/pyreon/pyreon/commit/6df4450bb57c834997796f8f37c59bae3e743d74), [`a110468`](https://github.com/pyreon/pyreon/commit/a1104680b3cf44b9d062ee4906b76a3ff09b2634)]:
  - @pyreon/runtime-dom@0.53.0
  - @pyreon/query@0.53.0
  - @pyreon/i18n@0.53.0
  - @pyreon/toast@0.53.0
  - @pyreon/router@0.53.0
  - @pyreon/form@0.53.0
  - @pyreon/store@0.53.0
  - @pyreon/core@0.53.0
  - @pyreon/reactivity@0.53.0
  - @pyreon/ui-core@0.53.0

## 0.52.0

### Minor Changes

- [#3753](https://github.com/pyreon/pyreon/pull/3753) [`6bf2770`](https://github.com/pyreon/pyreon/commit/6bf2770d8d25e02aa853ac249b6c07923dac001d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Target vitest 5. The jest-dom matcher type augmentation now extends vitest 5's `Matchers<R, T>` (the v4-era `Assertion<T = any>` form no longer merges — TS2428), and the `vitest` peer range is narrowed from `>=2.0.0` to `^5.0.0`. Consumers still on vitest 2–4 should stay on the previous `@pyreon/testing`.

### Patch Changes

- [#3602](https://github.com/pyreon/pyreon/pull/3602) [`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The repo's contributor rules moved from `.claude/rules/` to `.agents/rules/`, and the agent instructions from `CLAUDE.md` to `AGENTS.md`, so they work with any coding agent. Tools that read those files now look in the new places: the MCP `get_anti_patterns` and `get_browser_smoke_status` tools, the lint rule `pyreon/require-browser-smoke-test`, and the `pyreon doctor` doc-claims gate. Messages and comments that pointed at the old paths are updated.

  The six `@pyreon/native-*` packages no longer describe themselves on npm as "PRIVATE / EXPERIMENTAL" or "Not published"; they are published, and their descriptions now say what each one is.

  `@pyreon/mcp`: `get_content_collection` and `get_content_entry` were registered and callable but missing from the manifest, so `mcp_overview` and the API reference did not list them. They are listed now, and `check-mcp-docs` fails when a registered tool and the manifest disagree in either direction.

- [#2704](https://github.com/pyreon/pyreon/pull/2704) [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration).

- [#2759](https://github.com/pyreon/pyreon/pull/2759) [`a6e9c1a`](https://github.com/pyreon/pyreon/commit/a6e9c1a428aaec7de6d6ecd76e7601d2c7f41b48) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Test-infrastructure only — no runtime or consumer-facing behavior change. The happy-dom spec-parity `hashchange`-echo guard (happy-dom fires a deferred synthetic `hashchange` for hash-changing `history.pushState`/`replaceState`; real browsers never do) was extracted from `@pyreon/router`'s test setup into the shared internal `@pyreon/test-utils` and installed in every suite that drives a real router in happy-dom: router (unchanged behavior), a11y (fixes a load-dependent CI flake where a stale echo made the route announcer fire for a traversal the test never made, plus a deterministic regression spec), and testing's own suite (internal devDep on the private `@pyreon/test-utils`; the shipped `/vitest` setup module is unchanged).

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

- Updated dependencies [[`089064b`](https://github.com/pyreon/pyreon/commit/089064b8f9c98b297b2f7897a3721695be6cd1d2), [`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`d5f19b9`](https://github.com/pyreon/pyreon/commit/d5f19b9700962305b1cc4fd0e5da603ec884e759), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47), [`61e0482`](https://github.com/pyreon/pyreon/commit/61e0482b7fa532d439af670066b8928fe121a53c), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9045709`](https://github.com/pyreon/pyreon/commit/9045709020995c37692eb2a9a6ecd65f6b8c6e30), [`57b94ed`](https://github.com/pyreon/pyreon/commit/57b94ed8cd4b2aa9d5bd16e52d39edcdb7056c62), [`1c70f68`](https://github.com/pyreon/pyreon/commit/1c70f68b69a7e9f60eb7d565bf8797a155353743), [`99a1888`](https://github.com/pyreon/pyreon/commit/99a188821c005c4750c3daf98fd2d0863a0e3b58), [`e56abb6`](https://github.com/pyreon/pyreon/commit/e56abb6b44873164473b085e0e64838e7d9e7012), [`6bf2770`](https://github.com/pyreon/pyreon/commit/6bf2770d8d25e02aa853ac249b6c07923dac001d), [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b), [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93), [`96426be`](https://github.com/pyreon/pyreon/commit/96426bef7ac3c86cf60ab898813dde449b1b0954), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`b7bd8e8`](https://github.com/pyreon/pyreon/commit/b7bd8e86a8eb9f5fbcd3e145f467e0789ab6c3d0), [`c95ea09`](https://github.com/pyreon/pyreon/commit/c95ea0941a5a09cd9b14e817b09c857ce64b1112), [`fc0f445`](https://github.com/pyreon/pyreon/commit/fc0f445c4bf32e5b04355fa17ec5a938e9a05448), [`9f02726`](https://github.com/pyreon/pyreon/commit/9f0272677bd083fb50998335257e31e44766e85d), [`cc455e8`](https://github.com/pyreon/pyreon/commit/cc455e84d9ed7d682d963d44b25cd3c4bb89c7c8), [`6a7c0f1`](https://github.com/pyreon/pyreon/commit/6a7c0f1bb21f285fce47fe67492ce9a14c20fd6a), [`26e1837`](https://github.com/pyreon/pyreon/commit/26e1837c562b35887a5b3866fc0251f086f32063), [`1431b7b`](https://github.com/pyreon/pyreon/commit/1431b7bc0f5e3b984ba2884674c8b998b0131bb4), [`ce16224`](https://github.com/pyreon/pyreon/commit/ce1622481cb8e11f3d2abe8df1cc290003018a13), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`0667b0b`](https://github.com/pyreon/pyreon/commit/0667b0bdad937bd79a8a7d3fef3a2b11d7a3f7ff), [`8665c92`](https://github.com/pyreon/pyreon/commit/8665c9296c0d0fa696aad9560f039e95f9df2201), [`a156c40`](https://github.com/pyreon/pyreon/commit/a156c4069ad6882d9e402efa552566dd5714b94d), [`9d6ca3d`](https://github.com/pyreon/pyreon/commit/9d6ca3d705b555a2bb52d6dfd0c5fe231ff69f5c), [`a6e9c1a`](https://github.com/pyreon/pyreon/commit/a6e9c1a428aaec7de6d6ecd76e7601d2c7f41b48), [`4b40ea0`](https://github.com/pyreon/pyreon/commit/4b40ea0a0b88b467c61c737f385a3253c946368f), [`4234788`](https://github.com/pyreon/pyreon/commit/423478813e018e7974b1dbd07525772cc5164754), [`4234788`](https://github.com/pyreon/pyreon/commit/423478813e018e7974b1dbd07525772cc5164754), [`43d769d`](https://github.com/pyreon/pyreon/commit/43d769d04237ece6e20b90a4499bed14c2b3b03e), [`ce16224`](https://github.com/pyreon/pyreon/commit/ce1622481cb8e11f3d2abe8df1cc290003018a13), [`1a7ca7e`](https://github.com/pyreon/pyreon/commit/1a7ca7ef1f982e43e2564e805a980d0a45385b73), [`c0e9e9c`](https://github.com/pyreon/pyreon/commit/c0e9e9cad5ac2cd077ca00fcd51648cee47d9fa5), [`18bc355`](https://github.com/pyreon/pyreon/commit/18bc355db06ba5f8e2eabcc6a5e68d82387d3b95), [`cb15c01`](https://github.com/pyreon/pyreon/commit/cb15c012632b66ea26b777087251aa906006a168), [`75a47dd`](https://github.com/pyreon/pyreon/commit/75a47dd93736933a941109d9a844099a54bdf58a), [`4897ca4`](https://github.com/pyreon/pyreon/commit/4897ca45cc053c4b5ff55ccc2e836e013a8dd73b), [`1eb2ba7`](https://github.com/pyreon/pyreon/commit/1eb2ba75c51f3e7ba0adf42168a80c824d8034f2), [`d4972ec`](https://github.com/pyreon/pyreon/commit/d4972ec33ccd5ac0601099b7539781326ab8dd0e), [`f0aa2b7`](https://github.com/pyreon/pyreon/commit/f0aa2b74a8f81903f89cbe7129a513fcdd09bf96), [`cf50c79`](https://github.com/pyreon/pyreon/commit/cf50c79668fa46510df17f76906520c53d6e0e4a), [`2b12889`](https://github.com/pyreon/pyreon/commit/2b12889546e64765a9c83c961e64c236f7b6dd76), [`80135d8`](https://github.com/pyreon/pyreon/commit/80135d80f82ea0f5f1c25da1f44512b8214529ea), [`ce16224`](https://github.com/pyreon/pyreon/commit/ce1622481cb8e11f3d2abe8df1cc290003018a13), [`f2194d5`](https://github.com/pyreon/pyreon/commit/f2194d544ca7fc10dcc64b2aeb1c97dc923eabfe), [`c41314d`](https://github.com/pyreon/pyreon/commit/c41314da54f7217a4a63cd0d6ec07583fd431001), [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb), [`e6b70a5`](https://github.com/pyreon/pyreon/commit/e6b70a5c80ed7c9f338a6a750296ebe89e9dd9c2), [`cbd6459`](https://github.com/pyreon/pyreon/commit/cbd6459970423b7f7d94883685ae7c753895f1d9), [`ce819ca`](https://github.com/pyreon/pyreon/commit/ce819cadd41f50af25200da1cc130a35c52ab523), [`ea4e50a`](https://github.com/pyreon/pyreon/commit/ea4e50ab7d97d84f2bd5518ea747280c34805611), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`9fe7be2`](https://github.com/pyreon/pyreon/commit/9fe7be2e14c2e42c79bd9267c410b9b4ebcc7676), [`fc0d636`](https://github.com/pyreon/pyreon/commit/fc0d636583d09a649c95d308d59b815a96a76a79), [`0764bf0`](https://github.com/pyreon/pyreon/commit/0764bf02cb3cc21881fbdebeabab9df35e13b7d7), [`ed6518a`](https://github.com/pyreon/pyreon/commit/ed6518a68ec678e546713abf4e2551a3297a794f), [`8b49de2`](https://github.com/pyreon/pyreon/commit/8b49de2f440c9e4be30402a499b91e53bf7705f1), [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50), [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50), [`7c69228`](https://github.com/pyreon/pyreon/commit/7c6922838c8c05695b320c62d5758e3379840560), [`ea12a88`](https://github.com/pyreon/pyreon/commit/ea12a887e736882b5019388ad0c61ba0d1e1490c), [`45a04fb`](https://github.com/pyreon/pyreon/commit/45a04fb6e95af5b6d0dad9d3e76d5d756a218f02), [`5fc3b9f`](https://github.com/pyreon/pyreon/commit/5fc3b9fda70b8d96a412b08f7e58e6e0df35e8fe), [`8a855d5`](https://github.com/pyreon/pyreon/commit/8a855d54a758f19d912152acc23beebb82c5ab14), [`d114ff8`](https://github.com/pyreon/pyreon/commit/d114ff8c83ac98acb0c421d0ee3217e43d4d713b), [`e56b865`](https://github.com/pyreon/pyreon/commit/e56b865f08946b7f848906bf2562911fa7f95066), [`50d9324`](https://github.com/pyreon/pyreon/commit/50d93245d8e28ba0a3c8217bd83a50d3dd6719d3), [`317367a`](https://github.com/pyreon/pyreon/commit/317367a9ade57b9aefd036441ebb397c8e3d1dc2), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`5867cca`](https://github.com/pyreon/pyreon/commit/5867cca15becbf4811effac32e81bdb3dc0a0d86), [`600f763`](https://github.com/pyreon/pyreon/commit/600f763fbd41493dd72812d875696a0ab3f2c623), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`41df05a`](https://github.com/pyreon/pyreon/commit/41df05a6eba6a474ef8f57cdfb973c2402c3c2ee), [`773f9df`](https://github.com/pyreon/pyreon/commit/773f9dfaafaed05a06b252b1f83a0f7d970dbb8d), [`3dba9dc`](https://github.com/pyreon/pyreon/commit/3dba9dceec5dc96c34686b70604b6d79939655a2), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e44dcc7`](https://github.com/pyreon/pyreon/commit/e44dcc7124a5617f95ddb69786be262a35280d5f), [`768f104`](https://github.com/pyreon/pyreon/commit/768f104018ced7568dde1c99990a21c273e924ec), [`e0e0dc0`](https://github.com/pyreon/pyreon/commit/e0e0dc066470e92066652ccbd739ae0d6e518c58), [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760), [`0d4ebbf`](https://github.com/pyreon/pyreon/commit/0d4ebbf8a0c2ed015ee5fd29ff772cf66e7e0eb2), [`0e434c8`](https://github.com/pyreon/pyreon/commit/0e434c89a2d317a2862d56cc8d1e623a68d9b332), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`80e2ce2`](https://github.com/pyreon/pyreon/commit/80e2ce2a77551338b3bf58c5bb6ef88236e5e285), [`6b84f8a`](https://github.com/pyreon/pyreon/commit/6b84f8aeca2303abb29e4a70b35cc664f790d256), [`db410a0`](https://github.com/pyreon/pyreon/commit/db410a0c599fde5df971c2d4ba3d95e18f7f62fb), [`a0611c4`](https://github.com/pyreon/pyreon/commit/a0611c4d5a9afa2472502f5d932e1ac152861e1e), [`b030408`](https://github.com/pyreon/pyreon/commit/b0304087973b540fa75fc0d627fd3a1dd120d1c1), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`c52e915`](https://github.com/pyreon/pyreon/commit/c52e915f03b8f7322a5e993ee50e8dfb653e8b58), [`9593fbc`](https://github.com/pyreon/pyreon/commit/9593fbc44375cc00f57865790a798bd53e479551), [`7c0d3cb`](https://github.com/pyreon/pyreon/commit/7c0d3cb9c7f158a0ce308fea3da9a7b487635b9a), [`24c4019`](https://github.com/pyreon/pyreon/commit/24c4019d3e2527bf063d65d62bf574b00965d1e4), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`c5c44b8`](https://github.com/pyreon/pyreon/commit/c5c44b811a413688d34bd96ee7dda367d75d8b03), [`e5b71bd`](https://github.com/pyreon/pyreon/commit/e5b71bd064c94914001644f1bbafafc3c2b97559), [`d0e57b2`](https://github.com/pyreon/pyreon/commit/d0e57b27ccbf9b4b90521235186a003f3d6bc3ca), [`6c9e618`](https://github.com/pyreon/pyreon/commit/6c9e6189660eee8d672825d6b6fc905155db2f9e), [`531d7a1`](https://github.com/pyreon/pyreon/commit/531d7a1c6294624c7e0ac63919d6bb4a70386c07), [`fabd888`](https://github.com/pyreon/pyreon/commit/fabd888ac865155a5af687f1706bf918c6419f19), [`05ad36a`](https://github.com/pyreon/pyreon/commit/05ad36acb9e3dfe6b4f9ee8b012fc9919f8cd219), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`5a52b2b`](https://github.com/pyreon/pyreon/commit/5a52b2be1759fbb4fc5f2fb368217adf5ac6070a), [`adb5897`](https://github.com/pyreon/pyreon/commit/adb58970bc878291bfd892927ee15cb8a4ca87a9), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`5438e9a`](https://github.com/pyreon/pyreon/commit/5438e9a7496e4c6e5dac43bc03ab90459d147a59), [`0b2edfc`](https://github.com/pyreon/pyreon/commit/0b2edfc24f106f765bd356c2a572bcae0b75d8d0), [`5af143d`](https://github.com/pyreon/pyreon/commit/5af143d746be81a4a0d688243f123d532c455553), [`2bef24d`](https://github.com/pyreon/pyreon/commit/2bef24df3d5c86d709509906d4d1e831357b41c6), [`f8ee02a`](https://github.com/pyreon/pyreon/commit/f8ee02aadb4c1fa2c223201f8f2480a143341e42), [`b689ffd`](https://github.com/pyreon/pyreon/commit/b689ffd0b004a387591c912479f080442ffce49b), [`f4e9268`](https://github.com/pyreon/pyreon/commit/f4e9268a750318ceb5f7d2dc40c185a53e6b5299), [`83b1853`](https://github.com/pyreon/pyreon/commit/83b1853933fc7ccee212d423bbaf333994e4ebbc), [`ac7699c`](https://github.com/pyreon/pyreon/commit/ac7699c24961e506b18e0a2cd7909131297c0c15), [`e87a031`](https://github.com/pyreon/pyreon/commit/e87a0315417c0037a57b2e86fe6840d7f72854b1), [`086ca67`](https://github.com/pyreon/pyreon/commit/086ca67dd5219a7e80111c2c62c301be4263f535), [`967f78b`](https://github.com/pyreon/pyreon/commit/967f78b1c1d87d1eac156b1d122d27e772734330), [`195a9dc`](https://github.com/pyreon/pyreon/commit/195a9dc6417f964eb3858772da449a3bc1f1d02a), [`29f1002`](https://github.com/pyreon/pyreon/commit/29f10026097e30e261dcc49ad25ea3928ab7e026), [`c26fcef`](https://github.com/pyreon/pyreon/commit/c26fcef861ec794ca7f0e0b2163d84f7b58c0866), [`214097a`](https://github.com/pyreon/pyreon/commit/214097ae90b62dcc59d5b098b027fb5c39055c74), [`c8a45f5`](https://github.com/pyreon/pyreon/commit/c8a45f50138420d851407b34ce97d7c357f3cbcc), [`127e5d6`](https://github.com/pyreon/pyreon/commit/127e5d65cd2a3cea8457a1bd6f397b75c0ad4597), [`50caf2d`](https://github.com/pyreon/pyreon/commit/50caf2d3f97fefa7afa6105e38c7f5940c427b5d), [`c7feb0b`](https://github.com/pyreon/pyreon/commit/c7feb0b726ea78ef7b6a4d3a17e8ae85df471a67), [`5a83e86`](https://github.com/pyreon/pyreon/commit/5a83e86c2c1848de9b318e2fd011963f2125cd4d), [`dc580fc`](https://github.com/pyreon/pyreon/commit/dc580fc13327c7a1ca1f23dc0ee5c25921470d1e), [`7ead5f8`](https://github.com/pyreon/pyreon/commit/7ead5f8c0b10e9301f66cc0dd6a6f8f1d3ea3bdb), [`b263f82`](https://github.com/pyreon/pyreon/commit/b263f82effa16d780f47f5d87f8d4a7a2f77602e)]:
  - @pyreon/runtime-dom@0.52.0
  - @pyreon/form@0.52.0
  - @pyreon/ui-core@0.52.0
  - @pyreon/core@0.52.0
  - @pyreon/router@0.52.0
  - @pyreon/store@0.52.0
  - @pyreon/reactivity@0.52.0
  - @pyreon/query@0.52.0
  - @pyreon/i18n@0.52.0
  - @pyreon/toast@0.52.0

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
  - @pyreon/runtime-dom@0.51.0
  - @pyreon/reactivity@0.51.0
  - @pyreon/core@0.51.0
  - @pyreon/router@0.51.0
  - @pyreon/form@0.51.0
  - @pyreon/i18n@0.51.0
  - @pyreon/query@0.51.0
  - @pyreon/store@0.51.0
  - @pyreon/toast@0.51.0

## 0.50.0

### Patch Changes

- Updated dependencies [[`4d8b0ac`](https://github.com/pyreon/pyreon/commit/4d8b0ac11243c69bc96c0101f78ef4da27399f20), [`f3f5d3b`](https://github.com/pyreon/pyreon/commit/f3f5d3b70d2bd19b23b802ea21ad8ba9d5e416a7), [`c41e4f3`](https://github.com/pyreon/pyreon/commit/c41e4f3cc4084a2b7abbf2af92e9df1ef05791b6)]:
  - @pyreon/ui-core@0.50.0
  - @pyreon/core@0.50.0
  - @pyreon/form@0.50.0
  - @pyreon/i18n@0.50.0
  - @pyreon/runtime-dom@0.50.0
  - @pyreon/reactivity@0.50.0
  - @pyreon/router@0.50.0
  - @pyreon/query@0.50.0
  - @pyreon/store@0.50.0
  - @pyreon/toast@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [[`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85), [`f5f94ef`](https://github.com/pyreon/pyreon/commit/f5f94ef21e58b2e0430cee67a509630936d7ee73), [`db6319e`](https://github.com/pyreon/pyreon/commit/db6319edb0fc993b6319ece9b8f258b9da5e7a4d), [`d935083`](https://github.com/pyreon/pyreon/commit/d935083033edd2c0e74c8fa71e46d9dfcdb661e7)]:
  - @pyreon/core@0.49.0
  - @pyreon/runtime-dom@0.49.0
  - @pyreon/router@0.49.0
  - @pyreon/form@0.49.0
  - @pyreon/i18n@0.49.0
  - @pyreon/query@0.49.0
  - @pyreon/toast@0.49.0
  - @pyreon/ui-core@0.49.0
  - @pyreon/reactivity@0.49.0
  - @pyreon/store@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [[`0ba8da3`](https://github.com/pyreon/pyreon/commit/0ba8da3c22bdf722b5f6a6aea11ee7a9e53a2e7d), [`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`5890567`](https://github.com/pyreon/pyreon/commit/5890567189a4a46e30387ae1f87811b8735cb768), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`c3dab73`](https://github.com/pyreon/pyreon/commit/c3dab7368cb22ea2229b5d5a03e7f86b94098cd6), [`c1f398a`](https://github.com/pyreon/pyreon/commit/c1f398aff02411a49c922902be7721a253ba2443), [`068754c`](https://github.com/pyreon/pyreon/commit/068754caba2fbea93a794342f6d6ccdf87d047c1), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/router@0.48.0
  - @pyreon/reactivity@0.48.0
  - @pyreon/store@0.48.0
  - @pyreon/form@0.48.0
  - @pyreon/i18n@0.48.0
  - @pyreon/query@0.48.0
  - @pyreon/runtime-dom@0.48.0
  - @pyreon/core@0.48.0
  - @pyreon/toast@0.48.0
  - @pyreon/ui-core@0.48.0

## 0.47.0

### Minor Changes

- [#2351](https://github.com/pyreon/pyreon/pull/2351) [`bf658a0`](https://github.com/pyreon/pyreon/commit/bf658a0eb6495dc9bd7724997bdd6471043a6fe7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(testing): library-specific helper subpaths — `/form`, `/ui`, `/router`, `/store`, `/i18n`, `/toast`, `/query` — each gated on its library as an OPTIONAL peer (the main entry stays dependency-light).

  - `@pyreon/testing/form` — `renderForm(() => useForm(...))` (renderHook-style headless harness: `fill` via setFieldValue+touched, `submit` awaits the full handleSubmit pipeline), `fillForm(scope, values)`/`submitForm(scope)` (REAL rendered forms, fields located by accessible LABEL, driven through real input/blur/submit events), `expectForm(form)` fluent assertions (`toBeValid`/`toBeInvalid`/`toHaveFieldError`/`toHaveNoFieldError`/`toBeDirty`/`toBePristine`/`toHaveValues`).
  - `@pyreon/testing/ui` — `renderWithTheme(ui, { theme, mode })` (PyreonUI wrap + reactive `setMode`, no remount), `expectComputedStyle(el, decls)` + `normalizeCssValue` (computed-serialization value normalization — `'red'`/`'#ff0000'`/`'rgb(255, 0, 0)'` compare equal in a real browser; happy-dom limits documented honestly).
  - `@pyreon/testing/router` — `await renderWithRouter(ui, { routes, route })` (initial route SETTLED before mount: lazy components + loaders pre-resolved via `router.preload`, so `useLoaderData()` is populated on first render; `navigate()` resolves after guards+loaders+DOM commit with the `NavigationResult`), `expectRouter(router).toBeAt('/posts/:id')` (pattern OR concrete path).
  - `@pyreon/testing/store` — `installStoreReset()` (afterEach `resetAllStores`) + `withFreshStore(useStore, fn)` (scoped guaranteed-fresh singleton, disposed after — sync/async/throw-safe) + re-exported `resetStore`/`resetAllStores`.
  - `@pyreon/testing/i18n` — `renderWithI18n(ui, { locale, messages })` with reactive `setLocale` + a bound `t()`.
  - `@pyreon/testing/toast` — `expectToast`/`findToast`/`getToasts`/`clearToasts` (store-level: work headless or with a mounted `<Toaster>`; type filter + soft-dismiss awareness).
  - `@pyreon/testing/query` — `renderWithQueryClient(ui, { client? })` + `createTestQueryClient()` (fresh isolated client per test, `retry: false`, `gcTime: Infinity` — the TanStack testing convention) + `setQueryData` passthrough.

  Every render harness accepts a `wrapper` option so providers COMPOSE (theme+router+query together) — deliberately no mega `renderApp`. Assertions follow the package's fluent convention (`expectSignal` precedent), never `expect.extend`.

  `@pyreon/store` fix (load-bearing for the isolation helpers, and a standalone leak fix): `resetStore(id)` / `resetAllStores()` now DISPOSE the store — stop its effectScope (setup/plugin computeds + effects) and run plugin cleanups — before dropping the registry entry. Previously a reset orphaned the entry while its scope kept firing on external signals forever (leak class B). Foreign registry values (custom `setRegistryProvider`) degrade to the old plain delete.

### Patch Changes

- [#2341](https://github.com/pyreon/pyreon/pull/2341) [`6a3fc45`](https://github.com/pyreon/pyreon/commit/6a3fc45ac6cb94e02066a3a0de8bd518564bd5ab) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix the `/matchers` and `/vitest` entries shipping broken:

  - `lib/matchers.js` was an EMPTY module — the library build's `treeshake.moduleSideEffects: false` silently dropped the bare side-effect `import '@testing-library/jest-dom/vitest'`, so `import '@pyreon/testing/matchers'` registered nothing. Registration is now an explicit `expect.extend` on bindings imported from `vitest` + `@testing-library/jest-dom/matchers` (bound imports cannot be tree-shaken), and a missing optional peer now fails loudly at module resolution instead of silently no-opping.
  - `@pyreon/testing/vitest` registered cleanup via `globalThis.afterEach`, which silently no-ops for projects running without `globals: true` (the vitest default) — containers leaked across tests and surfaced as confusing "Found multiple elements" failures. `afterEach` is now imported from `vitest`, which works regardless of the `globals` setting.
  - Both entries' shipped `.d.ts` were a bare `export {}` — the jest-dom `Assertion` type augmentation never reached published consumers. Each entry now declares the vitest module augmentation explicitly, and it survives into the built types.
  - `package.json` `sideEffects` now lists the two registration entries so consumer bundlers don't drop the bare imports either; `vitest` is declared as an optional peer.

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715), [`34d68e1`](https://github.com/pyreon/pyreon/commit/34d68e1e00088c589b8362468144951d648527f2), [`bf658a0`](https://github.com/pyreon/pyreon/commit/bf658a0eb6495dc9bd7724997bdd6471043a6fe7), [`577f40f`](https://github.com/pyreon/pyreon/commit/577f40fc3282672818c8b31a4f595b1dbb295d19)]:
  - @pyreon/core@0.47.0
  - @pyreon/runtime-dom@0.47.0
  - @pyreon/store@0.47.0
  - @pyreon/toast@0.47.0
  - @pyreon/form@0.47.0
  - @pyreon/reactivity@0.47.0
  - @pyreon/router@0.47.0
  - @pyreon/i18n@0.47.0
  - @pyreon/query@0.47.0
  - @pyreon/ui-core@0.47.0

## 0.46.0

### Patch Changes

- [#2269](https://github.com/pyreon/pyreon/pull/2269) [`1dc9cce`](https://github.com/pyreon/pyreon/commit/1dc9cce9d0ca8b5376f581b41edb0f6f2630b779) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs(testing): migrate @pyreon/testing to the manifest-driven docs pipeline (the
  last real-API package without a manifest — 51 → 52 manifests). Adds
  `src/manifest.ts` documenting the 7 Pyreon-native APIs (render / cleanup /
  renderHook + the reactive-graph matchers expectSignal / expectEffect /
  expectGarbageCollected / expectNoReactiveLeak) with source-verified footguns —
  including that render's queries bind to `baseElement` not `container`, cleanup is
  NOT auto-registered without the `/vitest` setup entry, renderHook runs the hook
  ONCE (Pyreon semantics), expectSignal's two matchers are the same check, and the
  GC matchers require `--expose-gc` — plus one grouped entry for the verbatim
  @testing-library/dom re-exports. Wires it into gen-docs (llms.txt / llms-full.txt /
  MCP api-reference), adds the @pyreon/manifest devDep + a manifest-snapshot test.
  Docs/manifest only — no runtime behavior change.

- [#2228](https://github.com/pyreon/pyreon/pull/2228) [`b09187a`](https://github.com/pyreon/pyreon/commit/b09187a1a3cb3352316cff72bfd68883d8720ead) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/testing` — finish the Testing-Library-parity story. The `fireEvent` /
  `waitFor` / `renderHook` / jest-dom-matcher surface shipped in prior releases;
  this hardens the real-Chromium coverage the parity bar requires (happy-dom can't
  exercise real event dispatch, visibility, or focus):

  - `fireEvent` is now proven through **both** halves of Pyreon's event model in a
    real browser: delegated events (`click`/`input`/`change`/`keyDown`/`submit`/
    `pointerDown`/`dblClick`/`focusIn`) that must bubble to the mount-container
    delegation root, AND non-bubbling events (`focus`/`blur`/`mouseEnter`/
    `mouseLeave`) that reach Pyreon's direct `addEventListener`. Also locks the
    `preventDefault → false` boolean return and the generic `fireEvent(el, event)`
    / `createEvent` form.
  - `waitFor` is proven to resolve on a signal-driven DOM change AND to **reject**
    on timeout (not hang); `waitForElementToBeRemoved` is covered.
  - `renderHook` reactive-value + `rerender` semantics are locked in a real mount.
  - The full jest-dom matcher set (`toBeVisible`/`toHaveFocus` — real
    `getComputedStyle`/`activeElement`, `toBeDisabled`/`toBeEnabled`/`toBeChecked`/
    `toHaveValue`/`toHaveClass`/`toHaveAttribute`/`toHaveTextContent`/
    `toBeInTheDocument`/`toBeEmptyDOMElement`) is exercised in real Chromium, each
    passing on the true case and throwing on the false case.

  Docs/README updated to reflect the now-complete surface (the "landing across
  follow-up PRs" caveat is removed).

- Updated dependencies [[`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04), [`d9a8dd8`](https://github.com/pyreon/pyreon/commit/d9a8dd80627239d864ebd70de830b50d72eae4c9), [`bdea687`](https://github.com/pyreon/pyreon/commit/bdea687b11ce312ce5a9aaec3a96a44bb6c48d30), [`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`22d82cf`](https://github.com/pyreon/pyreon/commit/22d82cf46bad096765f5cb174d2bf3fdadb49902), [`853c9b6`](https://github.com/pyreon/pyreon/commit/853c9b615459fa891bb0876d0b2d05d478deb728), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/runtime-dom@0.46.0
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [[`747cced`](https://github.com/pyreon/pyreon/commit/747cced0efd3611bcff4f0d8ec01417ed5f19e45), [`5cf5387`](https://github.com/pyreon/pyreon/commit/5cf5387fb214108c694e3678a76a113b4d198fa4)]:
  - @pyreon/runtime-dom@0.45.0
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`ae2472e`](https://github.com/pyreon/pyreon/commit/ae2472e4ecb31cd59bde23d1983afe7db1c62d99), [`8413136`](https://github.com/pyreon/pyreon/commit/84131368d6f8790ba50e2af9d383ee289e4b1f5c), [`721618e`](https://github.com/pyreon/pyreon/commit/721618e97dacf995d8356dabea601ef4e98a4a12), [`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/runtime-dom@0.44.0
  - @pyreon/reactivity@0.44.0
  - @pyreon/core@0.44.0

## 0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0
  - @pyreon/runtime-dom@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [[`39051db`](https://github.com/pyreon/pyreon/commit/39051dbcec2aa5f3aa9db79c5ac0a9f9197cc1e9)]:
  - @pyreon/runtime-dom@0.42.0
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0
  - @pyreon/runtime-dom@0.41.0

## 0.40.0

### Minor Changes

- [#2036](https://github.com/pyreon/pyreon/pull/2036) [`136376b`](https://github.com/pyreon/pyreon/commit/136376b59f3c09cbf52d9d054963786187bd181b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/testing` is now a thin adapter over `@testing-library/dom` (the shared foundation under the React/Vue/Solid/Svelte testing libraries) instead of a from-scratch reimplementation. `render` mounts a Pyreon component and binds the full `@testing-library/dom` query set to it; `screen`, `fireEvent`, `waitFor`, `within`, `prettyDOM`, and every query (`getByRole` with real ARIA + accessible-name resolution, `getByText`, `getByLabelText`, `getByTestId`, …) are re-exported verbatim — so the entire Testing-Library API works exactly as you know it, with the ecosystem's battle-tested edge-case handling. This matches how every Pyreon adapter package is built (`@pyreon/query` wraps TanStack, `@pyreon/dnd` wraps pragmatic-drag-and-drop). `fireEvent` through Pyreon's event delegation is verified in a real browser.

- [#2038](https://github.com/pyreon/pyreon/pull/2038) [`b7f132e`](https://github.com/pyreon/pyreon/commit/b7f132eb64b614666d9c8c50d5c66f38851e51d4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/testing` gains the GC / leak matchers. `expectGarbageCollected(factory)` collapses the hand-rolled `WeakRef` + two-pass-`gc()` ceremony into one call; `expectNoReactiveLeak(action)` asserts that a mount+unmount (or any action) leaves no net new nodes in the reactive graph after GC — catching the subscription/effect-scope retention leak class. Both require `--expose-gc` (`execArgv: ['--expose-gc']` in the vitest config) and throw an actionable error when it's absent rather than silently passing.

- [#2036](https://github.com/pyreon/pyreon/pull/2036) [`136376b`](https://github.com/pyreon/pyreon/commit/136376b59f3c09cbf52d9d054963786187bd181b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/testing` gains `renderHook` and two setup sub-entries. `renderHook(hook, { initialProps })` runs a Pyreon hook once in a probe component (Pyreon semantics — hooks run once) and exposes its return via `result.current`; `rerender(props)` updates a reactive props signal so `computed`/`effect` derivations re-run without re-invoking the hook. `@pyreon/testing/matchers` registers the `@testing-library/jest-dom` matchers (the complete, battle-tested set every Testing-Library user knows — `toBeInTheDocument`, `toBeVisible`, `toHaveAccessibleName`, `toBeChecked`, …) rather than a hand-rolled subset; `@pyreon/testing/vitest` is a `setupFiles` entry that also auto-registers `afterEach(cleanup)`. `@testing-library/jest-dom` is an optional peer dependency.

- [#2037](https://github.com/pyreon/pyreon/pull/2037) [`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/testing` gains the reactive-native matchers — the differentiator DOM-only testing libraries can't express. `expectSignal(sig).toHaveChangedTimes(n)` / `expectSignal(computed).toHaveRecomputedTimes(n)` assert fire counts; `expectEffect(handle).toReRunWhen(action)` and `.notToReRunWhen(action)` assert fine-grained re-run behavior — the NEGATIVE form ("this unrelated write did NOT re-run the effect") is impossible under a whole-component re-render model. They read Pyreon's reactive graph and require a dev/test build (a production build tree-shakes the graph — the matchers throw a clear error rather than silently pass). Replaces the hand-rolled `let ran = 0; …; expect(ran).toBe(n)` pattern.

- [#2033](https://github.com/pyreon/pyreon/pull/2033) [`2091a13`](https://github.com/pyreon/pyreon/commit/2091a1363e94e3c2f52fb404ce7c80911520ea0f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New package `@pyreon/testing` — official testing utilities for Pyreon. This first cut ships the Testing-Library core: `render(ui, options?)` (mounts into an isolated container, returns bound queries + `unmount`/`debug`), `screen` (document-scoped queries), `cleanup()` (unmounts every rendered tree; auto-registerable in `afterEach`), and the `getByText`/`getByTestId` query families (`getBy`/`queryBy`/`getAllBy`/`findBy` variants). Interaction (`fireEvent`/`waitFor`), ARIA-role queries, `renderHook`, jest-dom matchers, and the reactive-native matchers follow in subsequent releases.

### Patch Changes

- [#2060](https://github.com/pyreon/pyreon/pull/2060) [`4e6d768`](https://github.com/pyreon/pyreon/commit/4e6d768cacacc3b7595dbdb0cf41bded5ac287dd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `render()` failing to find portaled content. Bound queries (`getByRole`, `getByText`, …) now resolve from `baseElement` (`document.body` by default) instead of the mount container — matching `@testing-library/react`. Pyreon `<Portal>` / Overlay / Modal / Toast / Dropdown render OUTSIDE the container (into `document.body`), so container-scoped queries silently failed to find any modal/overlay/tooltip. Scope to a single tree with `within(result.container)` when needed.

- Updated dependencies [[`e6d3905`](https://github.com/pyreon/pyreon/commit/e6d390586944b903ee8d9c97a71cbaf26eca63d6), [`a5021f6`](https://github.com/pyreon/pyreon/commit/a5021f631729add83b2808a18288a2c48f81c233), [`ea835ad`](https://github.com/pyreon/pyreon/commit/ea835ad364e3dcf0de8337fceed382e9f6762285), [`4958096`](https://github.com/pyreon/pyreon/commit/4958096c01f4ed4f031cc65bf9ff7c26c93d3449), [`e859638`](https://github.com/pyreon/pyreon/commit/e859638a4c382051d5fa6f2605a8c383207f6e66), [`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/runtime-dom@0.40.0
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0
