---
'@pyreon/router': patch
'@pyreon/runtime-dom': patch
'@pyreon/head': patch
---

Apply `defineCrossModuleState` to module-level state in `@pyreon/router`, `@pyreon/runtime-dom`, and `@pyreon/head` so duplicate-instance scenarios share the SAME state. Closes the bug class for: router's active-router lookup + `beforeunload` refcount + default chrome layout, runtime-dom's element/SVG/MathML depth + custom sanitizer + style-keys tracker + template cache + delegation tracker + keyed/for anchors + devtools state (components, listeners, overlay, installed) + hydration mismatch handlers, and head's managed-elements tracker.

Byte-identical behavior; 521 router + 681 runtime-dom + 115 head tests pass unchanged.
