# @pyreon/create-zero

Interactive scaffolding tool for [Pyreon Zero](https://github.com/pyreon/zero) projects.

## Usage

```bash
bun create @pyreon/zero my-app
```

Or via the CLI:

```bash
zero create my-app
```

## Interactive Setup

The CLI prompts you to configure:

1. **Rendering mode** — SSR Streaming, SSR String, SSG, or SPA
2. **Features** — pick from store, query, forms, feature CRUD, i18n, tables, virtual lists, CSS-in-JS, UI elements, animations, hooks
3. **AI toolchain** — MCP server config, CLAUDE.md, doctor scripts

## What Gets Generated

Based on your selections:

- `package.json` — only the dependencies you chose
- `vite.config.ts` — configured for your rendering mode
- `src/entry-server.ts` — matching SSR/stream config with CORS + rate limiting
- `src/routes/` — example pages, API routes, protected dashboard
- `src/features/` — feature example with Zod schema (if selected)
- `src/stores/` — store example (if selected)
- `.mcp.json` — AI IDE integration (if AI toolchain selected)
- `CLAUDE.md` — project rules for AI agents (if AI toolchain selected)
- `env.d.ts` — virtual module type declarations

## License

[MIT](LICENSE)
