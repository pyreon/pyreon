---
'@pyreon/toast': patch
'@pyreon/compiler': patch
'@pyreon/lint': patch
---

Dependency refresh + Toaster lint annotation

- **`@pyreon/toast`**: annotated the Toaster's `aria-live` region with a rule
  suppression + rationale for oxlint 1.70's new
  `jsx-a11y/no-noninteractive-element-interactions` rule. The labeled live
  region is the accessibility mechanism (toasts are announced + dismissable);
  pause-on-hover is an intentional mouse-only enhancement on top of it, not a
  clickable control. No behavior change.
- **`@pyreon/compiler` / `@pyreon/lint`**: bump the `oxc-parser` (+ `oxc-transform`)
  runtime dependency range to `^0.137.0` (was `^0.133.0`). No API change in the
  affected surface — the full compiler (1603) + lint (993) test suites pass.

Dev-tooling was also refreshed to latest in-range (vitest 4.1.9, playwright
1.61, esbuild 0.28.1, oxlint 1.70, oxfmt 0.55, happy-dom, etc.) — not
consumer-affecting.
