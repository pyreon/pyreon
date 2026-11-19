---
'@pyreon/zero-content': patch
---

Search index loading no longer keeps the index alive after every `<Search>` unmounts. Before, a load that finished after the last subscriber released stored the whole MiniSearch again with nobody using it. A failed load is no longer cached either: the next search retries instead of failing until every `<Search>` unmounts. A slow load for an older catalog URL can no longer replace the current index.
