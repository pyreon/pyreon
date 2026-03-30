# @pyreon/typescript

TypeScript configuration presets for Pyreon projects. Zero-config — just extend and go.

## Install

```bash
bun add -d @pyreon/typescript
```

## Usage

### Applications

For Pyreon apps (SPAs, SSR apps, examples):

```json
{
  "extends": "@pyreon/typescript/app"
}
```

### Libraries

For publishable packages that need `.d.ts` output:

```json
{
  "extends": "@pyreon/typescript/lib"
}
```

### Base

Both `app` and `lib` extend `base`. You can extend it directly if you need full control:

```json
{
  "extends": "@pyreon/typescript",
  "compilerOptions": {
    "noEmit": true
  }
}
```

## What's Included

All presets configure:

- **JSX** — `"jsx": "preserve"` with `"jsxImportSource": "@pyreon/core"` so `<div />` just works
- **Modern target** — ES2024 with DOM and DOM.Iterable libs
- **Bundler resolution** — `"moduleResolution": "Bundler"` for Vite/esbuild/Bun compatibility
- **Strict mode** — `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`
- **Source maps** — enabled by default

### `app` adds:

- `noEmit: true` — type-checking only, bundler handles emit

### `lib` adds:

- `declaration: true` + `declarationMap: true` — generates `.d.ts` files for consumers

## License

MIT
