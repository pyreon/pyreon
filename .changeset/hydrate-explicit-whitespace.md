---
"@pyreon/runtime-dom": patch
"@pyreon/compiler": patch
---

Hydration now adopts an explicitly rendered whitespace-only text child (`<First />{' '}<span/>`) instead of skipping the server's space and inserting a duplicate (plus a `Hydration mismatch (text): expected TextNode, got 1` warning). The whitespace decision is made by the client VNode walk — a whitespace text vnode claims the whitespace node the cursor skipped behind it — never by the DOM alone, since explicit and formatting whitespace are the same bytes. The SSR↔hydration parity fuzzers now generate whitespace-only text children. Adds a diagnose-catalog entry for the mismatch shape.
