---
'@pyreon/atlas': minor
---

Surface reactive-graph health in the Reactivity panel — orphan signals, accidental fan-out, deep derived chains.

`describeReactiveGraph` already derives three behavioural smells from the live graph; nothing showed them. The panel now does, most-actionable first, with each row saying what the smell COSTS rather than what it is ("one write drives many subscribers — the accidental-repaint shape", not "high-fanout: many subscribers").

Orphan signals sort first because they are the only kind that is usually a BUG rather than a cost: from the graph, state nothing reads is indistinguishable from a read that was SEVERED, and the severed case is the "UI silently never updates" class.

**Scoped to the component, which is the whole correctness of it.** The workbench and the preview share one reactivity instance — that is why this can be a client-side panel at all — so an unscoped read describes Atlas's own chrome (sidebar signals, theme, search box) as the component's smells. That would be worse than showing nothing: confidently wrong, about someone else's code, with no way for the reader to tell. A baseline is taken before the component mounts and only later nodes count; edges need both ends in scope. Bisect-verified — unscoped, the fixture's "chrome" orphan is reported as the component's.

Shown whenever a graph exists rather than gated on pressing Record: a smell is a property of the graph, not of a session, so requiring a recording to see an orphan would hide the one finding that is usually real.

**Deliberately rows, not a diagram.** #2517 §3 asked for the graph drawn via `@pyreon/flow`. The diagnostic value is the insights; a diagram of a healthy graph is a picture of nothing wrong at several times the cost, and on a real component the node count makes it unreadable exactly when it matters. The diagram stays a separate question rather than a hidden prerequisite.
