# Paraglide bench fixture

`compiled/` is GENERATED output of the Paraglide compiler (a rival library), committed so the bench needs no build step. Do not edit it by hand; lint and code-quality findings in it describe third-party generated code. Regenerate from this directory:

```sh
bunx @inlang/paraglide-js@3.2.1 compile --project ./project.inlang \
  --outdir ./compiled --strategy globalVariable baseLocale \
  --is-server false --is-development false --output-structure locale-modules \
  --no-emit-readme --no-emit-git-ignore --no-emit-prettier-ignore --no-emit-ts-declarations
```

The arm that uses it is in `../i18n-rivals.ts`.
