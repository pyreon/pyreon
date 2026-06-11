---
'@pyreon/lint': patch
---

`pyreon/no-dom-in-setup` now recognizes the canonical `@pyreon/reactivity` SSR primitive as a head guard: `if (isServer) return|throw` and `if (!isClient) return|throw` (by name, the same convention `no-window-in-ssr` / `dev-guard-warnings` use). This keeps the rule consistent with `pyreon/prefer-isserver` — that rule pushes `typeof document === 'undefined'` guards TO `isServer`, so without this the two rules contradicted (prefer-isserver said "use isServer", then no-dom-in-setup flagged the now-"unguarded" DOM access in the same function).
