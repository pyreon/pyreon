---
"@pyreon/elements": patch
---

fix(elements): hover overlays are now keyboard-operable + accurate aria-haspopup

- `useOverlay` hover mode (`openOn`/`closeOn: 'hover'`) previously bound only
  `mouseenter`/`mouseleave` — a hover Tooltip/HoverCard could NEVER be opened
  by keyboard or assistive tech. `focusin`/`focusout` now mirror the mouse
  handlers 1:1 on both the trigger and the content (APG tooltip/hover-card +
  WCAG 1.4.13): focusing the trigger opens, Tab-ing into the content keeps it
  open, moving focus past the widget closes it after `hoverDelay`.
- `aria-haspopup` on the trigger is now type-accurate: `popover` advertises
  `'dialog'` (was the blanket `'menu'`, telling AT to expect menuitem semantics
  that never exist), `custom` omits it (the hook can't know the popup's
  semantics), `dropdown`/`modal`/`tooltip` unchanged (`'menu'`/`'dialog'`/
  omitted). An Overlay with no explicit `type` keeps `'menu'` (the documented
  `'dropdown'` default).
