---
'@pyreon/elements': patch
---

Add a 4th `(props: LooseProps): VNodeChild` overload to `IteratorComponent` and `ListComponent` for forwarding patterns. After the 4-overload-aware `ExtractProps` (paired PR), the wide union from rocketstyle's `(typeof Wrapper)['$$types']` had no binding home — `<Iterator {...wrapperProps} />` failed at every forwarding site with `error TS2769: No overload matches this call`. The narrow `SimpleProps<T>` / `ObjectProps<T>` / `ChildrenProps` overloads still drive per-mode T inference for shape-correct direct callers; the LooseProps fallback only fires when none of the narrow overloads match (forwarding patterns, spread props from generic wrappers, heterogeneous arrays).

Trade-off (mirrors vitus-labs PR #229): direct callers can now mix `valueName` + `children` without a type error — the strict per-mode rejection at the type level is relaxed in exchange for forwarding-pattern support. Runtime still picks the right mode based on which props are populated.
