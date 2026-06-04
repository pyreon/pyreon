# @pyreon/create-multiplatform

## 0.30.0

## 0.29.0

## 0.28.1

### Patch Changes

- [#1256](https://github.com/pyreon/pyreon/pull/1256) [`08ba77f`](https://github.com/pyreon/pyreon/commit/08ba77fc6dfa65a05723a9e121bbfd002f97eb3e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `name` + target-directory validation to the scaffold CLI (D4 partial).

  `createMultiplatformProject({ name, target })` now validates that `name`
  is a non-empty, npm-compliant string (lowercase, hyphens allowed, no
  spaces / colons / scoped-package shorthand) and that `target` is a path
  that either doesn't exist OR is an empty directory. Throws a labeled
  `ValidationError` with actionable guidance instead of silently
  overwriting existing files. Closes the "scaffold clobbers existing
  projects" footgun from the 2026-06 native readiness audit.

## 0.28.0

## 0.27.1

## 0.27.0

## 0.26.3

## 0.26.2
