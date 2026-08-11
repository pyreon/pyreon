# R8 rules for the TEST APK only (testProguardFiles — never reaches the
# shipping release APK's config). androidx.test references error-prone's
# COMPILE-ONLY annotations (@CanIgnoreReturnValue/@MustBeClosed), which are
# absent at runtime by design; R8 treats the missing classes as errors when
# minifying the androidTest APK under testBuildType=release. dontwarn-ing
# annotation-only classes is the correct fix (R8's own missing_rules.txt
# suggests exactly these), NOT a masked minification failure — nothing
# dereferences an annotation class at runtime.
-dontwarn com.google.errorprone.annotations.CanIgnoreReturnValue
-dontwarn com.google.errorprone.annotations.MustBeClosed
