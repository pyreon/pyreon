# Pyreon Lint — VS Code Extension

Real-time Pyreon-specific diagnostics in VS Code.

## Install

### From source (development)

```bash
# From the monorepo root
cd packages/tools/lint/vscode
ln -s "$(pwd)" ~/.vscode/extensions/pyreon-lint
```

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

## 134 rules

134 rules across 25 categories, the same set the `pyreon-lint` CLI runs. The
full list, with what each rule catches, is on the
[lint docs page](https://pyreon.dev/docs/lint).
