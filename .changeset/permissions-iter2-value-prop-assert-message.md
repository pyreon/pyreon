---
'@pyreon/permissions': minor
---

API polish pass (breaking, pre-1.0 — clean over backward-compatible):

- **`PermissionsProvider` prop renamed `instance` → `value`** — fixes a real code/docs mismatch: the component took `instance`, but the generated docs / llms / MCP always documented `value` (and it's the conventional context-provider prop). Anyone following the docs (`<PermissionsProvider value={can}>`) was silently getting `undefined` → `usePermissions()` threw. The code now matches the documented, conventional name. **Breaking** for any code that passed `instance`.
- **`can.assert(key, context?, message?)`** — optional custom denial message: `can.assert('billing.export', undefined, 'Upgrade your plan to export')` throws `[Pyreon] Upgrade your plan to export` instead of the default `[Pyreon] permission denied: 'billing.export'`.
- Drive-by: the `usePermissions()` out-of-provider error now uses the enforced `[Pyreon]` prefix (was `[@pyreon/permissions]`, a baselined `no-error-without-prefix` violation) — burns the pyreon-lint advisory baseline down 283 → 282.

Tests: the provider-prop tests + the error-message assertion were updated to the new names; +1 `can.assert` custom-message test. 153 tests pass; coverage above the 98% floor.
