---
'@pyreon/native-compiler': patch
---

The Android measure-time crash for a `<For>` under a vertical `<Scroll>` — a LazyColumn nested inside `Column(Modifier.verticalScroll())`, "measured with an infinity maximum height" — was warned about only when the `<For>` was a DIRECT child of the `<Scroll>`. One container down (`<Scroll><Stack><For/></Stack></Scroll>`) nests the identical LazyColumn under the identical scroller and throws the identical exception; depth is not something Compose consults. That shape crashed native-tasks' stats page on the emulator with no compile-time diagnostic, and the workaround comment on that page named this exact gap.

The warning now walks the whole subtree — through `<Stack>`, `<Inline>`, fragments, any non-scrolling container — and stops at a nested `<Scroll>`, which is its own boundary: a `<For>` under it is that scroll's legitimate, unwrapped idiom, not the outer scroller's hazard. The emit is unchanged; only the silence is gone.
