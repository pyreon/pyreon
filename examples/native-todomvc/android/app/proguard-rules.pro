# App-specific R8/ProGuard keep rules for the release lane.
#
# Deliberately EMPTY of framework rules: the only reflection-sensitive
# dependency is kotlinx-serialization (the @Serializable Todo the emit
# produces), which ships its OWN auto-applied R8 rules
# (META-INF/com.android.tools/r8/kotlinx-serialization-r8.pro) — the
# release-mode instrumented run (`gradle -PpyreonReleaseTests
# connectedCheck`) is what verifies those rules actually hold against
# the compiled runtime srcDirs, so DO NOT add blanket -keep rules here
# to make a red run green: a keep rule that papers over a minification
# failure hides the exact class this lane exists to catch.
#
# Add keep rules only for YOUR app's own reflection / serialization.
