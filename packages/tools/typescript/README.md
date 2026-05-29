# @pyreon/typescript

TypeScript config presets for Pyreon projects — base, app, lib.

`@pyreon/typescript` ships three `tsconfig.json` presets you extend from your own config. The `base` preset configures the JSX import source (`@pyreon/core`), ES2024 target, bundler module resolution, strict mode (including `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`), and source maps. The `app` preset adds `noEmit` (type-check only — bundler handles emit). The `lib` preset adds `declaration` + `declarationMap` for publishable packages. No `compilerOptions` ceremony at the consumer side.

## Install

```bash
bun add -D @pyreon/typescript
```

## Usage

### Applications

For Pyreon apps (SPAs, SSR apps, example apps):

```jsonc
// tsconfig.json
{
  "extends": "@pyreon/typescript/app",
  "include": ["src/**/*"],
}
```

### Libraries

For publishable packages that need `.d.ts` output:

```jsonc
{
  "extends": "@pyreon/typescript/lib",
  "include": ["src/**/*"],
  "compilerOptions": {
    "outDir": "./lib",
  },
}
```

### Base only

If you need finer control, extend `base` and add your own flags:

```jsonc
{
  "extends": "@pyreon/typescript",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "./src",
  },
}
```

## What's included

All presets configure:

- **JSX** — `"jsx": "react-jsx"` with `"jsxImportSource": "@pyreon/core"` so `<div />` resolves to Pyreon's JSX runtime out of the box.
- **Modern target** — `target: "ES2024"`, `module: "Preserve"`, `lib: ["ES2024", "DOM", "DOM.Iterable"]`.
- **Bundler resolution** — `moduleResolution: "Bundler"`, `verbatimModuleSyntax: true`, `resolveJsonModule: true`, `moduleDetection: "force"`.
- **Strict mode** — `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `forceConsistentCasingInFileNames`.
- **`skipLibCheck: true`** — node_modules `.d.ts` files are not re-checked.
- **Source maps enabled.**
- **`exclude`**: `node_modules`, `lib`, `dist`.

### `app` adds

- `noEmit: true` — type-checking only, the bundler (Vite/esbuild/Bun) emits.

### `lib` adds

- `declaration: true` + `declarationMap: true` — generates `.d.ts` + `.d.ts.map` for consumers.

## Subpath exports

| Subpath                  | File        |
| ------------------------ | ----------- |
| `@pyreon/typescript`     | `base.json` |
| `@pyreon/typescript/app` | `app.json`  |
| `@pyreon/typescript/lib` | `lib.json`  |

## Peer dependencies

- `typescript >= 5.9.0`

## Gotchas

- **`exactOptionalPropertyTypes` is enabled.** Optional properties need explicit `| undefined` when assigned from functions that may return undefined. This is intentional — it catches a real bug class.
- **`noUncheckedIndexedAccess` is enabled.** Array element access returns `T | undefined` — guard with `arr[i]?` or `if (!arr[i]) return`.
- **`jsxImportSource: "@pyreon/core"` is fixed in `base`.** If you're using a compat layer (`@pyreon/react-compat`, `@pyreon/vue-compat`, …), override `jsxImportSource` in your own tsconfig.
- **`module: "Preserve"`** is for Bun/bundler resolution. If you need raw `tsc` emit, switch to `module: "ESNext"`.

## Documentation

Full docs: [docs.pyreon.dev/docs/typescript](https://docs.pyreon.dev/docs/typescript) (or `docs/docs/typescript.md` in this repo).

## License

MIT
