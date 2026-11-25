---
'@pyreon/cli': patch
---

`pyreon upgrade`'s `form-use-form-fields` codemod no longer leaves a now-unused `{ field }` binding behind on an import that also has a default binding: `import Form, { field } from '@pyreon/form'` becomes `import Form from '@pyreon/form'`. The eight codemods also share one TypeScript loader, so a project without `typescript` gets the same "install it" error naming the codemod that needed it.
