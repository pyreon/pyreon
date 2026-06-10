# Pyreon Collab Board

A real-time **collaborative kanban board** — and the canonical showcase for how
`@pyreon/sync` composes with the rest of the Pyreon ecosystem. Drag (or move) a
card in one browser window and it moves in every other window/device, one
fine-grained DOM update at a time — because a synced value *is* a signal, a
remote op becomes one `signal.set`, not a re-render.

> This is a demo. It is `private` (not published). See `docs/src/content/docs/sync.md`
> for the `@pyreon/sync` reference.

## Run it

```bash
# 1. Start the relay (cross-device sync). Same-origin TABS sync without it.
bun examples/collab-board/relay.ts            # ws://127.0.0.1:5190/<room>

# 2. Start the app.
bun run --filter=@pyreon/example-collab-board dev   # http://localhost:5189
```

Open `http://localhost:5189` → pick a board → open it in **two windows**.

- **Two tabs, same browser** → they sync with **no relay** (BroadcastChannel).
- **Two different browsers / devices** → append `?ws=ws://127.0.0.1:5190/<room>`
  (the board page reads it) so they sync **through the relay**.
- **Reload** → your edits are still there (IndexedDB persistence).
- **Stop the relay, edit, restart it** → the offline edits replay on reconnect.

## What composes with what (the point of this example)

Each package owns a **distinct slice** of the app — sync owns the collaborative
data; everything else owns its own job. That separation is the lesson:

| Package | Owns | Where |
| --- | --- | --- |
| **`@pyreon/sync`** | the live collaborative data — board title (`syncedStore`), each column's cards (`syncedList`, positional merge), a card's description (`syncedText`, character merge) | `src/sync/board-doc.ts` |
| **`@pyreon/sync/yjs`** | the engine + transports + persistence (`createYjsDoc`, `connectViaWebSocket`, `connectViaBroadcastChannel`, `persistViaIndexedDB`) | `src/sync/board-doc.ts` |
| **`@pyreon/sync/server`** | the relay (`createSyncServer` + an `authorize` gate) | `relay.ts` |
| **`@pyreon/dnd`** | dragging cards within/between columns → writes the synced lists (`useSortable` + `groupId`) | `src/components/Column.tsx` |
| **`@pyreon/router`** | the room from the route (`/board/:id`) | `src/app.tsx`, `src/routes/board.tsx` |
| **`@pyreon/query`** | the **server-owned** board list (the "envelope" — request/response, distinct from the live board contents) | `src/routes/board-list.tsx`, `src/api/boards.ts` |
| **`@pyreon/permissions`** | the viewer/editor **UI** gate (the relay `authorize` is the real one) | `src/state/permissions.ts` |
| **`@pyreon/storage`** | **per-device** state — theme, your display name + color (NOT synced) | `src/state/identity.ts` |
| **`@pyreon/toast`** | connection-status notifications | `src/app.tsx`, `src/routes/board.tsx` |
| **`@pyreon/hooks`** | `useColorScheme` for the default theme | `src/state/identity.ts` |

### The key integration: dnd ↔ syncedList

`useSortable` feeds on the column's `syncedList` directly (it's a `Signal<Card[]>`).
A **within-column reorder** writes the whole list back (`cards.set(next)` — coarse
but fine for the common case). A **cross-column move** (shared `groupId: 'board'`)
uses **positional ops** — `onCrossListReceive` inserts on the destination,
`onCrossListDrop` deletes from the source — so concurrent moves from two people
merge correctly. The per-card **→ button** does the same positional move without
a drag (keyboard/click-accessible, and what the e2e drives deterministically).

### Query vs sync — different sources of truth

The board **list** is server-owned (`@pyreon/query`, request/response). Each board's
**contents** are collaborative (`@pyreon/sync`, CRDT). They never share the same
data — the canonical split: query for the envelope, sync for the live contents.

## Honest limits (also baked into `@pyreon/sync`'s docs)

- **No live presence cursors.** Identity is per-device (`@pyreon/storage`); real
  presence needs the awareness protocol (out of scope). Swap the description
  `<textarea>` for `@pyreon/code` + `bindEditorToSignal` to get a collaborative
  *code* editor with cursors as a follow-up.
- **Viewer/editor is a UI gate**, not security — the relay's `authorize` hook is
  the real enforcement (kept permissive here for a zero-setup local demo).
- **CRDTs prevent lost *updates*, not semantic conflicts** — concurrent title
  edits are last-writer-wins; concurrent description edits keep both but can
  interleave. Real apps add conflict UX.
- **SPA, no SSR** — local-first is client-centric, and the synced doc lives on
  the client (SSR would have nothing to render until hydration).

## Tests

`e2e/collab-board.spec.ts` (real Chromium, `bun run test:e2e:collab-board`):
two isolated browser contexts converge through the relay — add a card, edit the
title, move a card cross-column in one, and watch the other update. It drives
mutations via buttons (deterministic); drag mechanics are covered by
app-showcase's dnd gate.
