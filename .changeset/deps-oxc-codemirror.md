---
"@pyreon/compiler": patch
"@pyreon/lint": patch
"@pyreon/code": patch
---

Update parser/editor runtime dependencies: oxc-parser + @oxc-project/types 0.138.0 → 0.140.0 (compiler dual-backend equivalence + differential fuzz green), @codemirror/state 6.6.0 → 6.7.1 / @codemirror/view 6.43.0 → 6.43.6 / @codemirror/lang-markdown 6.5.1 (tree-wide coherence overrides bumped in lockstep; real-Chromium editor suite green). No API changes.
