---
"@pyreon/native-router-swift": minor
"@pyreon/native-router-kotlin": minor
---

A custom-scheme deep link now keeps its host as the first route segment: `myapp://item/42` opens `/item/42` (it used to open `/42`, because the host was folded in only when the path was empty). A web link is unchanged: `https://example.com/item/42` still opens `/item/42`, since its host is the domain. This is a breaking change for an app that relied on a placeholder host, such as `pyreon://app/users/42` opening `/users/42`: that link now opens `/app/users/42`, so drop the placeholder (`pyreon://users/42`). Found by running a real link on a simulator; neither runtime had a test for the URL-to-path step, and both now do.
