---
'@pyreon/runtime-server': patch
'@pyreon/compiler': patch
---

Server rendering now serialises props that have no attribute of the same name the way the browser stores them, instead of kebab-casing the name into an attribute nothing reads:

- On an `<input>`, `defaultValue` becomes `value` and `defaultChecked` becomes `checked`.
- On a `<textarea>`, `defaultValue` becomes the text content; `value` still wins when both are given.
- On a media element, `defaultMuted` becomes `muted`.
- Props that exist only as properties (`indeterminate`, `currentTime`, `playbackRate`, `volume`, `srcObject`) are no longer written into the HTML at all.

Before this, `<input defaultValue="x">` rendered `default-value="x"`, so the input was empty until hydration and stayed empty with JavaScript off. The compiled SSR path matches in both compiler backends.
