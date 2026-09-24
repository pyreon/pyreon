---
name: pyreon-internals
description: Deep internals of the Pyreon core layer — the dual-backend JSX compiler (template emission, signal auto-call, reactive-props inlining, collapse, Reactivity Lens), the signal implementation (subscriber tiers, two-tier batch flush, per-primitive heap), SSR (renderToString/renderToStream, the ssrTemplate fast path, hydration), and code splitting / HMR / devtools. Load before changing or reviewing anything in packages/core/{compiler,reactivity,runtime-dom,runtime-server}, or when reasoning about how JSX lowers, how batching settles, or why a binding is not reactive.
---

Read `.agents/guides/internals/README.md` in full (the tool-neutral source of truth for this topic). Edit those files, not this shim.
