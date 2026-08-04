---
'@pyreon/atlas': patch
---

Atlas reads the ecosystem-wide `pyreon.config.*` through `@pyreon/config`'s
`CONFIG_FILENAMES` and `sectionFrom` instead of its own copies of both.

No behaviour change — the filename list and the named-vs-default section
lookup were byte-identical, and all 13 loader specs pass unchanged. What
changes is that there is now one definition rather than two. A second copy of
"which filenames, and how to pull a tool's section out" drifts the day one
list gains an entry the other does not, and the failure mode is a config file
that is silently ignored — precisely what the shared file exists to prevent.

`@pyreon/config` also gains its first consumer. It shipped exporting helpers
nothing imported, which is the typed-but-unimplemented shape its own doc
comment warns against.
