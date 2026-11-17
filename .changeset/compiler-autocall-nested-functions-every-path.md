---
'@pyreon/compiler': patch
---

A bare signal inside a function nested in JSX is now read on every element, not only on template elements. `<Button onClick={() => count.set(count + 1)} />`, a childless `<div onClick={…} />`, a spread-carrying element, a function child of a component (`<Box>{() => count + 1}</Box>`), every SSR render and a rocketstyle-collapsed site used to keep `count` as the signal function, so the click stored the function's source text plus "1" and SSR printed the function instead of its value. They now compile to `count()` exactly as `<button>x</button>` always did, in both compiler backends. `count.set(…)`, the shorthand `{ count }`, assignment targets and shadowing parameters keep their meaning. To pass the signal itself from a handler (`subscribe(count)`), define that function outside the JSX.
