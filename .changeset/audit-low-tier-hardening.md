---
"@pyreon/validation": patch
"@pyreon/lint": patch
---

Release-audit low-tier hardening:

- **`@pyreon/validation`**: the Standard-Schema issue-path → dot-string flattening existed as five inline copies (`standardSchemaToValidator`, `wrapStandardSchema`, and the zod/valibot/arktype adapters) — identical by luck, not construction; every consumer (form's schema-error routing, store/state-tree parse errors) keys on that exact format, so a drifted copy would silently mis-route errors. Consolidated into ONE exported `flattenIssuePath()` (plain segments, `{key}` objects, mixed; absent/empty → `""` the whole-form key), used by all five sites and unit-locked.
- **`@pyreon/lint`** (`pyreon/no-private-env-in-client`): computed `process.env[expr]` access is now reported — it is ALWAYS dead in the browser (bundler define-replacement rewrites static reads only; `process.env` itself is undefined client-side); it was silently skipped. The specs also exposed a pre-existing misclassification: `process.env[k]` with an identifier key was treated as a STATIC `.k` read and given the wrong guidance (`ZERO_PUBLIC_k`) — `node.computed` is the real discriminator. Computed `import.meta.env[expr]` stays exempt by design (Vite injects a real env object).
