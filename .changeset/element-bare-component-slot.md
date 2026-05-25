---
'@pyreon/elements': patch
---

`Element` slot resolution now recognises bare-function components (user-authored, no framework marker) via naming convention — fixes `[Pyreon] onMount() called outside component setup` warnings for components passed via the `beforeContent={Header}` / `afterContent={Header}` / `content={Header}` shorthand when the component body uses lifecycle hooks.

## The bug

PR #839 (0.24.3) introduced `resolveSlot` with marker-based discrimination — `IS_ROCKETSTYLE` / `PYREON__COMPONENT` / `pkgName`. Bare user components without any marker (the common React-migration shape `const Header = () => <div/>; Header.displayName = 'MyHeader'`) hit the fallback "reactive accessor" path: called bare via `value()` without establishing a `runWithHooks` setup window. Any hook inside the body (`useWindowResize`, `onMount`, `provide`, etc.) fired the warning because `_current` was null at call time.

The warning was dev-mode-SSR only — CSR's mount pipeline + SSG production builds correctly establish setup windows via the standard component-mounting path, so functional behavior was unaffected. But dev consoles got actionable noise pointing at the user's correct-looking call site instead of the framework's missing setup-window wrap.

## The fix

`isPyreonComponent` gained a **Tier 2 naming-convention check** that runs after the existing marker checks:

- **`displayName` is set** → component (explicit author intent)
- **`.name` starts with an uppercase A–Z letter** → component (matches JSX's own component-vs-host discriminator)
- Anonymous arrows (`name === ''`), `export default` shortcuts (`name === 'default'`), camelCase helpers (`getContent`, `renderHeader`) — all fall through to the bare-call accessor path so existing reactive-accessor patterns work unchanged.

Components matching Tier 2 now route through `h(value, null)` and mount via the standard `runWithHooks`-based path. Hooks inside the body register correctly, warnings never fire.

## Why this is safe for reactive-accessor users

The naming convention is the same rule JSX itself uses to differentiate component vs host element (`<MyComp/>` is a component; `<mycomp/>` is a host tag). A PascalCase function paired with `beforeContent={Fn}` shorthand is canonically a component reference — every framework example in the docs follows this. Anonymous arrows `() => signal() ? <A/> : <B/>` are canonically reactive accessors, and they're untouched by Tier 2.

The escape hatch for users who insist on PascalCase-named reactive accessors: pass them as an anonymous wrapper — `beforeContent={() => MyAccessor()}` — or rename to camelCase.

## Test coverage

- **11 unit tests** in `isPyreonComponent.test.ts`: Tier 1 markers (4 specs), Tier 2 displayName/PascalCase (5 specs), accessor fall-through guards (6 specs covering anonymous, camelCase, `default`, empty-name, digit-prefixed, unicode-letter-prefixed), Tier 1 + Tier 2 coexistence (2 specs)
- **5 behavioral regression tests** in `slot-bare-component-with-hooks.test.tsx` matching the bokisch.com bug shape: PascalCase bare component routes via `h()`, `displayName`-only routes via `h()`, bare component using `onMount` produces NO "outside component setup" warning, anonymous accessor still takes bare-call path, camelCase helper still takes bare-call path
- **Bisect-verified-with-restore**: reverting Tier 2 → 8 tests fail (5 unit + 3 behavioral); restored → all 496 elements tests pass

## Reference

Reported via consumer (bokisch.com `migrate-to-pyreon` branch, `@pyreon/elements@0.25.0`). The final residue after the 0.24.4 (cross-package shared instance) + 0.25.0 (canonical-lib entry collapse) fixes that closed the broader dev-404 warning storm.
