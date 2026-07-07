---
"@pyreon/styler": patch
"@pyreon/form": patch
---

Two migration-surfaced fixes:

- **@pyreon/styler**: `insertGlobal` now unwraps a single outer `@layer name{…}` block when `@layer` is unsupported (happy-dom, older engines), so global rules (e.g. a CSS reset) still land in the DOM via source order instead of being silently dropped with a per-insert DOMException warning. The scoped `insert()` path already gated `@layer` on `supportsLayer`; `insertGlobal` was the one path that didn't.
- **@pyreon/form**: the "field not found" errors (`useField`, `setFieldValue`, `setFieldError`) now tell you the fix — declare the field in `useForm({ initialValues })` — and state that `@pyreon/form` does not auto-register fields on first use (unlike react-hook-form). Turns a "component threw during setup → blank UI" mystery into a self-explaining error.
