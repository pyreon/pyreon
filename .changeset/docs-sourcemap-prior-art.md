---
---

Docs only — no `@pyreon/*` package change, no version bump.

- **Compiler / Vite-plugin docs**: document the source-map behaviour shipped
  in the recent compiler hardening — the JS backend now emits a correct V3
  source map (`magic-string`) which `@pyreon/vite-plugin` forwards to Vite,
  with the honest caveats (native Rust backend has no map yet — scoped
  follow-up; dev-mode HMR/signal-name injections add a small un-remapped
  offset; no-op compiles produce no map). Replaces the now-stale
  "left-to-right string builder" sentence in `compiler.md`.
- **New page `architecture-and-prior-art.md`**: a neutral, no-superiority
  placement of Pyreon in the signals family — Solid as the truthful
  architectural peer, React/Vue/Svelte respected as distinct lineages,
  scope-not-"better" framing, and the benchmark wording kept verbatim with
  the project's honest internal record ("competitive with Solid, most rows
  tied within measurement noise, real-app head-to-head pending — not
  'fastest on all benchmarks'"). Registered in the Getting-Started sidebar.
- `CLAUDE.md` doc-page count 79 → 80 (keeps the Check Doc Claims gate
  consistent with the added page).
