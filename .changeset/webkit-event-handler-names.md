---
'@pyreon/core': patch
'@pyreon/compiler': patch
---

SSR no longer serializes ten WebKit-only event-handler attributes (`onbeforeload`, `onorientationchange` and eight `onwebkit*` names). Chromium does not expose them, so the Chromium-run vocabulary ratchet never listed them in `EVENT_HANDLER_ATTRS`; WebKit compiles each into an inline handler, so a string-valued prop of that name reaching the server renderer (for example through a spread of user-keyed data) produced executable markup for Safari users. The client path was already safe — it asks the element which names are handlers. Both compiler backends' SSR fast-path sets are updated in lockstep.
