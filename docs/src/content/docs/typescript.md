---
title: '@pyreon/typescript'
description: Shared TypeScript configuration presets for Pyreon applications and libraries — base, app, lib, plus Bun-first global ambient types.
---

`@pyreon/typescript` ships ready-to-extend `tsconfig.json` presets so every Pyreon project gets the right strict settings and JSX wiring with zero `compilerOptions` ceremony. Three presets cover the common project shapes — a shared **base**, an **app** preset that adds `noEmit`, and a **lib** preset that adds declaration output — plus a Bun-first **globals** ambient-types entry point.

<PackageBadge name="@pyreon/typescript" href="/docs/typescript" />

## Installation

:::code-group

```bash [npm]
npm install -D @pyreon/typescript
```

```bash [bun]
bun add -D @pyreon/typescript
```

```bash [pnpm]
pnpm add -D @pyreon/typescript
```

```bash [yarn]
yarn add -D @pyreon/typescript
```

:::

It's a dev dependency — the presets are plain JSON config files that TypeScript reads at type-check time. The package declares a peer dependency on `typescript >= 5.9.0`.

## Quick Start

Pick the preset that matches your project type and extend it:

:::code-group

```json [App tsconfig.json]
{
  "extends": "@pyreon/typescript/app",
  "include": ["src"]
}
```

```json [Library tsconfig.json]
{
  "extends": "@pyreon/typescript/lib",
  "include": ["src"],
  "compilerOptions": {
    "outDir": "./lib",
    "rootDir": "./src"
  }
}
```

```json [Base only]
{
  "extends": "@pyreon/typescript",
  "compilerOptions": {
    "noEmit": true
  }
}
```

:::

That's it. JSX resolves to Pyreon's runtime, strict mode is on, and module resolution is bundler-shaped — no per-project flags required.

:::warning{title="Extend the bare package name for base, not `/base`"}
The base preset is published at the package root — `"extends": "@pyreon/typescript"`. There is **no `@pyreon/typescript/base` subpath**. Extending `"@pyreon/typescript/base"` will fail to resolve. The only subpaths are `/app`, `/lib`, and `/globals`.
:::

## Why presets?

Every Pyreon project needs the same handful of non-default compiler settings to work at all: the JSX import source has to point at `@pyreon/core`, module resolution has to be `Bundler` (Pyreon assumes a bundler/Bun, never raw `tsc` emit for apps), and the strict flags Pyreon's own source relies on (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) have to be on so your code type-checks against the framework's types the same way the framework does.

Copy-pasting that block into every `tsconfig.json` drifts the moment one project bumps a flag. The presets make the settings a single versioned source of truth — extend one line, get the whole contract, and inherit fixes when you upgrade the package.

## The base preset

`@pyreon/typescript` (the package root, `base.json`) is the foundation both other presets extend. It sets the complete shared compiler contract:

```json title="base.json"
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2024",
    "module": "Preserve",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,

    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/core",

    "lib": ["ES2024", "DOM", "DOM.Iterable"],

    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,

    "skipLibCheck": true,

    "sourceMap": true
  },
  "exclude": ["node_modules", "lib", "dist"]
}
```

### Every option, and why

| Setting                            | Value                          | Why it's set                                                                                                                                                            |
| ---------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`                           | `"ES2024"`                     | Pyreon runs on evergreen browsers + Bun/Node — no downleveling. Emits modern syntax (top-level `await`, `Array.prototype.findLast`, etc.).                              |
| `module`                           | `"Preserve"`                   | Leaves `import`/`export` statements untouched for a downstream bundler (Vite/esbuild/Bun) to handle. Allows CommonJS interop in an ESM file without rewriting imports.  |
| `moduleResolution`                 | `"Bundler"`                    | Resolves extensionless relative imports + `package.json` `exports` maps the way Vite/esbuild do, not the way `node16`/`nodenext` require explicit extensions.           |
| `moduleDetection`                  | `"force"`                      | Treats every file as a module (so a file with no `import`/`export` is still module-scoped, not a global script). Avoids accidental global-scope name collisions.        |
| `verbatimModuleSyntax`             | `true`                         | A type-only import must be written `import type`; a value import stays a value import. The emit is predictable and a bundler never has to guess what to elide.          |
| `resolveJsonModule`                | `true`                         | Lets you `import data from './x.json'` with the JSON typed structurally.                                                                                                |
| `jsx`                              | `"react-jsx"`                  | The automatic JSX transform — you never import `h` / `jsx` by hand in a `.tsx` file.                                                                                    |
| `jsxImportSource`                  | `"@pyreon/core"`               | The automatic transform pulls its factory from `@pyreon/core/jsx-runtime`, so `<div />` becomes a Pyreon VNode, not a React element.                                    |
| `lib`                              | `["ES2024","DOM","DOM.Iterable"]` | ES2024 standard library + the DOM types apps need. (Server-only packages can narrow this.)                                                                            |
| `strict`                           | `true`                         | The full strict family — `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, etc.                                                                              |
| `exactOptionalPropertyTypes`       | `true`                         | `{ x?: string }` does **not** silently accept `undefined`. Catches the bug class where `undefined` is assigned to a property that only declared `string`.              |
| `noUncheckedIndexedAccess`         | `true`                         | `arr[i]` is typed `T \| undefined`. Forces a guard before you dereference an array element or record value that might not exist.                                        |
| `noImplicitOverride`               | `true`                         | A subclass method that overrides a base method must say `override`. Prevents silently breaking an override when the base signature changes.                             |
| `forceConsistentCasingInFileNames` | `true`                         | `./Foo` and `./foo` are not interchangeable. Avoids a build that works on macOS (case-insensitive FS) but breaks on Linux CI.                                           |
| `skipLibCheck`                     | `true`                         | Don't re-type-check `.d.ts` files inside `node_modules` — they were already checked by their authors. Significantly faster type-checks.                                 |
| `sourceMap`                        | `true`                         | Emit `.js.map` so stack traces and the debugger point at your TypeScript source, not the compiled output.                                                               |

The base preset also sets `"exclude": ["node_modules", "lib", "dist"]` so build output directories aren't re-type-checked as input.

:::note{title="What the base preset does NOT set"}
`noEmit`, `declaration`, and `declarationMap` are deliberately absent from base — that's the axis the `app` and `lib` presets specialize. `customConditions` is also **not** set by these presets (see [Workspace resolution](#workspace-resolution-customconditions) below).
:::

## The app preset

`@pyreon/typescript/app` (`app.json`) is for anything a bundler ships — SPAs, SSR apps, example apps, the docs site. It extends base and adds exactly one option:

```json title="app.json"
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "noEmit": true
  }
}
```

| Setting  | Value  | Why                                                                                                                              |
| -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `noEmit` | `true` | TypeScript type-checks only; it never writes output files. Vite / esbuild / Bun own the actual transpile + bundle.              |

Because emit is off, `tsc --noEmit` (or `tsc -b`) is purely your type gate — fast feedback, no stray `.js` files. And since nothing is emitted, you can freely include non-source files like `vite.config.ts` without fighting `rootDir`:

```json title="App tsconfig.json"
{
  "extends": "@pyreon/typescript/app",
  "include": ["src", "vite.config.ts"]
}
```

This is the right preset for the overwhelming majority of Pyreon projects.

## The lib preset

`@pyreon/typescript/lib` (`lib.json`) is for publishable packages that ship `.d.ts` files. It extends base and turns declaration output on:

```json title="lib.json"
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true
  }
}
```

| Setting          | Value  | Why                                                                                                                                 |
| ---------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `declaration`    | `true` | Emit a `.d.ts` next to each compiled module so consumers get types.                                                                  |
| `declarationMap` | `true` | Emit `.d.ts.map` so a consumer's "go to definition" jumps to your original `.ts` source, not the generated declaration.             |

A library still needs an output directory (the preset doesn't pick one for you):

```json title="Library tsconfig.json"
{
  "extends": "@pyreon/typescript/lib",
  "include": ["src"],
  "compilerOptions": {
    "outDir": "./lib",
    "rootDir": "./src"
  }
}
```

:::tip{title="`declaration` ≠ JS emit"}
The lib preset inherits `sourceMap: true` from base but does **not** set `noEmit`. With `declaration: true` and no `noEmit`, `tsc` will emit both `.js` and `.d.ts`. If your bundler emits the JS and you only want `tsc` to produce declarations, add `"emitDeclarationOnly": true` in your own config.
:::

## base vs app vs lib

```text
@pyreon/typescript        (base.json)   ← shared contract, extended by both below
├── @pyreon/typescript/app (app.json)   = base + noEmit
└── @pyreon/typescript/lib (lib.json)   = base + declaration + declarationMap
```

| You're building…                                   | Extend                      | Why                                                                              |
| -------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| An SPA / SSR app / example                         | `@pyreon/typescript/app`    | Bundler emits the JS; `tsc` is your type gate (`noEmit`).                         |
| A publishable package that ships types             | `@pyreon/typescript/lib`    | You need `.d.ts` + `.d.ts.map` output.                                            |
| A monorepo root, or something needing custom emit  | `@pyreon/typescript`        | Take the shared contract and add your own `noEmit` / `declaration` / references. |

The mental model: **base** is the contract, **app** and **lib** each flip exactly one emit-axis on top of it. If neither emit shape fits, extend base directly and set the emit options yourself.

## Workspace resolution (`customConditions`)

If you've read Pyreon's monorepo setup, you've seen `customConditions: ["bun"]` — the trick that lets Vite/TypeScript resolve `@pyreon/*` workspace imports straight to `src/*.ts` (the `"bun"` export condition) with no build step in dev.

That option is **not** part of these presets. It's a property of *the monorepo's own root `tsconfig.json`*, where workspace packages resolve to each other's source. In a normal downstream app consuming Pyreon from `node_modules`, you don't need it — published `@pyreon/*` packages resolve via their default conditions.

If you ARE building inside a Pyreon-style workspace and want source resolution, add it in your own config on top of the preset:

```json title="Monorepo root tsconfig.json"
{
  "extends": "@pyreon/typescript",
  "compilerOptions": {
    "noEmit": true,
    "customConditions": ["bun"]
  },
  "references": [
    { "path": "packages/my-app" },
    { "path": "packages/my-lib" }
  ]
}
```

:::note{title="The presets are app/library-facing, not workspace-internal"}
The presets ship the settings every *consumer* project needs. Workspace-internal resolution (`customConditions`, `allowImportingTsExtensions`) is a monorepo concern you layer on yourself — keeping it out of the presets means a downstream app never inherits a flag that only makes sense inside the framework's own repo.
:::

## Bun-first globals (`@pyreon/typescript/globals`)

The Pyreon toolchain assumes Bun universally, but a few Bun-specific globals aren't typed by `@types/node` or `@types/bun`. The `globals` entry point is an ambient declaration file (`global.d.ts`) that declares them once, so your source type-checks cleanly instead of needing per-call casts like `(import.meta as { main?: boolean }).main`.

Today it augments `ImportMeta` with Bun's `import.meta.main`:

```ts
declare global {
  interface ImportMeta {
    /** Bun: true when the module is the CLI entry point. */
    readonly main?: boolean
  }
}
```

Reference it one of two ways:

:::code-group

```ts [Triple-slash directive]
/// <reference types="@pyreon/typescript/globals" />

if (import.meta.main) {
  main()
}
```

```json [compilerOptions.types]
{
  "extends": "@pyreon/typescript/app",
  "compilerOptions": {
    "types": ["@pyreon/typescript/globals"]
  }
}
```

:::

This is what tools like `@pyreon/lint` and `@pyreon/zero-cli` use to gate a `main()` call on being run from the CLI.

:::warning{title="`types` is an allowlist, not an addition"}
Setting `compilerOptions.types` makes TypeScript include **only** the listed packages' global types — it stops auto-including every `@types/*` in `node_modules`. If you use the array form, add the other globals you rely on too (e.g. `["@pyreon/typescript/globals", "@types/bun"]`), or use the triple-slash directive in a single `.d.ts` file instead, which doesn't disable auto-inclusion.
:::

## JSX configuration

All presets inherit the JSX wiring from base — you never configure it per project:

- `jsx: "react-jsx"` — the automatic transform. No `import { h } from '@pyreon/core'` boilerplate in every file.
- `jsxImportSource: "@pyreon/core"` — the transform pulls its factory from `@pyreon/core/jsx-runtime`, so `<div />` produces a Pyreon VNode.

When you use `@pyreon/vite-plugin`, it configures esbuild with the same two settings at *build* time. The preset is what makes `tsc --noEmit` and your editor agree with the bundler at *type-check* time. They're two halves of the same contract — keep them in sync.

### Compat layers override `jsxImportSource`

`jsxImportSource` is fixed to `@pyreon/core` in base. If you're running a drop-in compat layer (so existing React/Vue/etc. code resolves to Pyreon), override it in your own config:

```json title="tsconfig.json (React compat)"
{
  "extends": "@pyreon/typescript/app",
  "compilerOptions": {
    "jsxImportSource": "@pyreon/react-compat"
  }
}
```

## Strict-mode gotchas

The base preset turns on two strict flags that are off in stock `tsc --strict`. They catch real bugs, but they change how everyday code type-checks.

### `exactOptionalPropertyTypes`

An optional property is `T`, not `T | undefined`. Assigning `undefined` to it is an error unless the property's type explicitly includes `undefined`:

```ts
interface Config {
  name?: string // accepts string OR absent — NOT undefined
}

const a: Config = {} // ✅ absent
const b: Config = { name: undefined } // ❌ undefined isn't string

// To intentionally allow the undefined value:
interface Config2 {
  name?: string | undefined // now `name: undefined` is allowed
}
```

This catches the bug class where you spread a partial object and accidentally write `undefined` over a property that callers assume is always a string when present.

### `noUncheckedIndexedAccess`

Indexed access returns `T | undefined`. The compiler forces you to handle the missing case:

```ts
const items = ['a', 'b', 'c']

const first = items[0] // type: string | undefined
console.log(first.toUpperCase()) // ❌ Object is possibly 'undefined'

// Guard it:
const x = items[0]
if (x !== undefined) console.log(x.toUpperCase()) // ✅

// Or assert when you've already bounds-checked:
for (let i = 0; i < items.length; i++) {
  console.log(items[i]!.toUpperCase()) // ✅ provably in-bounds
}
```

Same applies to `Record<string, T>` lookups and `Map.get` is unaffected (it already returns `T | undefined`).

## `module: "Preserve"` and raw `tsc` emit

`module: "Preserve"` is built for a downstream bundler — it keeps your `import`/`export` syntax verbatim and permits ESM/CJS interop without rewriting. It is **not** meant for emitting runnable JS with `tsc` alone.

If you need `tsc` to produce executable modules directly (a CLI compiled without a bundler, say), override `module` in your own config:

```json title="tsconfig.json (raw tsc emit)"
{
  "extends": "@pyreon/typescript/lib",
  "compilerOptions": {
    "module": "ESNext"
  }
}
```

For app projects this never comes up — the bundler does the emit and `noEmit` keeps `tsc` out of it.

## Versioning & compatibility

- **Peer dependency:** `typescript >= 5.9.0`. The presets use options stable in TypeScript 5.9+ (`module: "Preserve"`, `moduleResolution: "Bundler"`, `verbatimModuleSyntax`).
- **`@pyreon/core` dependency:** `>= 0.13.0` — for the `@pyreon/core/jsx-runtime` that `jsxImportSource` points at. Your project already depends on `@pyreon/core` if it renders anything.
- **`sideEffects: false`** — the presets are pure JSON config; nothing in the package executes.

## Entry points

| Import specifier               | Resolves to    | Use for                                                                       |
| ------------------------------ | -------------- | ----------------------------------------------------------------------------- |
| `@pyreon/typescript`           | `base.json`    | The shared base contract — extend directly when you need custom emit.         |
| `@pyreon/typescript/app`       | `app.json`     | Apps (SPA / SSR / examples). Base + `noEmit`.                                 |
| `@pyreon/typescript/lib`       | `lib.json`     | Publishable libraries. Base + `declaration` + `declarationMap`.               |
| `@pyreon/typescript/globals`   | `global.d.ts`  | Bun-first ambient globals (`import.meta.main`). Reference via types/directive. |

## Inherited-options reference

What you get from each preset, after the `extends` chain resolves:

| Option                             | base | app | lib |
| ---------------------------------- | :--: | :-: | :-: |
| `target: "ES2024"`                 |  ✅  | ✅  | ✅  |
| `module: "Preserve"`               |  ✅  | ✅  | ✅  |
| `moduleResolution: "Bundler"`      |  ✅  | ✅  | ✅  |
| `moduleDetection: "force"`         |  ✅  | ✅  | ✅  |
| `verbatimModuleSyntax: true`       |  ✅  | ✅  | ✅  |
| `resolveJsonModule: true`          |  ✅  | ✅  | ✅  |
| `jsx: "react-jsx"`                 |  ✅  | ✅  | ✅  |
| `jsxImportSource: "@pyreon/core"`  |  ✅  | ✅  | ✅  |
| `lib: ["ES2024","DOM","DOM.Iterable"]` | ✅ | ✅  | ✅  |
| `strict: true`                     |  ✅  | ✅  | ✅  |
| `exactOptionalPropertyTypes: true` |  ✅  | ✅  | ✅  |
| `noUncheckedIndexedAccess: true`   |  ✅  | ✅  | ✅  |
| `noImplicitOverride: true`         |  ✅  | ✅  | ✅  |
| `forceConsistentCasingInFileNames: true` | ✅ | ✅ | ✅ |
| `skipLibCheck: true`               |  ✅  | ✅  | ✅  |
| `sourceMap: true`                  |  ✅  | ✅  | ✅  |
| `noEmit: true`                     |  —   | ✅  | —   |
| `declaration: true`                |  —   | —   | ✅  |
| `declarationMap: true`             |  —   | —   | ✅  |
