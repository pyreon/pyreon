---
"@pyreon/compiler": patch
---

Fix compiled reactive attributes going stale when their expression reads a signal conditionally (#3782). The template emitter combined every general reactive attribute into one `_bind`, the fixed-dependency fast path that tracks only on its first run, so `disabled={() => pending() && !failed()}` never subscribed to `failed` while `pending` was false. `_bind` is now chosen only when the dependency set is provably stable (unconditional reads of known signals/computeds, pure builtins); short-circuits (`&&`, `||`, `??`, `?:`, `?.`) with reads in the skipped arm, unknown calls, props reads and prop-derived consts take `renderEffect` (verify-mode dependency re-collection). Both compiler backends (JS and native) classify identically.
