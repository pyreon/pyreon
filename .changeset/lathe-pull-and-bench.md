---
'@pyreon/lathe': minor
---

`lathe pull <url>` fetches a remote spec into the repo, and `bun run bench` measures the generator's scaling.

**`pull` is a separate step on purpose.** The obvious design — let `input` be a URL and fetch during generation — makes output depend on a server's mood: two developers generate different clients from the same commit, `check` fails in CI for reasons nobody can reproduce, and an offline build stops working. So `pull` lands the spec on disk, you review the diff, and every later `generate` reads that file. The spec becomes a reviewable artifact rather than an invisible input — which is also what a contract diff needs, since it compares against a committed baseline.

It parses before it writes: a 200 carrying an HTML error page or a login redirect leaves an existing working spec untouched, rather than turning a transient network problem into a committed one.

**The bench answers a question that was previously unanswerable.** Lathe is LINEAR — a least-squares fit over four sizes and three dependency-graph shapes gives a `generate` exponent of 0.94–1.03 at R² 0.998–1.000 — and an 800-model / 1600-operation spec generates in ~25ms. The harness warms up, repeats, takes the median, reports inter-quartile spread, and refuses to state an exponent when the fit or the samples do not support one.
