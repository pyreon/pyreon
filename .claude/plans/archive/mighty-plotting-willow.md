# Plan: Make Pyreon Great Again — Rocketstyle Performance Rearchitecture

## Context

bokisch.com (a simple personal site with ~150 rocketstyle components) takes 2+ GB memory and 20+ seconds to render. Clicking "Show More" (adds ~65 components) crashes the Chrome tab. The same site on React + vitus-labs rocketstyle was fast.

Root cause: the 0.12.x rocketstyle/styled layer creates a full `effect()` per component instance that does heavy synchronous CSS resolution work. This fights Pyreon's "component runs once" architecture instead of using it.

Pyreon already has the RIGHT primitives: `computed()` with equality, `renderEffect` (lightweight per-prop binding), accessor thunks. The rocketstyle layer doesn't use them.

## The Problem (quantified)

Per rocketstyle component instance on every mount:

- 1 `effect()` creation (with scope registration, deps tracking, immediate first-run)
- 2x CSS `resolve()` (initial render + effect first-run)
- 263 `processDescriptor` calls per `styles()` invocation (scans ALL properties)
- 4 pseudo-state passes (base, hover, focus, active) x breakpoints
- 30+ object spreads
- 25-50 object allocations
- 3+ closure creations
- 5 context reads

For 150 components: ~600+ effect runs, ~40K descriptor scans, ~5K object spreads = GB-scale transient allocations.

## The Fix (3 tiers)

### Tier 0: Revert PR #258 + Fix startClient (immediate, unblocks bokisch.com)

**What:** Revert the reactive ThemeContext changes from PR #258 that broke the styling pipeline. Fix the hydration false-positive in startClient.

**Files:**

- `packages/ui-system/styler/src/ThemeProvider.ts` — revert to `createContext` (not reactive)
- `packages/ui-system/styler/src/styled.tsx` — revert DynamicStyled to 0.11.5 pattern (no effect, resolve once, return VNode)
- `packages/ui-system/styler/src/index.ts` — remove `useThemeAccessor` export
- `packages/ui-system/ui-core/src/PyreonUI.tsx` — revert to static `enrichTheme()` + direct `provide(ThemeContext, enrichedTheme)`
- `packages/ui-system/unistyle/src/context.tsx` — revert to `provide(ThemeContext, enrichedTheme)`
- `packages/ui-system/rocketstyle/src/rocketstyle.ts` — revert to plain object `$rocketstyle` (compute inline like 0.11.5, NOT function accessor)
- `packages/zero/zero/src/client.ts` — fix `hasSSRContent` to ignore comment nodes, guard `router.replace()` with `hasSSRContent`

**DynamicStyled target (matches 0.11.5):**

```typescript
const DynamicStyled: ComponentFn = (rawProps) => {
  const theme = useTheme()
  const cssText = normalizeCSS(resolve(strings, values, { ...rawProps, theme }))
  const className = cssText.length > 0 ? sheet.insert(cssText, false, insertLayer) : ''
  const finalTag = rawProps.as || tag
  const isDOM = typeof finalTag === 'string'
  return h(finalTag, buildProps(rawProps, className, isDOM, customFilter), ...children)
}
```

**Rocketstyle target (matches 0.11.5):**

```typescript
// Read mode in component body — signal change triggers re-render
const mode = themeAttrs.mode
// Compute $rocketstyle as plain object
const computedRocketstyle = getTheme({ rocketstate, themes: currentModeThemes, ... })
// Pass as plain object, NOT function accessor
finalProps.$rocketstyle = computedRocketstyle
finalProps.$rocketstate = finalRocketstate
```

**How mode switching works without effects:** Mode is a signal read in EnhancedComponent body. Signal change -> EnhancedComponent re-renders -> new `computedRocketstyle` with new mode colors -> DynamicStyled runs with new props -> new CSS class. Zero effects. This is exactly how 0.11.5 worked and theme switching was fast.

### Tier 1: Optimize styles() descriptor scan (halves CPU per resolve)

**What:** The `styles()` function scans ALL 263 property descriptors on every call. A typical component uses 5-10 properties. Build a lookup index at module init; iterate only matching descriptors at runtime.

**File:** `packages/ui-system/unistyle/src/styles/styles/index.ts`

**Before:** `propertyMap.map(d => processDescriptor(d, t, ...))` — 263 iterations

**After:**

```typescript
// Built once at module init
const keyToDescriptors = new Map<string, number[]>()
for (let i = 0; i < propertyMap.length; i++) {
  // index each descriptor by its theme key(s)
}

// Per call: iterate only keys present in theme
const styles: Styles = ({ theme: t, css, rootSize }) => {
  const seen = new Set<number>()
  const fragments = []
  for (const key of Object.keys(t)) {
    const indices = keyToDescriptors.get(key)
    if (!indices) continue
    for (const idx of indices) {
      if (seen.has(idx)) continue
      seen.add(idx)
      fragments.push(processDescriptor(propertyMap[idx], t, css, calc, shorthand, borderRadiusFn))
    }
  }
  return css`${fragments}`
}
```

**Impact:** 263 -> ~10-20 iterations per call. For 150 components x 4 pseudo-states = 600 calls: 157,800 -> ~9,000 iterations.

### Tier 2: Global CSS class cache (eliminates redundant resolves)

**What:** 50 List Items with identical theme/mode/dimensions currently resolve CSS 50 times independently. The CSS text is identical every time — `sheet.insert` deduplicates at the class level, but the entire resolve+normalize pipeline runs 50 times.

**File:** `packages/ui-system/styler/src/styled.tsx`

**Approach:** Cache the CSS class name by the identity of the `$rocketstyle` + `$rocketstate` objects. If the same rocketstyle component definition is rendered with the same dimension values, return the cached class immediately.

```typescript
// Per styled component definition (not per instance)
const classCache = new Map<string, string>()

const DynamicStyled: ComponentFn = (rawProps) => {
  const theme = useTheme()
  const rs = rawProps.$rocketstyle
  const rsState = rawProps.$rocketstate

  // Fast path: hash $rocketstyle identity for cache lookup
  // (rocketstyle WeakMap caches ensure same inputs = same object refs)
  const cacheKey = rs ? `${rs.__cacheId ?? ''}|${rsState?.state ?? ''}` : ''
  let className = cacheKey ? classCache.get(cacheKey) : undefined

  if (className === undefined) {
    const cssText = normalizeCSS(resolve(strings, values, { ...rawProps, theme }))
    className = cssText.length > 0 ? sheet.insert(cssText, false, insertLayer) : ''
    if (cacheKey) classCache.set(cacheKey, className)
  }

  return h(finalTag, buildProps(rawProps, className, isDOM, customFilter), ...children)
}
```

**Impact:** 50 identical Items resolve CSS once, 49 get cache hit. For bokisch.com: ~150 resolves -> ~30-40 unique resolves.

### Tier 3: Reactive mode switching via computed class (future, NOT in this PR)

**What:** After Tier 0-2 stabilize, add OPTIONAL reactive class switching for components that need it — using `computed()` with string equality, not `effect()`.

**Approach:** Rocketstyle could wrap the class derivation in a `computed`:

```typescript
const cssClass = computed(() => {
  const rs = $rocketstyleAccessor()  // tracks mode signal
  const cssText = normalizeCSS(resolve(strings, values, { ...rawProps, $rocketstyle: rs, theme }))
  return cssText.length > 0 ? sheet.insert(cssText, false, insertLayer) : ''
}, { equals: (a, b) => a === b })

// Pass as accessor prop — renderEffect handles DOM update
h(finalTag, { ...finalProps, class: () => cssClass() })
```

This uses the framework's built-in `renderEffect` per-prop binding instead of a per-component `effect`. The `computed` memoizes by string equality — if mode change produces the same CSS class (e.g., no mode-dependent styles), no DOM update happens.

**NOT in this PR** — Tier 0-2 must work first. This is the future path for reactive theme switching without per-component effects.

## Additional Fixes (same PR as Tier 0)

- `packages/core/core/src/context.ts` — silence `popContext()` on empty stack (no-op instead of warn)
- Remove diagnostic code from `bokisch.com/src/entry-client.ts`
- Restore `bokisch.com` to clean state with all sections enabled

## Files to Modify

| File | Change |
|------|--------|
| `styler/src/ThemeProvider.ts` | Revert to createContext |
| `styler/src/styled.tsx` | Remove effect, resolve-once pattern |
| `styler/src/index.ts` | Remove useThemeAccessor export |
| `ui-core/src/PyreonUI.tsx` | Revert to static enrichTheme |
| `unistyle/src/context.tsx` | Revert to direct provide |
| `rocketstyle/src/rocketstyle.ts` | Plain object $rocketstyle, mode read in body |
| `zero/src/client.ts` | Fix hasSSRContent + guard replace() |
| `core/src/context.ts` | Silent popContext on empty stack |
| `unistyle/src/styles/styles/index.ts` | Descriptor lookup optimization (Tier 1) |
| `ui-core/src/__tests__/PyreonUI.test.tsx` | Update test for non-reactive ThemeContext |

## Verification

1. `bun run --filter='*' typecheck` — clean
2. `bun run --filter='*' test` — all pass
3. `bun run --filter='*' lint` — clean
4. Test on bokisch.com with ALL sections enabled:
   - Page loads in < 2 seconds
   - Memory < 100 MB after GC
   - "Show More" responds in < 500ms
   - Theme toggle (light/dark) works and switches instantly
   - No console errors (no popContext warnings, no hydration mismatch)
5. Bisect-verify: revert Tier 0 changes -> memory goes back to 1GB+

## What This Does NOT Do

- Does not add reactive theme context (PR #258 feature) — that needs Tier 3 which is a separate PR after stabilization
- Does not fix the Vite 8 OXC compiler bypass — that's a separate optimization (Tier 4, tracked in memory)
- Does not change the public API — `useTheme()`, `styled()`, rocketstyle chain methods all work the same
