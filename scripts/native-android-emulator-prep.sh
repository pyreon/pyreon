#!/usr/bin/env bash
# native-android-emulator-prep.sh — the first line of every Android emulator
# step in .github/workflows/native-device.yml, run after the emulator booted and
# before anything installs or tests:
#
#   bash "$GITHUB_WORKSPACE/scripts/native-android-emulator-prep.sh"
#
# It takes away two ways the google_apis emulator kills or covers a test for
# reasons that say nothing about the app. Each setting is best effort: a device
# that refuses one still runs the suite, and the logcat scanner
# (scripts/native-android-logcat-signals.ts) reports what then happens.
set -u
ADB="${ADB:-adb}"

# 1. No error dialogs.
#
# A `Pixel Launcher isn't responding` ANR dialog owns the screen under CI load
# (the launcher misses its input deadline during boot: "Input dispatching timed
# out (Application does not have a focused window)") and is NOT
# back-dismissable, so a harness that reads the screen (release-smoke.sh, the
# biometric enrolment through Settings) polls a foreign window until it gives
# up: a red job on a condition that says nothing about the app.
# `hide_error_dialogs` is Android's own switch for automated runs. It does not
# weaken the gate: an app crash is detected from logcat and from the app's
# window never appearing, neither of which depends on a dialog being drawn.
"$ADB" shell settings put global hide_error_dialogs 1 || true
# The setting stops NEW dialogs; one raised during boot, before this line, is
# still up. Error dialogs close on ACTION_CLOSE_SYSTEM_DIALOGS.
"$ADB" shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null 2>&1 || true

# 2. WebView without Google Play services' font provider.
#
# Measured in nightly run 45437790724 (and PR run 45446201600): Play services
# restarts all its processes once per emulator session, 2.5-4 minutes after boot
# (`ChimeraModuleLdr: Module config changed, forcing restart`), i.e. in the
# middle of a lane. Android then kills every process that holds a stable
# connection to a provider in the dying process:
#
#   Killing 7175:com.pyreon.PyreonTasks/u0a174 (adj 0): depends on provider
#   com.google.android.gms/.fonts.provider.FontsProvider in dying proc
#   com.google.android.gms.persistent
#
# and the running test fails as "Test instrumentation process crashed". The
# holder is WebView: Chromium's AndroidFontLookupImpl fetches Google Sans and
# Noto Color Emoji Compat from that provider in every app that shows a WebView
# (`FontLog: Received query name=Google Sans&weight=…`, only ever in the tasks
# app, the one with WebView tests) and hands the opened descriptor to the
# renderer with `detachFd()`. ContentResolver's descriptor wraps another one,
# and a wrapper's `detachFd()` detaches the inner descriptor without releasing
# the stable provider reference it holds (Android 13 ParcelFileDescriptor), so
# the app depends on the provider until that object is garbage-collected.
# Compose-only apps also fetch the emoji font, but close it, and survived the
# same restart mid-test.
#
# These two features are the only callers of that provider in WebView
# (`font_unique_name_lookup_android.cc`): `AndroidDownloadableFontsMatching`
# resolves `@font-face { src: local(…) }` through it and `PrefetchAndroidFonts`
# fetches the fonts at renderer start-up. No test page uses `local()` fonts.
# WebView reads this file on userdebug builds, which the google_apis images are
# (android_webview/docs/commandline-flags.md); the first token is ignored.
"$ADB" shell "echo '_ --disable-features=AndroidDownloadableFontsMatching,PrefetchAndroidFonts' > /data/local/tmp/webview-command-line && chmod 644 /data/local/tmp/webview-command-line" || true
echo "[emulator-prep] WebView flags: $("$ADB" shell cat /data/local/tmp/webview-command-line 2> /dev/null | tr -d '\r')"
