---
'@pyreon/zero-cli': patch
---

Honour `zero({ port })` from `vite.config.ts` in `zero dev` / `zero preview`.

Pre-fix the CLI always bound the CAC-baked default 3000 (or whatever `--port` passed) — `zero({ port: 8080 })` in `vite.config.ts` was silently ignored when the user ran `zero dev`. Post-fix precedence is `CLI flag > zero({ port }) > 3000 default`:

```ts
// vite.config.ts
plugins: [pyreon(), zero({ port: 8080 })]
```

```sh
zero dev               # → 8080 (reads vite.config.ts)
zero dev --port 5191   # → 5191 (CLI override)
```

Two changes:

1. **Removed the CAC `default: 3000`** on the `--port` flag. The default made `options.port` always-defined, which meant the config-file fallback could never fire.
2. **New `loadZeroConfigPort(root)`** in `packages/zero/cli/src/commands/load-config.ts` — loads `vite.config.ts` via `vite.loadConfigFromFile`, walks the plugin list, finds the zero plugin instance, reads its captured `ZeroConfig.port`. Falls back to `undefined` gracefully when no zero plugin is present (consumer is using `pyreon()` only) so the framework's 3000 default kicks in.

Composes with PR #582's plugin-side argv detection: `vite --port 517N` (plain Vite invocation) is handled by the plugin; `zero dev --port 5191` (CLI invocation) is handled here. Both paths converge on the same precedence model.

Bisect-verified: pre-fix `zero dev` in a project with `zero({ port: 8080 })` in vite.config.ts binds 3000 (CAC default wins, configPort never consulted). Post-fix binds 8080. `--port 5191` still wins both before and after.
