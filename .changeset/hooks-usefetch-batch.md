---
'@pyreon/hooks': patch
---

`useFetch` now batches its terminal state writes — the success handler (`data` + cleared `error` + `isPending=false`) and the error handler (`error` + `isPending=false`) each commit in a single notify cycle via `batch()`. Avoids an intermediate render where `data` is already set but `isPending` is still `true` (and the symmetric error case), and collapses 2–3 re-renders into one per settle. Behavior-preserving — the final state is identical.
