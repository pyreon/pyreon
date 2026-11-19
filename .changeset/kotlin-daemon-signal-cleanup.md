---
'@pyreon/native-compiler': patch
---

The Kotlin validation daemon now removes its spool directory and stops its JVM when the host process is interrupted (SIGINT, SIGTERM, SIGHUP), not only on a normal exit.
