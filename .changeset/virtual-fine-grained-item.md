---
"@pyreon/virtual": minor
---

Add a fine-grained per-index `item(index)` accessor to `useVirtualizer` / `useWindowVirtualizer` — reactive `start` / `size` / `lane` signals for a single virtual row.

This fixes a correctness gap for **dynamically-measured lists** (`measureElement`): with a keyed `<For by={row => row.index}>`, a row that stays in the window is not re-rendered when a remeasure above it shifts its position, so the captured `row.start` went stale and the row was mispositioned. Read `item(row.index).start()` instead — the adapter updates these signals in place, so a staying row re-positions correctly while only the genuinely-moved rows patch the DOM. Fixed-size lists are unaffected (`start = index × size` is invariant) and can keep reading the captured `row.start`.

`item()` is zero-cost until first used, and each field (`start`/`size`/`lane`) is lazily allocated on first read and gated on numeric equality, so a fixed-size scroll fires none of the unchanged rows' signals.

Also adds an objective adapter head-to-head benchmark vs `@tanstack/react-virtual` (`bun run bench:react-virtual`) — both wrap the identical `@tanstack/virtual-core`, so the measured difference is purely the adapter.
