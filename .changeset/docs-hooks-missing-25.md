---
"@pyreon/hooks": patch
"@pyreon/mcp": patch
---

docs(hooks): document the 25 hooks missing from the manifest api[] (20 → 45 — every
public export is now documented). Each entry has a source-verified signature +
summary + real foot-guns, read from the hook bodies: the reactive accessors
(useMediaQuery / useColorScheme / useSizeClass / useReducedMotion / useOnline /
useIntersection / usePrevious / useWindowResize / useToggle / useHover / useFocus)
that must be CALLED and seed a pre-mount default (SSR first-render caveat); the
theme-derived hooks (useRootSize / useSpacing / useThemeValue) that capture a
NON-reactive snapshot; the callback hooks (useDebouncedCallback /
useThrottledCallback / useInterval / useTimeout) that capture the callback ONCE
despite "always latest" JSDoc; useScrollLock's module-level refcount; useToggle's
object (not tuple) shape; and the imperative native hooks (useHaptics / useShare /
useLinking / useNotifications) that no-op off-target. Does NOT change the hook COUNT
(these exports already existed) — check-doc-claims 36 unaffected. Regenerates the
MCP api-reference hooks region + snapshot (count 20 → 45). Docs/manifest only.
