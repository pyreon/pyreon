---
'@pyreon/compiler': patch
---

Sole-dynamic-text-child templates bake a single-space text node INTO the template HTML and bind via `.firstChild`, instead of `document.createTextNode("") + appendChild` per template instantiation (per ROW under `<For>`). Within-tree paired benchmark (60 pooled samples/op, only the emit flipped): the create-1k gap vs Vanilla closes from +700µs to ZERO (Pyreon 9.30ms [9.20–9.40] = Vanilla 9.30ms), replace-all gap from +500µs to zero, append-1k→10k −1.2ms. Correct by construction: whitespace-only text survives innerHTML parsing in every element context (including table foster-parenting, which exempts whitespace-only runs), and every binding path writes the initial value synchronously at bind time, so the space never renders. Mixed-content keeps the comment+replaceChild shape (adjacent baked text runs would merge during parsing). Implemented byte-identically in both backends (JS + Rust native).
