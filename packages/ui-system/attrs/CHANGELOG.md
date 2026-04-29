# @pyreon/attrs

## 1.0.0

### Patch Changes

- [#336](https://github.com/pyreon/pyreon/pull/336) [`b8819ac`](https://github.com/pyreon/pyreon/commit/b8819ace413b377739e9208d19a72afbc0eea0c4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix dev-mode warnings being silently dropped in production browser bundles. Six files across three packages used `process.env.NODE_ENV !== 'production'` as a dev gate, which is dead code in real Vite browser bundles (Vite does not polyfill `process`). The most user-visible consequence: `@pyreon/styler` swallowed every `insertRule` failure with no console output — malformed CSS produced an empty `<style>` tag, classes assigned to elements, and zero diagnostic. Replaced with `import.meta.env?.DEV === true` via a local `__DEV__` const. The styler also gains a tree-shake regression test (`dev-gate-treeshake.test.ts`) that mirrors `runtime-dom`'s, bundling `sheet.ts` through Vite production and asserting the warn strings are eliminated.

- Updated dependencies [[`b8819ac`](https://github.com/pyreon/pyreon/commit/b8819ace413b377739e9208d19a72afbc0eea0c4)]:
  - @pyreon/core@1.0.0
  - @pyreon/ui-core@1.0.0

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
