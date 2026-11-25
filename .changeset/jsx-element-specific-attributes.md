---
'@pyreon/core': patch
---

JSX types: `<fieldset>` accepts `disabled` (a value or an accessor), `form` and `name`, and `<optgroup>` accepts `label` and `disabled` (#4823). An audit of the intrinsic-elements table against the HTML spec added the other missing element-specific attributes: `<output for form name>`, `<li value>`, `<colgroup span>`, `<base href target>`, `<style media>`, `<meta media>`, `<link sizes hreflang imageSrcSet imageSizes fetchPriority>`, `<script fetchPriority>`, `<img useMap isMap>`, `<source width height>`, `<track>`, `<embed>`, `<object>`, `<param>`, `<map>`, `<area>`, `<slot name>`, `<template shadowRootMode>`, `<details name>`, `<dialog closedBy>`, the `<input>` form-submission overrides and `dirName`, `autoComplete` on `<select>`/`<textarea>`, and `command`/`commandFor` on `<button>`. The global attributes `accessKey`, `autoFocus`, `nonce` and the microdata `item*` attributes are accepted on every element.
