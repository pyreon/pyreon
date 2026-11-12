---
'@pyreon/compiler': patch
'@pyreon/runtime-server': patch
---

`innerHTML` (and the other props that are DOM properties without an attribute of the same name: `textContent`, `innerText`, `defaultValue`, `defaultChecked`, `defaultSelected`, `defaultMuted`, `currentTime`, `playbackRate`, `defaultPlaybackRate`, `volume`, `srcObject`, `httpEquiv`, `acceptCharset`) on an element inside a compiled template no longer becomes an attribute. The element is rendered through the h() path, so `innerHTML` is sanitized content as it is everywhere else. Server rendering writes `textContent` and `innerText` as the element's escaped content instead of a `text-content` attribute, matching the client.
