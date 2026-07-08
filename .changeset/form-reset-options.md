---
"@pyreon/form": minor
---

Reset ergonomics (react-hook-form parity): `reset(values?, options?)` now accepts new `values` to reset TO (the named fields become the new baseline; the rest revert to their original initial — the idiomatic "reset to freshly-saved server data" flow), plus `options` to preserve state across the reset — `keepErrors` / `keepTouched` / `keepDirty` / `keepSubmitCount`. `resetField(field, options?)` gains `keepError` / `keepTouched`.
