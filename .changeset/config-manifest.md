---
'@pyreon/config': minor
---

`@pyreon/config` gets a manifest, so it stops being invisible to every
documentation and AI surface.

It shipped on the no-manifest exempt list, reasoned about as "build-time config
shape, no runtime API" — the same bucket as `@pyreon/typescript`. That
comparison does not hold: `@pyreon/typescript` ships presets a project
REFERENCES from `tsconfig.json`, while `@pyreon/config` ships `defineConfig`,
`CONFIG_FILENAMES` and `sectionFrom`, which a project (and every Pyreon config
loader) IMPORTS. It is a consumable API, and exempting it meant a newly
published package with no `llms.txt` line, no MCP api-reference entry, and no
reference page — for a file users are expected to write by hand.

The manifest restores all three from one source, and the stale
`NO_MANIFEST_EXEMPT` entry is removed (the tier gate flags that as stale the
moment a manifest appears, which is how it was caught).
