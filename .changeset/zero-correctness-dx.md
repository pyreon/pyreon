---
'@pyreon/zero': minor
'@pyreon/zero-cli': patch
'@pyreon/create-zero': patch
---

Correctness and DX fixes for `@pyreon/zero`:

- `useLocale()` resolves the locale from the URL in production SSR, SSG and on the client (it returned `'en'` outside the dev middleware, so dev hydrated with a mismatch). Region locales such as `en-US` round-trip, and `setLocale()` keeps the base, query string and hash.
- A page's own `error` export applies without a directory `_error.tsx`.
- Windows backslash route paths are normalized to posix, so nested routes and generated imports work.
- SSG redirect targets must be relative or `http(s):` (a `javascript:` target is rejected). `vercelAdapter.revalidate()` sends the secret as `Authorization: Bearer`; `vercelRevalidateHandler` still accepts `?secret=` with a deprecation warning.
- Dotted URLs (`/api/export.csv`) reach dev API routes and the dev i18n middleware.
- Route scans are memoized per build, and `.server.*` siblings come from the same walk.
- `vite dev` runs the production request pipeline: the server entry's middleware, route middleware, `/_pyreon/data`, `/_zero/actions/*` and server islands (new `@pyreon/zero/pipeline` subpath).
- `zero({...})` options are validated with did-you-mean suggestions. A missing `pyreon()` plugin, a default-only layout and a literal `loader` each fail with one error that names the file; a route file with no default export warns. Dev SSR errors are logged to the terminal.
- A `getStaticPaths` export no longer defeats the route's code splitting (removes the `INEFFECTIVE_DYNAMIC_IMPORT` warning).
- `zero preview` runs the built node/bun server for SSR/ISR builds, and CLI errors are `[Pyreon]`-prefixed with the stack kept.
- `create-zero` refuses `--mode` a template cannot honor and `--adapter static` with an SSR mode, and `--pm` no longer aliases `--packages`.
