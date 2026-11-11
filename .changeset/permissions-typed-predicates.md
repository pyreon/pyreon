---
'@pyreon/permissions': patch
---

A predicate that types its context, such as `(post: Post) => post.authorId === me().id`, is now accepted in `createPermissions`, `can.set` and `can.patch` under strict TypeScript. It used to fail with TS2322 because the predicate's parameter was checked against `unknown`. The predicate type is now bivariant in its context, like a DOM event handler.
