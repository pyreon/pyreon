# Pyreon Collab Board

A real-time **collaborative kanban board** — and the canonical showcase for how
`@pyreon/sync` composes with the rest of the Pyreon ecosystem. Drag (or move) a
card in one window and it moves in every other window/device, one fine-grained
DOM update at a time — because a synced value *is* a signal, a remote op becomes
one `signal.set`, not a re-render.

> Demo, `private` (not published). See `docs/src/content/docs/sync.md` for the
> `@pyreon/sync` reference.

## Run it

```bash
# 1. Start the relay (cross-device sync). Same-origin TABS sync without it.
bun examples/collab-board/relay.ts            # ws://127.0.0.1:5190/<room>

# 2. Start the app.
bun run --filter=@pyreon/example-collab-board dev   # http://localhost:5189
```

Open `http://localhost:5189` → create or pick a board → open it in **two
windows**.

- **Two tabs, same browser** → sync with **no relay** (BroadcastChannel).
- **Two browsers / devices** → append `?ws=ws://127.0.0.1:5190/<room>` so they
  sync **through the relay**.
- **Reload** → edits persist (IndexedDB). **Stop the relay, edit, restart** →
  offline edits replay on reconnect.

## Features

- **Collaborative cards** — add, **rename**, **label** (color tags), **delete**;
  **drag** to reorder / move across columns (or the accessible **→** button).
- **Collaborative notes** per card — a CodeMirror editor (`@pyreon/code`) whose
  buffer is a CRDT (`syncedText`): two people edit with character-level merge.
- **Presence** — live "who's here" avatars (synced heartbeat).
- **A virtualized backlog** — seed 1,000 synced cards; only the visible rows
  mount (`@pyreon/virtual`) — fine-grained sync *at scale*.
- **Create boards** — a validated form (`@pyreon/form` + `@pyreon/validation`/Zod)
  + a `@pyreon/query` mutation that refetches the list.
- **Viewer/Editor mode**, **theme**, **connection status**, **per-device identity**.

## What composes with what (the point of this example)

Each package owns a **distinct slice** — sync owns the collaborative data;
everything else owns its own job. That separation is the lesson:

| Package | Owns | Where |
| --- | --- | --- |
| **`@pyreon/sync`** | the live data — title (`syncedStore`), each column + the backlog (`syncedList`, positional merge), card notes (`syncedText`, char merge), presence (`syncedList`) | `src/sync/board-doc.ts` |
| **`@pyreon/sync/yjs`** | engine + transports + persistence (`createYjsDoc`, `connectViaWebSocket`, `connectViaBroadcastChannel`, `persistViaIndexedDB`) | `src/sync/board-doc.ts` |
| **`@pyreon/sync/server`** | the relay (`createSyncServer` + an `authorize` gate) | `relay.ts` |
| **`@pyreon/code`** | the collaborative card-notes editor — `createEditor` + `bindEditorToSignal(syncedText)` | `src/components/CardPanel.tsx` |
| **`@pyreon/dnd`** | dragging cards within/between columns → writes the synced lists (`useSortable` + `groupId`) | `src/components/Column.tsx` |
| **`@pyreon/virtual`** | the virtualized backlog (1,000+ synced cards, only visible rows mounted) | `src/components/Backlog.tsx` |
| **`@pyreon/router`** | the room from the route (`/board/:id`, hash mode) | `src/app.tsx`, `src/routes/board.tsx` |
| **`@pyreon/query`** | the **server-owned** board list + a create mutation (the query-vs-sync ownership split) | `src/routes/board-list.tsx`, `src/api/boards.ts` |
| **`@pyreon/form` + `@pyreon/validation`** | the validated create-board form (Zod schema) | `src/routes/board-list.tsx` |
| **`@pyreon/permissions`** | the viewer/editor **UI** gate (the relay `authorize` is the real one) | `src/state/permissions.ts` |
| **`@pyreon/storage`** | **per-device** state — theme, your display name + color (NOT synced) | `src/state/identity.ts` |
| **`@pyreon/toast`** | connection-status notifications | `src/app.tsx`, `src/routes/board.tsx` |
| **`@pyreon/hooks`** | `useColorScheme` (default theme), `useInterval` (presence heartbeat) | `src/state/identity.ts`, `src/components/PresenceBar.tsx` |

### The two flagship integrations

**dnd ↔ syncedList.** `useSortable` feeds on a column's `syncedList` directly
(it's a `Signal<Card[]>`). A within-column reorder writes the whole list back
(`cards.set`); a cross-column move (shared `groupId`) uses **positional ops**
(`onCrossListReceive` inserts, `onCrossListDrop` deletes) so concurrent moves
merge. The per-card **→** button does the same move accessibly.

**@pyreon/code ↔ syncedText.** A CodeMirror editor bound to a `Y.Text` via
`bindEditorToSignal` — the editor buffer and the CRDT stay in lockstep (two
loop-guards compose: the binding's editor↔signal flags + syncedText's CRDT echo
guard), so a peer's keystrokes appear here, character-merged.

### Query vs sync — different sources of truth

The board **list** is server-owned (`@pyreon/query`, request/response). Each
board's **contents** are collaborative (`@pyreon/sync`, CRDT). They never share
the same data — query for the envelope, sync for the live contents.

## Honest limits

- **Presence is modeled as synced state** (a heartbeat list filtered on
  last-seen), not Yjs's ephemeral awareness protocol — because the relay brokers
  doc updates, not awareness. A crashed client fades out via the filter. A
  production app uses awareness (+ cursors).
- **Viewer/editor is a UI gate**, not security — the relay's `authorize` hook is
  the real enforcement (kept permissive here for a zero-setup local demo).
- **CRDTs prevent lost *updates*, not semantic conflicts** — concurrent title
  edits are last-writer-wins; concurrent notes keep both but can interleave.
- **The query backend is mocked** (no real server) — the point is the ownership
  split, not a backend.
- **SPA, no SSR** — local-first is client-centric; the synced doc lives on the
  client.

## Tests

`e2e/collab-board.spec.ts` (real Chromium, `bun run test:e2e:collab-board`) — 5
specs: cross-context **add / title / move** sync; **drag-reorder** syncs the new
order (the marquee `useSortable` → `syncedList` path); **collaborative notes**
(type in one client's CodeMirror, the other's reflects it); **offline
persistence** (a card survives reload via IndexedDB); **viewer mode** disables
editing. Two isolated browser contexts converge through the relay.
