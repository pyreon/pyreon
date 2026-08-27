---
'@pyreon/kinetic-presets': patch
'@pyreon/native-compiler': patch
---

The preset pack's own documented form now animates on native

`kinetic(tag).preset(fadeUp)` — an identifier from `@pyreon/kinetic-presets`,
which is how the pack documents itself — fell through to the plain-container
decline, because the kinetic lowering accepted only a string literal. The
package's own example did not animate.

Named presets now resolve. The pack ships 123 and the native vocabulary has
seven, so the unambiguous names map (fade / fadeUp / fadeDown / fadeLeft /
fadeRight / slideUp / slideDown / slideLeft / slideRight / scaleIn / scale) and
everything else declines **by name**, saying which preset and what the native
vocabulary is.

Mapping the rest to the nearest motion would be worse than declining: a
`bounceIn` that silently plays a fade is a bug the author cannot see. The
diagonal (`fadeDownLeft`) and magnitude (`slideUpBig`) variants are unmapped for
the same reason — native has neither a diagonal nor a distance parameter, so a
mapping would drop half the intent without saying so.
