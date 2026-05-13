---
'@pyreon/core': patch
'@pyreon/elements': patch
'@pyreon/attrs': patch
'@pyreon/rocketstyle': patch
---

Multi-overload-aware `ExtractProps<T>`. Pattern-matches up to 4 call signatures and returns the UNION of their first-argument types instead of capturing only the LAST overload (TS's overload-resolution-against-conditional-types default). Multi-overload primitives like `Iterator` / `List` / `Element` ship 3 overloads where the LAST one is the loosest (`ChildrenProps`); pre-fix `ExtractProps<Iterator>` returned just `ChildrenProps` and lost `SimpleProps<T>` + `ObjectProps<T>` — wrapping Iterator through `rocketstyle()` / `attrs()` silently downgraded the public prop surface to the loose children-only form.

Single-overload functions still work — TS fills missing slots by repeating the last overload, so the union of 4 copies of the same shape dedupes back to one.

Kept in sync across the 4 copies in `@pyreon/core`, `@pyreon/elements`, `@pyreon/attrs`, `@pyreon/rocketstyle`. Pairs with the upcoming Iterator/List `LooseProps` fallback overload (separate PR), which gives the now-wider union a binding home at the JSX site.

Mirrors vitus-labs PR #222.
