---
'@pyreon/zero-cli': patch
---

`zero dev`: collapse the route list to a one-line summary by default and always print the Local URL + ready time last.

The startup banner previously printed the full route table (one line per route) with the Local URL first. Under `bun run --filter <app> dev` — whose runner elides the *middle* of long child output and keeps only the tail — a large app's route table pushed the Local URL and startup time off the top, so you couldn't see where to open the app or how long it took.

Now the banner is collapsed to a compact summary (`Routes  SSR 15 · SSG 4 · API 1`), and the Local URL + `ready in <ms>` are printed last so they survive in the visible tail. Pass `--routes` to expand the full table.
