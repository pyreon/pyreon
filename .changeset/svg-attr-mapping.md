---
'@pyreon/runtime-server': minor
---

SVG attribute mapping + expanded HTML attr coverage in SSR.

**The bug class:** PR #1357 added `HTML_ATTRIBUTE_MAP` to fix React-camelCase attrs the SSR kebab default broke (`fetchPriority → fetch-priority` was browser-ignored). The audit for other framework components surfaced TWO remaining gaps:

1. **SVG attributes** — user-written JSX `<svg viewBox=...>` kebabs to `view-box` (browser-ignored). `<path strokeWidth=2>` kebabs to `stroke-width` which actually happens to match SVG's CSS-property convention, but the framework's behavior was "accidentally correct" not "knows what SVG needs." `theme.tsx` + `favicon.ts` authors wrote `stroke-width` directly in JSX as a workaround — the framework now handles either source spelling.
2. **Additional HTML attrs** — `useMap`, `frameBorder`, `marginHeight`/`marginWidth`, `allowFullScreen`, `mediaGroup`, `controlsList`, `disablePictureInPicture`, `disableRemotePlayback`, `radioGroup`, `srcLang`, `popoverTarget` / `popoverTargetAction`, `noValidate`, `allowTransparency` — 15 standard React-camelCase HTML attrs that pre-fix kebabed wrong (`<form noValidate>` → `<form no-validate>`, browser-ignored).

**Fix:**

- **`HTML_ATTRIBUTE_MAP` extended** with the 15 missing standard HTML attrs.
- **`SVG_ATTRIBUTE_MAP` added** with ~90 SVG attrs split into two classes per the SVG spec:
  - **Canonical camelCase preserved** (51 entries): `viewBox`, `preserveAspectRatio`, `gradientUnits`, `gradientTransform`, `patternUnits`, `attributeName`, `keySplines`, `numOctaves`, `pathLength`, `stdDeviation`, etc. SVG is case-sensitive; the kebab default emits `view-box` which browsers silently ignore.
  - **CSS-property style kebab** (33 entries): `strokeWidth → stroke-width`, `strokeLinecap → stroke-linecap`, `textAnchor → text-anchor`, `markerEnd → marker-end`, `clipPath → clip-path`, `floodColor → flood-color`, `stopColor → stop-color`, etc. These coincide with the kebab fallback but the explicit map documents the contract.
- **Lookup order** in `toAttrName`: HTML_ATTRIBUTE_MAP → SVG_ATTRIBUTE_MAP → kebab fallback. HTML wins when an attr is in both maps (e.g. `tabIndex` is in HTML).

**Back-compat preserved**: kebab-cased SVG attrs in user JSX (`<path stroke-width="2">`) continue to work — they pass through the fallback unchanged (no uppercase chars to replace).

**Validation:**

- ✅ **+7 regression specs** in `ssr.test.ts`:
  - 1 for the 13 new HTML attrs (positive + negative kebab assertions)
  - 5 for SVG (camelCase preservation, CSS-property kebab, gradient/pattern, single-word pass-through, back-compat kebab source)
  - 1 for marker-style kebab attrs (`markerEnd`/`clipPath`/`floodColor`)
- ✅ **Bisect-verified at 2 layers**:
  - Removing `SVG_ATTRIBUTE_MAP` → 2 SVG canonical-camelCase specs fail (`view-box`/`gradient-units`)
  - Removing the new HTML entries → 1 spec fails with the 13 broken attrs listed
- ✅ **176/176** runtime-server tests pass; **1262/1263** zero pass; **23/23** verify-modes; **11/11** validate-fast.

The SVG_ATTRIBUTE_MAP and the extended HTML_ATTRIBUTE_MAP together cover the production set of standard attributes a Pyreon user is likely to write in JSX. Exotic SVG attrs (`xChannelSelector` etc.) are included; mathematical SVG filter attrs are covered. Framework-internal author workarounds (`stroke-width` written directly in JSX) keep working unchanged.

**Why this matters now**: PR #1357 fixed `<Image priority>`'s body `<img fetchPriority="high">`. Users writing custom SVG in their own components hit the same bug class — `<svg viewBox=...>` is a far more common shape than `<img fetchPriority=...>`. Closes the audit gap proactively before any user reports the silent SVG breakage.
