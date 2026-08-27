---
'@pyreon/lathe': minor
---

Add a Vite plugin, watch mode, a generated barrel and a query-key registry.

**`@pyreon/lathe/vite`** regenerates on dev-server start and on every spec
change, so the window in which a client can disagree with its spec is the time
between a save and the next request rather than however long it takes someone
to remember to run the CLI. `checkOnBuild` makes a stale client a **build
error** — generated output that disagrees with its spec compiles and then fails
against the real server, which is the worst place to find out. It writes files
to disk rather than serving a virtual module, deliberately: the one artifact
people need to read when something looks wrong should be the one they can open.

**`lathe generate --watch`** for the CLI. The watcher is on the containing
directory with a filename filter rather than the file itself — editors write via
rename as often as in place, and a watch on the inode dies the first time one
replaces it. Events are coalesced, and a spec that is unparseable mid-save
prints and keeps watching rather than exiting.

**A generated `index.ts` barrel.** The per-tag split is an emitter concern;
nothing in a consuming app needs to know which tag an operation was filed under,
or that tags exist.

**A generated `keys.ts`.** Invalidation is where a generated client usually
stops helping: `['GET', '/books']` written by hand drifts from the endpoint the
moment a path changes and nothing catches it. `keys.books.listBooks.all` matches
every call of an endpoint, `.of(args)` matches one, and both come from the
endpoint itself.
