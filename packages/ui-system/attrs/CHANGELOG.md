# @pyreon/attrs

## 0.16.0

### Patch Changes

- [#565](https://github.com/pyreon/pyreon/pull/565) [`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Multi-overload-aware `ExtractProps<T>`. Pattern-matches up to 4 call signatures and returns the UNION of their first-argument types instead of capturing only the LAST overload (TS's overload-resolution-against-conditional-types default). Multi-overload primitives like `Iterator` / `List` / `Element` ship 3 overloads where the LAST one is the loosest (`ChildrenProps`); pre-fix `ExtractProps<Iterator>` returned just `ChildrenProps` and lost `SimpleProps<T>` + `ObjectProps<T>` — wrapping Iterator through `rocketstyle()` / `attrs()` silently downgraded the public prop surface to the loose children-only form.

  Single-overload functions still work — TS fills missing slots by repeating the last overload, so the union of 4 copies of the same shape dedupes back to one.

  Kept in sync across the 4 copies in `@pyreon/core`, `@pyreon/elements`, `@pyreon/attrs`, `@pyreon/rocketstyle`. Pairs with the upcoming Iterator/List `LooseProps` fallback overload (separate PR), which gives the now-wider union a binding home at the JSX site.

  Mirrors vitus-labs PR [#222](https://github.com/pyreon/pyreon/issues/222).

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/ui-core@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/ui-core@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/ui-core@0.13.0
  - @pyreon/core@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/ui-core@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/ui-core@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/ui-core@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/ui-core@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/ui-core@0.12.11

## 0.1.2

### Patch Changes

- Fix generic type defaults in attrs and rocketstyle — use empty objects instead of Record<string, unknown> to preserve component prop types through SpreadTwo merges

- Updated dependencies []:
  - @pyreon/ui-core@0.1.2

## 0.1.1

### Patch Changes

- [#25](https://github.com/pyreon/ui-system/pull/25) [`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Replace workspace:^ peer dependencies with explicit version ranges to prevent unresolved workspace references in published packages

- Updated dependencies [[`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756)]:
  - @pyreon/ui-core@0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

- Updated dependencies []:
  - @pyreon/ui-core@0.0.3

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages

- Updated dependencies [[`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef)]:
  - @pyreon/ui-core@0.0.2
