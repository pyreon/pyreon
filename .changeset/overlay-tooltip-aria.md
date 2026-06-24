---
"@pyreon/elements": minor
---

`<Overlay type="tooltip">` now wires the WAI-ARIA Tooltip pattern out of the box: the tooltip content carries `role="tooltip"` and a generated `id`, and the trigger gets `aria-describedby` pointing at it — so a screen reader reads the tip when the trigger is focused. Previously tooltip content had no role and there was no trigger↔content association (only `type: 'modal'` received a role), so the tip was invisible to assistive tech. Modal (`role="dialog"` + `aria-modal`) and dropdown/popover behavior is unchanged; the id is `createUniqueId()`-generated (SSR-safe, collision-free across instances).
