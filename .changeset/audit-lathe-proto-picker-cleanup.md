---
'@pyreon/router': patch
'@pyreon/lathe': patch
'@pyreon/hooks': patch
---

Three defects found auditing the changes since 0.51.0.

**`safeRedirectLocation` failed open to an open redirect and to `javascript:`
XSS.** The guard classified the RAW target while a browser classifies a
PREPROCESSED one, and the gap is one character wide. The WHATWG URL parser
strips leading/trailing C0 controls and space, and removes ALL ASCII tab and
newline from anywhere in the input; `String.prototype.trim()` covers the first
only partially and the second not at all, because that character sits in the
middle. So `"/<TAB>/evil.example"` was classified `internal` and resolves to
`https://evil.example/`, and `"java<TAB>script:alert(1)"` was classified
`internal` and resolves to a live `javascript:` URL — both verified against the
platform's own URL parser, which is the oracle the regression test uses. The
`internal` branch also returned the ORIGINAL string rather than the one it had
inspected, so even a correct verdict handed back bytes that produce a different
one. The target is now normalised the way the parser does, before classifying,
and the normalised value is what ships.

**`@pyreon/lathe`'s YAML reader replaced an object's prototype instead of
setting a key.** Both mapping paths assigned `map[key] = value`, and for
`__proto__` that runs the inherited accessor: the key vanishes from the parsed
document while its value's properties leak into every later member read on that
object. A spec reaches this parser over the network — `lathe pull <url>` fetches
one and writes it to disk — and the IR it produces is what the emitters turn
into source, so a silently-dropped field is a missing field in a generated
client and a silently-added one is a generator input nobody wrote. The `.json`
half of the same reader was always correct, because `JSON.parse` defines the
property rather than assigning it; the two formats disagreed about the same
document. Fixed by doing what `JSON.parse` does.

**The three file pickers leaked their `<input>` when neither `change` nor
`cancel` fired.** `useCamera` / `useFilePicker` / `useImagePicker` each appended
a hidden input to `document.body` and removed it inside `settle`, under a
comment promising that "a browser that fires neither event must not leak the
node". The `settled` flag cannot provide that: with no event `settle` never
runs, so neither does `input.remove()`, and the document then holds the node,
its listeners and the `resolve` closure for the life of the page — once per
pick, unbounded. `cancel` is the event that would have fired, and the same
comments describe it as "not universal across older browsers". The three
implementations were byte-identical and are now one helper, whose `onCleanup`
settles any pick still open when the component unmounts.
