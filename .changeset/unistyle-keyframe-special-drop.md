---
"@pyreon/unistyle": patch
---

fix(unistyle): stop silently dropping the `animation`/`keyframe` declaration when `keyframe` is paired with any other style property

The `animation` special-key descriptor reads two trigger keys — `keyframe` and `animation` — but the fast-path index only registered the special under its `id` (`animation`). A theme that set `keyframe` (a keyframe-name-only animation) alongside any non-special property, e.g. `{ keyframe: 'spin', color: 'red' }`, resolved `color`, saw `fragments.length > 0`, skipped the fallback full-scan, and never emitted the animation — rendering `color: red;` alone. The single-key `{ keyframe: 'spin' }` shape worked only because the fallback scan caught it.

Special descriptors now carry an optional `keys` list of every additional trigger key their `processSpecial` branch reads (`animation` declares `keys: ['keyframe']`), which the index builder registers alongside `id`. This is a recurrence of the earlier "index-builder skipping a discriminated-union branch" class — the previous `d.id` fix covered specials whose trigger key equals their id, but not one that reads a second, differently-named key.
