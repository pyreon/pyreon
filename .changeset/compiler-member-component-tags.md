---
'@pyreon/compiler': patch
---

A component referenced through a member tag (`<m.Chart data={props.data} />`, `<UI.Button {...rest} />`, `<Ctx.Provider>`, `<motion.div>`) now compiles like an identifier-bound component: props are `_pp` / `_rp` / `_rpd`, spreads keep their getters through `_wrapSpread`, and a sole template child is `_lc`-deferred. Before, such a prop arrived as an unbranded function. An identifier tag is a DOM element only when it starts with an ASCII lowercase letter, so `<_Foo>` / `<$Foo>` are components in both backends (the JS backend used to template `<_Foo>` as an element).
