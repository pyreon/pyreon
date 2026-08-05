---
'@pyreon/runtime-dom': patch
'@pyreon/reactivity': patch
---

Bundle-size pass (sourcemap-attributed): the compiled-template adoption verify/plan machinery moves out of `_tpl`'s module into hydration-plan.ts behind a call-time-registered verifier hook, and the whole For-adoption routine moves out of `mountFor`'s closure onto the hydration-side `ForAdoption.adoptRows` — compiled CSR apps now tree-shake ALL hydration-adoption code (the fair-bench table app drops 15.0 → 13.4 KB gz; mount-only import: 8278 → 8028, below its pre-arc baseline). The singleton sentinel's ~1KB remediation guide is dev-gated (prod keeps a compact one-liner with both locations, versions, and the doctor pointer — the acted-on-at-dev-time guidance ships in dev only). Behavior identical: full suites + the 5000-seed hydration parity fuzz green; adoption verified working through the seam by the bench's node-identity gates.
