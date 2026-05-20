---
'@pyreon/zero': patch
---

`createActionMiddleware` — surface server-action errors to operator logs + distinguish client errors (400) from server errors (500).

Continuation of the swallow-error audit pattern from PR #755 (cloud adapters) and PR #753 (node adapter). The same shape — `catch (err) { return 500 }` with **no `console.error(err)`** — was hiding in `executeAction` for server actions. Production crashes inside a user's action handler returned a generic 500 to the client AND emitted **zero diagnostic info** to server logs, leaving operators unable to diagnose failures.

**Fix 1 — log handler crashes:**
```ts
} catch (err) {
  console.error('[Pyreon Action] handler failed:', err)
  // ...
}
```
The same `[Pyreon SSR] handler failed:` / `[Pyreon Action] handler failed:` prefix family makes failures trivially greppable across log streams.

**Fix 2 — distinguish parse errors (400) from runtime errors (500):**

Pre-fix, `await req.json()` and `await req.formData()` throwing on malformed payloads (truncated JSON, invalid UTF-8, etc.) were caught by the same outer `catch` that handled handler crashes — and returned **500**. That conflated client errors (bad payload — the client's fault) with server errors (handler crashed — the server's fault).

Now the parse step has its own try/catch and returns **400 (Bad Request)** with a generic `{ error: 'Invalid request body' }` payload. The generic message also prevents leaking parser internals (`Unexpected token X in JSON at position N` could expose sensitive offset / state info to hostile clients).

**Tests (3 new specs in `actions.test.ts`):**

1. **logs action runtime errors to console.error with prefix** — `vi.spyOn(console, 'error')` asserts the `[Pyreon Action] handler failed:` log fires with the error attached.
2. **returns 400 (not 500) on malformed JSON request body** — `body: '{not valid json'` with `Content-Type: application/json` → 400 + `{ error: 'Invalid request body' }` + `console.error` captures the parse error.
3. **does NOT leak internal parser error messages to the client** — null bytes + junk body → generic message; asserts the response body does NOT match `/position|token|offset/i` so even strict parsers (with offset reporting) can't leak.

**Bisect-verified per fix:**
- Drop `console.error` from the handler-error catch → "logs action runtime errors" fails; other 2 pass. Restored → 3/3.
- Restore single outer try/catch (pre-fix shape) → "returns 400" + "leak internal" both fail (status 500 + parser internals leaked); logging spec still passes. Restored → 3/3.

Full zero suite **965/965** pass (1 skipped pre-existing). Lint + typecheck clean for the changed files. No lockfile drift. No `TEMP BISECT` remnants.

The 2 `no-console` lint warnings emitted are intentional and match the existing convention (`console.warn` in adapter `revalidate` methods — production logging).
