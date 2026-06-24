---
"@pyreon/elements": patch
---

`<Overlay type="tooltip">` no longer emits `aria-haspopup="true"` on the trigger. A tooltip is a description, not an interactive popup — the trigger associates with it via `aria-describedby` (added previously), and `aria-haspopup` is reserved for menu/listbox/tree/grid/dialog popups. Emitting both was contradictory; the trigger now correctly carries only `aria-describedby` per the WAI-ARIA Tooltip pattern. Modal (`aria-haspopup="dialog"`) and dropdown/popover (`aria-haspopup="menu"`) are unchanged.
