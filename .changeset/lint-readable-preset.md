---
'@pyreon/lint': minor
'@pyreon/create-zero': patch
'@pyreon/create-multiplatform': patch
'@pyreon/mcp': patch
---

`@pyreon/lint` gets a `readable` preset: rules about how code reads, with the spacing fixed for you.

Turn it on with one line in `.pyreonlintrc.json`:

```json
{ "preset": ["recommended", "readable"] }
```

`preset` now takes a list, composed left to right. `readable` and `readable-strict` are layers: they set only their own rules, so `["strict", "readable"]` keeps strict's errors and adds readability warnings. They turn on six new opt-in rules in a new `style` category and group:

- `pyreon/padding-between-declarations` (auto-fixable): a blank line between adjacent top-level statements or class members when either spans lines.
- `pyreon/padding-before-return` (auto-fixable): a blank line before a `return` that follows a multi-line statement or three or more statements.
- `pyreon/padding-between-component-sections` (auto-fixable): a component reads setup → behaviour → render, with a blank line between sections. Handlers and effects share one section, because `effect()` runs when it is created.
- `pyreon/padding-around-multiline-blocks` (auto-fixable, `readable-strict`): a blank line around multi-line `if` / `for` / `try` / `switch` blocks inside a function.
- `pyreon/max-jsx-depth`: a component's JSX nests at most 6 deep (5 in strict), and the message names the subtree to extract.
- `pyreon/no-nested-ternary-branch`: no ternary inside another ternary's branch; flat chains are fine up to 4 outcomes (3 in strict).

The fixes only insert blank lines between statements, which oxfmt keeps, so `--fix` and the formatter never fight. Two matching presets ship for the other tools: `@pyreon/lint/oxlint/readable.json` (function length, complexity, depth, parameters and file length, for `.oxlintrc.json` to extend) and `@pyreon/lint/oxfmt` (formatting with sorted imports, for `oxfmt.config.ts`).

Also in `@pyreon/lint`:

- The language server offers code actions: a quick fix for every auto-fixable finding, and `source.fixAll.pyreon` for `editor.codeActionsOnSave`. It now lints each file with the project's own `.pyreonlintrc.json` (it used a fixed `recommended` before), and diagnostic ranges are exact (they started one character early).
- `pyreon-lint` without `--preset` now uses the config file's preset. It used to apply `recommended` and ignore the file's choice. `--preset` takes a comma list.
- `--watch` now reads `.pyreonlintrc.json`.
- Suppression comments accept a reason: `// pyreon-lint-disable-next-line <rule> -- <why>`. A whole file opts out with `// pyreon-lint-disable-file <rule> -- <why>`. The reason is required there, and a directive without one is ignored and reported.
- The VS Code extension starts the `pyreon-lint` bin; it used to start a module that exits immediately.

New `create-zero` projects with lint on, and every new `create-multiplatform` project, ship the readable setup: the preset plus block padding, `.oxlintrc.json`, `oxfmt.config.ts`, the `oxlint` and `oxfmt` dev dependencies, and `lint` / `format` / `fix` scripts.
