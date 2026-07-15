---
"@pyreon/store": patch
---

Make `patch()` exception-safe. The with-subscriber fast path (#2286) detaches each field's change-detector across its write; a throwing getter on the patch object, a throwing `sig.set`, or a raw subscriber that throws during the batch drain could leave a detector deleted (silently un-notifying later direct writes) or wedge `patchInProgress` (buffering + dropping later notifications). Reads that can throw are now hoisted before the suspend, the per-key write resumes the detector in `finally`, and the flag reset + event emit run in a `finally` around the drain (both the value and functional forms). Zero hot-path cost — the patch-with-subscriber bench holds within noise of the #2286 win.
