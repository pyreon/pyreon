---
'@pyreon/kinetic': patch
---

fix(kinetic): `<Transition>`'s SSR hidden-style picker falls back to `enterStyle` for the preset path

**Gap completion for PR #717.** When PR #717 shipped the `wasInitiallyShown` branch on `Transition.tsx`, the hidden-style picker was `props.leaveToStyle` alone. Reading `@pyreon/kinetic-presets`' factories during PR #719 revealed every shipped preset (`fadeUp`, `blurInUp`, `slideLeft`, `fadeScale`, …) populates **`enterStyle` as the hidden state** but may not set `leaveToStyle` directly. Consequence for the direct-`<Transition>` import path on the preset shape:

```tsx
<Transition
  show={() => false}
  enter="transition-all duration-300"
  enterStyle={{ opacity: 0, transform: 'translateY(16px)' }}   // ← preset hidden state
  enterToStyle={{ opacity: 1, transform: 'translateY(0)' }}
>
  ...
</Transition>
```

Pre-fix: `hiddenStyle = props.leaveToStyle` is `undefined` → SSR renders the element with **no inline hidden style** → the element appears VISIBLE in the prerendered HTML → flash-on-hydration (visible → JS applies enterStyle → opacity:0 → enter animation → visible).

PR #719 already fixed this for the `kinetic(tag).<mode>` factory paths (TransitionRenderer / TransitionItem / CollapseRenderer). This commit aligns the direct `<Transition>` import path to match.

**The fix.** One-line picker change in `Transition.tsx`:

```diff
-  const hiddenStyle = props.leaveToStyle
+  const hiddenStyle = props.leaveToStyle ?? props.enterStyle
```

Mirrors the existing `hiddenClass = props.leaveTo ?? props.enterFrom` class picker — both halves now follow the same "prefer leave-end state, fall back to pre-enter state" convention.

**Coverage.** New SSR spec `falls back to enterStyle as hidden style when leaveToStyle undefined (preset path)` added to `Transition.ssr.test.tsx`. **Bisect-verified**: reverting the `?? props.enterStyle` fallback fails ONLY this spec with `expected '<section>preset-shaped hidden state</…' to contain 'opacity: 0'` (element renders but with no hidden style — exact flash-on-hydration bug shape); the 7 existing #717 specs keep passing. Restored → 8/8 passing (full kinetic suite: 13 files / 214 tests + 14 browser specs + typecheck clean).
