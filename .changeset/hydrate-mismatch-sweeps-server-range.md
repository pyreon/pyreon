---
'@pyreon/runtime-dom': patch
---

A hydration mismatch inside a reactive accessor range now sweeps the server
DOM the client did not claim immediately, instead of leaving it until the
accessor's next run.

`adoptReactiveRange` hands the accessor's first render to `hydrateChild`,
which recovers a divergence (server `<ul>`, client `<p>`) by mounting the
client's render fresh and returning the cursor it stopped at. The server nodes
it did not consume stayed in the DOM until the accessor re-ran: a list whose
server query cache was warm and whose client cache was cold rendered its rows
on the server and its loading placeholder on the client, and kept BOTH on
screen for the whole fetch — countable rows with delete buttons carrying no
handler, past the point `data-pyreon-hydrated` was set. The unclaimed range is
now removed as part of the first render; adopted nodes (identity kept) and
freshly mounted nodes are untouched, and the accessor's own anchor is
excluded so later renders still land.
