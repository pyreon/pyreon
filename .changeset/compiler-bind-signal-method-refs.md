---
'@pyreon/compiler': patch
'@pyreon/reactivity': patch
---

A signal's own method passed by reference inside JSX is now bound to its signal: `ref={el.set}`, `onInput={value.set}`, `onClick={count.update}`, `cb={sig?.trigger}` and `[1].forEach(count.set)` inside a handler compile to `el.set.bind(el)`, so they work instead of throwing. This applies to every element path, components, nested functions, client and SSR, and both backends. The `signal-method-reference` compiler warning is removed, because every form it reported now compiles correctly. A method the compiler cannot see belongs to a signal (`ref={props.sig.set}`, `promise.then(sig.set)`) still throws `[Pyreon] signal.set() was called without its signal` in dev. That message's examples now name those cases.
