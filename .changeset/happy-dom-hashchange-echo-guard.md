---
"@pyreon/a11y": patch
"@pyreon/router": patch
"@pyreon/testing": patch
---

Test-infrastructure only — no runtime or consumer-facing behavior change. The happy-dom spec-parity `hashchange`-echo guard (happy-dom fires a deferred synthetic `hashchange` for hash-changing `history.pushState`/`replaceState`; real browsers never do) was extracted from `@pyreon/router`'s test setup into the shared internal `@pyreon/test-utils` and installed in every suite that drives a real router in happy-dom: router (unchanged behavior), a11y (fixes a load-dependent CI flake where a stale echo made the route announcer fire for a traversal the test never made, plus a deterministic regression spec), and testing's own suite (internal devDep on the private `@pyreon/test-utils`; the shipped `/vitest` setup module is unchanged).
