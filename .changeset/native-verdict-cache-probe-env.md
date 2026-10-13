---
'@pyreon/native-compiler': patch
---

The native validation cache no longer reuses a toolchain-availability answer across environments. The probe was keyed only on the resolved `kotlinc`/`swiftc` binary, so an answer recorded with a full `PATH` was replayed in an environment where the same launcher could not start (missing `/usr/bin` tools or a different `JAVA_HOME`). The compile then failed at launch, and that failure was cached as a compiler rejection and served to every later run, including ones with a healthy `PATH`. The probe is now keyed on `PATH` and `JAVA_HOME` too, so a broken environment reports the toolchain as unavailable and caches nothing.

The Kotlin verdict-cache key also carried an empty compiler version: `kotlinc -version` prints to stderr and the probe read stdout, so a `kotlinc` upgrade never invalidated a stored Kotlin verdict. The probe now reads both streams.
