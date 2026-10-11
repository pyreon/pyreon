---
"@pyreon/native-compiler": patch
---

Retry native capability probes after interrupted compiler processes instead of caching toolchain absence. Reject failed Observation probes when native validation is required, including multi-file validation, and preserve the probe diagnostic.
