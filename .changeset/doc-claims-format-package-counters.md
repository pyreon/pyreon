---
"@pyreon/cli": patch
---

`pyreon doctor` doc-claims gate: add two new drift counters — **document output-format count** (source of truth: `@pyreon/document`'s `OutputFormat` union) and **published-package count** (non-private `package.json` under `packages/<category>/`) — and wire the root `README.md` in as a claim site for the existing hook-count and lint-rule/category counters. These are the three numbers that had silently drifted in the README ("55+ packages", "33+ hooks", "14+ output formats", "55 lint rules") because nothing gated them. The gate now scans 31 claim sites (was 19); any future drift in these counts fails CI.
