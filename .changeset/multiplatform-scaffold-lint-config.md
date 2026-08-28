---
'@pyreon/create-multiplatform': minor
---

A scaffolded multiplatform app now ships a `.pyreonlintrc.json` that turns the
`portable` rule tier on, plus the `lint` script to run it.

The two `portable` rules exist to catch shared source that will not lower to
SwiftUI or Compose — an out-of-subset construct, a platform branch with no
native arm — before the next native build finds it. They are `optIn`, correctly,
because they are pure noise in a web-only project, which means
`preset: 'recommended'` leaves them off. This scaffolder shipped no lint config
at all, so a scaffolded native app got the native rules switched off: rules
written for multiplatform, a multiplatform scaffolder, and they never met.

The config has two halves and both are load-bearing. `groups: { portable }`
enables the tier in one line — the affordance worth showing, since an app can
then state its platform story in config rather than rule by rule. But
`no-out-of-subset-construct` additionally fires on NOTHING until
`portablePaths` names the files that must travel (deliberate: unscoped it
produces thousands of findings in code entitled to the whole language, and
which files reach iOS and Android cannot be inferred from their contents). A
scaffolder is the one caller that knows the answer, having just created `src/`.
Without it the group key looks like it enabled something and enables nothing —
which is how the first cut of this change was written, and what its own test
caught.

Verified by running the SCAFFOLDER'S emitted config through the real `lint()`
rather than a re-typed copy, and bisected three ways: dropping the group key,
the paths option, or the whole file each fails.
