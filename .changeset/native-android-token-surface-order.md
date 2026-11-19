---
'@pyreon/native-compiler': patch
---

On Android the token padding props (`padding`, `paddingX`, `paddingY`) now sit inside a `style` background, as on iOS and the web. Compose applies a modifier chain outside-in, and the token props led the chain, so `<Stack paddingX={4} style={{ backgroundColor, borderRadius }}>` drew a tight pill with a transparent margin on Android and a padded pill everywhere else. Same cause, also fixed: a token `background` with a token `padding` had the padding outside the fill, a token `radius` clipped after the token `background` (so the fill was never rounded), and a `style` `width` excluded the token padding. The tokens are now the innermost layer on Android (`.clip().background().padding()` after the `style` modifiers), the reverse of the Swift chain.
