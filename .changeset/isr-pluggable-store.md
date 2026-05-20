---
'@pyreon/zero': minor
---

feat(zero): ISR external-store interface — `ISRStore` + `createMemoryStore`; multi-instance production unlock

`createISRHandler` was previously hard-wired to `new Map<string, CacheEntry>`
— per-process, never shared. Multi-instance deploys (load-balanced Node,
autoscaled containers, edge functions) hit a wall: each pod had its own
cache, so a revalidation in pod A was invisible to pod B. Sticky
sessions or external cache plumbing was the framework user's problem.

New: pluggable backing store.

```ts
// ISRConfig.store accepts any backing matching:
interface ISRStore<E = ISRCacheEntry> {
  get(key: string): Promise<E | undefined> | E | undefined
  set(key: string, entry: E): Promise<void> | void
  delete?(key: string): Promise<void> | void
}
```

Sync OR async returns — in-memory stays cheap (no Promise allocation per
request), external stores return their native promises naturally. The
handler `await`s the result either way.

**Default unchanged**: `createMemoryStore({ maxEntries })` (extracted
from the previous in-place `Map` logic) — drop-in pass-through,
behaviour-identical for existing callers. `config.maxEntries` is
ignored when a custom `config.store` is supplied (the custom store owns
its own eviction/TTL policy).

New exports from `@pyreon/zero/server`:

- `ISRStore<E>` interface
- `ISRCacheEntry` interface (`{ html, headers, timestamp }`)
- `createMemoryStore({ maxEntries? })` — the default factory

Example Redis adapter:

```ts
import { Redis } from 'ioredis'
import type { ISRStore } from '@pyreon/zero/server'

const redis = new Redis(/* ... */)
const store: ISRStore = {
  async get(key) {
    const v = await redis.get(`isr:${key}`)
    return v ? JSON.parse(v) : undefined
  },
  async set(key, entry) {
    await redis.set(`isr:${key}`, JSON.stringify(entry), 'EX', 86400)
  },
  async delete(key) {
    await redis.del(`isr:${key}`)
  },
}

const handler = createISRHandler(ssrHandler, { revalidate: 60, store })
```

Tests: 6 new specs in `tests/isr.test.ts` "pluggable store" describe —
default backwards-compat, `createMemoryStore` LRU bump on `get`,
fake-Redis call sequence, async store roundtrip, cache-hit short-
circuit, non-cacheable response does NOT call `set`. 19/19 ISR specs
pass total. Typecheck + lint + build clean.

**No breaking change**: omitting `config.store` keeps prior behaviour
exactly (`createMemoryStore` defaults `maxEntries` to 1000 just like
the previous hard-coded Map+LRU did).
