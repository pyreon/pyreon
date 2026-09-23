---
'@pyreon/native-compiler': patch
---

An inline object type inside an `interface` or object `type` field now lowers to its own named struct on both targets. `interface Task { meta: { owner: string } }` used to emit a labelled tuple on Swift, which is not `Codable`, and `Any` on Kotlin, which does not compile once the body reads `task.meta.owner`. The shape is now declared as `TaskMeta`, and an array element as `TaskTagsItem`, named after its field path. A generated name that the file already declares is refused with a warning rather than reused.
