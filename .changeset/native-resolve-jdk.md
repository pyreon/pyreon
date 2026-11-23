---
'@pyreon/native-runtime-kotlin': patch
'@pyreon/native-router-kotlin': patch
---

The Kotlin runtime and router verify scripts find the JDK `kotlinc` runs on instead of a bare `java`. `resolveJava()` (`runtime-kotlin/scripts/java-runtime.ts`) tries `JAVACMD` / `JAVA_HOME`, `java` on PATH, then the JVM `kotlinc` itself runs on. On a Mac where `java` on PATH is the system stub, `bun install` no longer reports "smoke SKIPPED, no working JDK" for the Kotlin runtime and router packages, and the compiler's Kotlin execution specs no longer crash; the skip message, when no JDK exists at all, says how to install one.
