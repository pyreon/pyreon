---
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
'@pyreon/runtime-server': patch
---

fix: `<select value>` binding applied after option children exist, as a property (PZ-09)

`HTMLSelectElement` has no `value` content attribute and its `.value` property setter selects a matching `<option>` — so the value must be applied AFTER the options exist. Four broken cells fixed:

- **compiler** (both backends, byte-identical): static `value="b"` is never baked into the `_tpl` HTML (dead attribute the parser ignores) — a one-time `el.value = …` property set is emitted instead; and EVERY select-value bind line (static set and reactive `_bindDirect`) is deferred past the element's children lines, so the eager initial update sees `_mountSlot`-mounted dynamic options. Omit-semantic shapes (`undefined`/`null`/`false`) still emit nothing.
- **runtime-dom**: `mountElement` and `hydrateElement` exclude `value` from the pre-children `applyProps` pass for `<select>` and apply it post-children via the new `applySelectValueProp` (descriptor-aware — reactive accessors get their initial run post-children too). Fixes both static and reactive initials on the `h()` path, and hydration across child-mismatch re-mounts.
- **runtime-server**: SSR no longer serializes the dead `value` attribute on `<select>` — the matching `<option>` is marked `selected` instead (String()-coerced first-match; option value falls back to its text per HTML semantics; options with their own `selected` prop stay author-controlled). String and streaming renderers agree; the select frame flows via `AsyncLocalStorage` so concurrent renders/streams can't cross-contaminate.

Known gaps (documented): spread `value` (`<select {...props}>`) on the compiled template path still applies before dynamic options; array values on `multiple` selects are unsupported on both client and server (String()-coerced, matching the DOM property setter).
