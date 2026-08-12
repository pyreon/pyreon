---
"@pyreon/toast": patch
---

fix(toast): a toast created WHILE the container is hover/focus-paused no longer auto-dismisses under the cursor

Pause-on-hover only cleared the timers of toasts that ALREADY existed when the pointer entered. A toast arriving during an active hover/focus (a background job, a WebSocket event) armed its auto-dismiss timer unconditionally and counted down under the user's cursor — the opposite of what pause-on-hover promises. A module-level `_paused` flag (set by `_pauseAll`, cleared by `_resumeAll` and `_reset`) now makes `startTimer` hold the full duration WITHOUT arming while paused; the next `_resumeAll` (mouseleave/blur) arms it via its existing `duration > 0 && timer === undefined && remaining > 0` guard. Mirrors react-hot-toast / sonner's global paused state. Bisect-verified.
