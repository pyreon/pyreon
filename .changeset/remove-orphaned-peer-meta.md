---
"@pyreon/validation": patch
"@pyreon/head": patch
---

chore: remove orphaned `peerDependenciesMeta` entries

Both packages declared `peerDependenciesMeta` entries with no matching `peerDependencies`, which package managers materialize as inert optional `*` peers:

- **@pyreon/validation** — `zod` / `valibot` / `arktype` marked optional-peer, but validation is library-agnostic and DUCK-TYPES the schema interface (`src/zod.ts`: type-only imports, "so we don't require zod as a hard dep"). It never imports them, so they are neither dependencies nor peers — they're devDependencies used only by validation's own adapter tests. The declaration was dead and misleadingly narrow (validation accepts ANY Standard Schema, not just these three).
- **@pyreon/head** — `@pyreon/runtime-server` marked optional-peer, but it is already a real `dependencies` entry (`head/ssr` imports `renderToString` from it). The peer meta was redundant.

No consumer-facing change: these entries were inert. Removing them makes the manifests accurate. The lockfile update is surgical (only the derived optional-peer records for these two packages).
