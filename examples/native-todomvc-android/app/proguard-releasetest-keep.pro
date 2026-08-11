# Applied ONLY when -PpyreonReleaseTests is set (see build.gradle.kts) —
# the SHIPPING release config never includes this file.
#
# Why: instrumentation shares the app's process, and AGP dedups every
# library both APKs use OUT of the test APK — the test frameworks then
# resolve the Kotlin stdlib, kotlinx-coroutines, androidx.tracing and
# compose hooks from the APP's copy, linking BY ORIGINAL NAME (observed
# one class at a time before the shape was recognized: tracing.Trace →
# kotlin.LazyKt → kotlinx.coroutines.JobKt → compose
# InfiniteAnimationPolicy → ContinuationInterceptor.DefaultImpls'
# static, which even -dontshrink -dontoptimize could not fix because
# the app's copy is RENAMED while the test APK calls the original).
#
# So the TESTED build (a) keeps shared-library classes present
# (-dontshrink) and (b) preserves NAMES for exactly the surfaces the
# test APK links against (-keepnames). Everything else — the app's own
# code and the com.pyreon.* runtime — remains fully OBFUSCATED, which
# is the half of R8 that exercises Pyreon's claim. Behavior under full
# shrink+rename of these libs is scripts/release-smoke.sh's claim
# against the untouched artifact.
-dontshrink
-keepnames class kotlin.** { *; }
-keepnames class kotlinx.coroutines.** { *; }
-keepnames class androidx.compose.** { *; }
-keepnames class androidx.tracing.** { *; }
