---
"@pyreon/styler": patch
"@pyreon/form": patch
---

Fundamental completions of the migration-finding fixes:

- **@pyreon/styler**: `insertGlobal`'s `@layer`-unsupported fallback now flattens `@layer` blocks RECURSIVELY — handling MULTIPLE sibling blocks and NESTED blocks, not just a single outer block. Previously only a lone `@layer name{…}` spanning the whole string was unwrapped; sibling/nested layers still failed to insert in happy-dom.
- **@pyreon/form**: documented the STATIC-FIELD-MODEL contract in `use-form.ts` (why `useField`/`register` throw for undeclared fields instead of auto-registering — auto-registering would silently drop the field from the epoch-cached `values()`), and regression-locked the actionable "declare it in useForm({ initialValues })" guidance in the field-not-found errors.
