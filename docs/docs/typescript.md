---
title: "@pyreon/typescript"
description: Shared TypeScript configuration presets for Pyreon applications and libraries.
---

`@pyreon/typescript` provides shared TypeScript configuration presets for Pyreon projects. It includes three presets covering the common project types: a base configuration, an application configuration, and a library configuration.

<PackageBadge name="@pyreon/typescript" href="/docs/typescript" />

## Installation

::: code-group
```bash [npm]
npm install @pyreon/typescript
```
```bash [bun]
bun add @pyreon/typescript
```
```bash [pnpm]
pnpm add @pyreon/typescript
```
```bash [yarn]
yarn add @pyreon/typescript
```
:::

---

## Presets

### Base (`@pyreon/typescript/base`)

The foundation configuration that all other presets extend. Includes strict TypeScript settings and Pyreon-specific JSX configuration.

```json title="tsconfig.json"
{
  "extends": "@pyreon/typescript/base"
}
```

**Key settings:**

| Setting | Value | Purpose |
|---------|-------|---------|
| `jsx` | `"react-jsx"` | Automatic JSX transform (no manual `h` imports needed) |
| `jsxImportSource` | `"@pyreon/core"` | JSX factory from `@pyreon/core/jsx-runtime` |
| `strict` | `true` | Full strict mode |
| `exactOptionalPropertyTypes` | `true` | Optional properties require explicit `\| undefined` when assigned from functions |
| `moduleResolution` | `"bundler"` | Bundler-compatible module resolution |
| `module` | `"ESNext"` | ES modules |
| `target` | `"ESNext"` | Latest JavaScript features |
| `customConditions` | `["bun"]` | Workspace resolution via `"bun"` export condition |
| `skipLibCheck` | `true` | Skip type checking of `.d.ts` files for faster builds |

### App (`@pyreon/typescript/app`)

For application projects (SPAs, SSR apps, examples). Extends the base preset and adds `noEmit: true` since applications are bundled by Vite, not compiled directly by `tsc`.

```json title="tsconfig.json"
{
  "extends": "@pyreon/typescript/app"
}
```

**Additional settings over base:**

| Setting | Value | Purpose |
|---------|-------|---------|
| `noEmit` | `true` | No output files -- Vite handles bundling |

This is the recommended preset for Pyreon applications and examples. Since `noEmit` is enabled, you can include non-source files like `vite.config.ts` without needing a separate `rootDir` configuration.

### Lib (`@pyreon/typescript/lib`)

For library packages that need to emit declaration files. Extends the base preset and enables declaration output.

```json title="tsconfig.json"
{
  "extends": "@pyreon/typescript/lib"
}
```

**Additional settings over base:**

| Setting | Value | Purpose |
|---------|-------|---------|
| `declaration` | `true` | Emit `.d.ts` declaration files |
| `declarationMap` | `true` | Emit declaration source maps for go-to-definition |

---

## Usage

### Application Project

For a Pyreon SPA or SSR application:

```json title="tsconfig.json"
{
  "extends": "@pyreon/typescript/app",
  "include": ["src"],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "~/*": ["./src/*"]
    }
  }
}
```

### Library Package

For a reusable Pyreon library:

```json title="tsconfig.json"
{
  "extends": "@pyreon/typescript/lib",
  "include": ["src"],
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

### Monorepo Root

For a monorepo root `tsconfig.json` that references workspace packages:

```json title="tsconfig.json"
{
  "extends": "@pyreon/typescript/base",
  "compilerOptions": {
    "customConditions": ["bun"]
  },
  "references": [
    { "path": "packages/my-app" },
    { "path": "packages/my-lib" }
  ]
}
```

---

## JSX Configuration

All three presets configure JSX automatically:

- `jsx: "react-jsx"` -- uses the automatic JSX transform, so you do not need to import `h` or `jsx` manually in every file.
- `jsxImportSource: "@pyreon/core"` -- JSX factory functions are imported from `@pyreon/core/jsx-runtime`.

When using the `@pyreon/vite-plugin`, the Vite plugin also configures esbuild with these same settings. The TypeScript preset ensures that `tsc --noEmit` (typecheck) and your IDE both understand the JSX configuration.

---

## exactOptionalPropertyTypes

The base preset enables `exactOptionalPropertyTypes`. This means optional properties must be explicitly typed with `| undefined` when assigned from expressions that may return `undefined`:

```ts
interface Config {
  name?: string
}

function getConfig(): Config {
  const value = maybeGetName() // returns string | undefined
  return {
    name: value, // OK -- value is string | undefined, name is optional
  }
}
```

This catches bugs where `undefined` is accidentally assigned to a property that accepts `string` but not `undefined`.

---

## TypeScript 6 Support

`@pyreon/typescript` is compatible with TypeScript 6. The preset settings use stable compiler options that work across TypeScript 5.x and 6.x.

---

## Exports Summary

| Export | Description |
|--------|-------------|
| `@pyreon/typescript/base` | Base TypeScript configuration with strict mode and JSX settings |
| `@pyreon/typescript/app` | Application preset (extends base, adds `noEmit: true`) |
| `@pyreon/typescript/lib` | Library preset (extends base, adds declaration output) |
