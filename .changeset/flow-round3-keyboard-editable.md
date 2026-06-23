---
"@pyreon/flow": patch
---

Fix `<Flow>` keyboard shortcuts hijacking editable node fields. Only the
Delete/Backspace branch guarded against `INPUT`/`TEXTAREA` focus — so while
typing in an `<input>`/`<textarea>`/`<select>`/contenteditable element inside a
custom node, `Cmd/Ctrl+A` selected all NODES (not the text), `Cmd/Ctrl+C`
copied nodes, `Cmd/Ctrl+V` pasted nodes, and `Cmd/Ctrl+Z` undid the FLOW instead
of the field. `handleKeyDown` now bails for any editable target (covering
contentEditable too) before processing any shortcut; non-editable targets keep
all shortcuts. Real-Chromium regression test + bisect-verified.
