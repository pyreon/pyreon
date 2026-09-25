---
'@pyreon/lathe': minor
'@pyreon/config': minor
---

`remoteRefs: 'fetch'` lets `generate` download the REMOTE parts of a spec on disk (default `'off'` stays offline and reports them), with `lathe pull`'s rules: per-document ETag cache, `remoteHeaders` keyed by origin and sent only there, and a part that cannot be fetched fails the run. A bundled `lathe pull` is now conditional on the root spec too. `api-surface.json` records typed error bodies and the contract diff classifies them (a removed key or changed body is breaking; an added key is breaking only when a range or `default` already covered its status). `mockOperation(id, { status })` answers with the declared, schema-valid error body.
