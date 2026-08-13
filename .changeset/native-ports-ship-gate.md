---
"@pyreon/table": minor
"@pyreon/cli": minor
---

Ship co-located native ports, and gate that they always do.

- **`@pyreon/table`**: its `PyreonTableState` Swift/Kotlin ports (added in #2828)
  were declared via `pyreon.native` and compiled by the co-source gate, but the
  package's `files` array did not include `native/swift` / `native/kotlin` — so
  the ports never reached the published tarball. A native app installing
  `@pyreon/table` could not resolve them. Added the two `files` entries.

- **`@pyreon/cli`** (`runDistributionGate`, i.e. `pyreon doctor` + the
  `check-distribution` CI gate): a new rule, `distribution/native-source-not-
  shipped`, fails any package that declares `pyreon.native` but omits the
  declared native source dirs from `files`. This is the class of bug above —
  a co-located port that builds in-repo but is absent from npm. It surfaced two
  real instances (`@pyreon/sync`, `@pyreon/table`), both fixed here.
