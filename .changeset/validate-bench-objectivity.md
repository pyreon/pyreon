---
'@pyreon/validate': patch
---

Harden the validation benchmark's objectivity (no runtime changes): per-cell process isolation (every scenario×path×library cell runs in fresh `bun` child processes, 3 pooled so the CI covers process-level jitter), seeded bootstrap 95% confidence intervals with 🤝 tie detection, a cross-library correctness gate before timing, and an explicit author-judge disclosure. Manifest/docs performance claims refreshed to the new verdicts.
