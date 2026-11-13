# Pyreon Lint — VS Code Extension

Real-time Pyreon-specific diagnostics in VS Code.

## Install

### From source (development)

```bash
# From the monorepo root
cd packages/tools/lint/vscode
npm install   # the extension's one dependency, vscode-languageclient
ln -s "$(pwd)" ~/.vscode/extensions/pyreon-lint
```

Without `npm install` the extension cannot load its language client and does
nothing.

Reload VS Code. The extension activates on any `.ts`, `.tsx`, `.js`, `.jsx` file.

### Prerequisites

The extension requires `@pyreon/lint` to be installed in your project:

```bash
bun add -d @pyreon/lint
```

## Configuration

| Setting | Default | Description |
|---|---|---|
| `pyreonLint.enable` | `true` | Enable/disable diagnostics |
| `pyreonLint.preset` | `"recommended"` | Lint preset (recommended, strict, app, lib, best-practices) |

## How it works

The extension starts `pyreon-lint --lsp` as a child process, communicating via
stdin/stdout JSON-RPC (Language Server Protocol). Diagnostics appear inline as
you type (150ms debounce).

## Fix on save

The server offers a quick fix for every auto-fixable finding and a
`source.fixAll.pyreon` action that applies them all. To run it on save, add to
`.vscode/settings.json`:

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.pyreon": "explicit"
  }
}
```

With the `readable` preset (`"preset": ["recommended", "readable"]` in
`.pyreonlintrc.json`) this inserts the blank lines between declarations,
before a `return` and between component sections as you save. Pair it with
oxfmt as the formatter (`"editor.formatOnSave": true`); the two never fight,
because the lint fixes only add blank lines between statements, which the
formatter keeps.

The server reads the nearest `.pyreonlintrc.json` for each file, and picks up
edits to it without a restart.

## 140 rules

140 rules across 26 categories, the same set the `pyreon-lint` CLI runs. The
full list, with what each rule catches, is on the
[lint docs page](https://pyreon.dev/docs/lint).
