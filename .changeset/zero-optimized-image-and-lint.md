---
"@pyreon/zero": minor
"@pyreon/lint": minor
"@pyreon/mcp": patch
---

feat: `<OptimizedImage source={img} />` + `pyreon/no-discarded-optimize-fields` lint rule

Two complementary defenses against the #1 real-world CLS cause — pulling just
`hero.src` off a `?optimize` import onto a raw `<img>`, silently dropping
`width` / `height` / `srcset` / `placeholder` / `formats`.

- **`@pyreon/zero`**: new `<OptimizedImage source={hero} alt="…" />` — a one-prop
  form of `<Image>` that spreads the WHOLE `?optimize` descriptor, so no field
  can be forgotten. `<Image {...hero} />` still works; this removes the "did I
  remember every field?" step. Display props pass through alongside `source`.
- **`@pyreon/lint`**: new opt-in, `@pyreon/zero`-dep-gated frontend rule
  `pyreon/no-discarded-optimize-fields` flags `<img src={x.src}>` where `x` is a
  `?optimize` import, pointing at `<OptimizedImage>` / `<Image {...x}>`. Off in
  `recommended`/`strict`/`app`/`lib`; on in `best-practices`. (87 rules total.)
- `@pyreon/mcp`: api-reference regenerated from the updated manifests.

The audit also asked to "brand"/rename the `ProcessedImage` type — intentionally
skipped: the type is already named and the lint rule keys off the `?optimize`
import query, not the type name, so a rename would be churn with no detection gain.
