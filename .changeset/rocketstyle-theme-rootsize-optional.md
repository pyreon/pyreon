---
'@pyreon/rocketstyle': patch
---

`rocketstyle` Provider Theme — `rootSize` is no longer required at the type level.

The deprecated public `Provider` exported from `@pyreon/rocketstyle` had `rootSize: number` (required) in its `Theme` type. Passing a minimal theme without `rootSize` was a TypeScript error even though the runtime tolerates it gracefully: `enrichTheme` defaults `rootSize` to `16`, `makeItResponsive` short-circuits to plain CSS when breakpoints are empty, and the `value()` unit converter defaults `rootSize` to `16` internally.

The type now matches every other theme contract in the UI system (`@pyreon/unistyle` `PyreonTheme`, `@pyreon/ui-core` Provider, `@pyreon/unistyle` `makeItResponsive`): both `rootSize` and `breakpoints` optional. Apps that don't need responsive design just omit `breakpoints`; apps that want a custom root font size pass `rootSize`; apps that want neither pass neither.

```ts
// All of these now type-check (previously the first three failed):
<Provider theme={{ colors: { primary: '#228be6' } }}>           {/* minimal */}
<Provider theme={{ breakpoints: { xs: 0, sm: 576 }, colors }}>  {/* responsive only */}
<Provider theme={{ rootSize: 16, colors }}>                     {/* rem only */}
<Provider theme={{ rootSize: 16, breakpoints: {…}, colors }}>   {/* full (pre-existing) */}
```

Backward-compat: every existing theme that passed `rootSize` still type-checks. Non-breaking.

Bisect-verified: reverting `rootSize?: number` → `rootSize: number` produces `TS2322: Property 'rootSize' is missing in type '{ colors: ... }' but required in type 'Theme'` on the two regression specs (`packages/ui-system/rocketstyle/src/__tests__/minimal-theme.test.ts`). Restored → 5/5 specs pass + 295/295 rocketstyle tests pass.
