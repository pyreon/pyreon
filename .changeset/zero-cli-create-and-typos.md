---
'@pyreon/zero-cli': patch
'@pyreon/create-zero': patch
---

- `zero create` works again: it runs `@pyreon/create-zero` with every argument forwarded. It used to look for a `templates/default` folder that no longer exists and always failed with "Template not found".
- A mistyped command no longer starts a dev server. `zero biuld` used to treat `biuld` as a project directory; it now exits with `[Pyreon] "biuld" is not a zero command or a directory. Did you mean "zero build"?`.
- Scaffolded apps: the server entry now passes `apiRoutes` (API routes returned an empty HTML page in production), `tsconfig` includes `vite.config.ts` so `zero()` option typos fail the typecheck, the app template passes its own `doctor:ci`, and the pages point at `bun create @pyreon/zero` instead of an unrelated package.
