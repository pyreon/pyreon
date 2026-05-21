---
'@pyreon/ui-core': patch
---

`PyreonUI` — `theme` is now optional + nested PyreonUI inherits theme from the parent.

Three issues fixed together (they share the same root cause — `enrichTheme(undefined)` in a `computed`):

1. **`inversed` looked broken on nested PyreonUI.** `<PyreonUI theme={appTheme}><PyreonUI inversed>...</PyreonUI></PyreonUI>` produced no visible inversion — every styled descendant rendered with an empty theme.
2. **`theme` was required by the type.** `<PyreonUI inversed>` (no `theme` prop) was a type error AND a runtime crash.
3. **Nested PyreonUI required re-passing `theme`** even though the parent had already provided one through `ThemeContext`.

**Root cause**: `enrichedTheme = computed(() => enrichTheme(props.theme))`. When `props.theme` was undefined, `enrichTheme` destructured undefined and threw `TypeError: Cannot destructure property 'breakpoints' of 'theme' as it is undefined`. The throw fired lazily (the `computed` only runs when a child reads `ThemeContext`), so the symptom was the cryptic dev-mode `[pyreon] Unhandled effect error: ...` + every styled descendant silently rendering with an empty theme.

**Fix**: when `props.theme` is omitted, `PyreonUI` reads the parent's `ThemeContext` and provides that accessor through verbatim. The parent's already-enriched theme reference is preserved (not re-enriched) so downstream identity-keyed caches (styler's class cache, rocketstyle's per-definition WeakMaps) keep hitting.

```tsx
// Now works as expected:
<PyreonUI theme={appTheme}>
  <Header />
  <PyreonUI inversed>      {/* no theme prop — inherits appTheme */}
    <DarkSidebar />        {/* renders with appTheme + dark mode */}
  </PyreonUI>
</PyreonUI>
```

**Scoping unchanged + locked in**: an inner `inversed` PyreonUI only affects DESCENDANTS — siblings and ancestors see the original mode/theme unchanged. This was already the case via Pyreon's `provide()` scoping (each frame lives only inside the providing component's subtree); two new tests assert the invariant so a future regression surfaces immediately.

Bisect-verified: reverting the inheritance branch in `enrichedTheme` fails 2 specs in `PyreonUI-inheritance.test.tsx` (`ISSUE 2 FIXED` + `ISSUE 3 FIXED` — the `ThemeContext` getter throws on read, the inner doesn't inherit the parent's enriched theme reference); restored → 5/5 pass + all 187 ui-core tests pass + all downstream rocketstyle/styler/elements/unistyle/attrs tests pass.

Type change: `theme: PyreonTheme` → `theme?: PyreonTheme | undefined`. **Non-breaking** — every existing caller that passed `theme` continues to type-check; new callers can now omit it.
