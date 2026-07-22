---
'@pyreon/charts': patch
---

Bench protocol upgrade: per-impl PROCESS ISOLATION (fresh child per impl ×3, pooled samples) + bootstrap CI95 with 🤝 tie detection — the store-bench lesson applied. Re-measured verdicts: reactive update ~9.4× faster, dispose ~2.3× faster, and mount is now a CI95-overlap TIE (the prior "~1.65–1.9× slower mount" was single-process order bias + the pre-fast-path loader). vue-echarts driver stays a tracked follow-up. No runtime changes.
