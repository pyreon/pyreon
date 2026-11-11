---
'@pyreon/hooks': patch
---

Android `<WebView>`: a form POST could still move the main frame to another origin after the first load, because Android never asks `shouldOverrideUrlLoading` about a POST. Every http(s) main-frame request now passes the same origin check (an off-origin one is answered with an empty 204 and the page stays). A bundled `src` containing a tab, CR, LF or other control character, or a leading or trailing space, is now refused: the URL parser deletes or trims those characters, so `.\t./x` loaded as `../x`. iOS refuses the same names so both hosts apply one rule.
