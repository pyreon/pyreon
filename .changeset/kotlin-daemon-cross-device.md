---
'@pyreon/native-compiler': patch
---

The Kotlin validation daemon now starts when its build cache is on a different filesystem from the temp directory. Its server and stubs jars are built under `os.tmpdir()` and moved into the cache, and a plain rename cannot cross devices (`EXDEV`). On a cold CI cache that disabled the daemon with "server did not compile: EXDEV", which pushed every check back to one `kotlinc` process each. The jar is now copied into the cache directory and renamed there, which is still atomic.
