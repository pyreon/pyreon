---
'@pyreon/zero': patch
---

The node + bun deploy adapters' emitted server entry now honors `$PORT` at
runtime, falling back to the build-time configured port (default 3000).
Previously the port was baked into `server.listen(3000, …)` / `Bun.serve({
port: 3000 })` and `process.env.PORT` was ignored — breaking the standard
convention every Node/Bun PaaS relies on (Vercel, Heroku, Cloud Run, Render,
Fly, CI runners all inject `$PORT`). A set-but-empty `PORT` falls back to the
configured port; `PORT=0` binds an ephemeral port.
